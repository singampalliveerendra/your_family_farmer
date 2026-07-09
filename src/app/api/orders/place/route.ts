import { createClient } from '@supabase/supabase-js'
import { randomInt } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { createGuestOrderToken } from '@/lib/guest-order-token'
import { getTierPrice } from '@/lib/pricing'
import { normalizePhone } from '@/lib/phone'
import { DELIVERY_FEE_RUPEES } from '@/lib/delivery-fee'
import { getPlatformFeePercent, computePlatformFee } from '@/lib/platform-fee'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// harvestId is present when the buyer ordered a specific harvest (the
// harvest-as-product path). Legacy produce-card orders omit it and draw from
// the listing's own stock.
// deliveryType is now chosen PER item at checkout (each harvest picks its own
// pickup vs delivery), so a single farmer order can mix both. Absent → falls
// back to the request-level deliveryType, then self_pickup.
type IncomingItem = {
  listingId: string
  harvestId?: string
  qty: number
  deliveryType?: 'self_pickup' | 'home_delivery'
}

// Pragmatic email check — we only need to reject obvious junk, not enforce
// RFC 5322. The real signal is whether the buyer can be reached.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 4-digit handover code, generated server-side at order placement. The
// customer reads it off their order page to whoever hands over the goods —
// the rider (home delivery) or the farmer (self-pickup) — who confirms it in
// their dashboard. crypto.randomInt avoids Math.random's predictability.
function generateHandoverOtp(): string {
  return String(randomInt(0, 10000)).padStart(4, '0')
}

type ListingRow = {
  id: string
  name: string
  unit: string | null
  stock_qty: number | null
  status: string | null
  farmer_id: string
  price_tier_1_qty: number | null
  price_tier_1_price: number | null
  price_tier_2_qty: number | null
  price_tier_2_price: number | null
  price_tier_3_price: number | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  // No session is fine — guests may check out by providing name, email,
  // mobile, and address below (see the `guest` branch).
  const session = getConsumerSessionFromRequest(req)

  const body = await req.json().catch(() => null) as
    | {
        farmerId?: string
        paymentMethod?: string
        pickupLocation?: string | null
        items?: IncomingItem[]
        deliveryType?: string
        deliveryAddress?: string | null
        deliveryCity?: string | null
        deliveryLandmark?: string | null
        deliveryPincode?: string | null
        deliveryAltPhone?: string | null
        idempotencyKey?: string | null
        guest?: { name?: string; email?: string; phone?: string } | null
      }
    | null

  if (!body) return bad('Invalid request body.')
  const { farmerId, paymentMethod, pickupLocation, items } = body
  // Optional idempotency key (a client-generated UUID per checkout attempt).
  const idempotencyKey = typeof body.idempotencyKey === 'string' && UUID_RE.test(body.idempotencyKey)
    ? body.idempotencyKey
    : null

  if (!farmerId || !UUID_RE.test(farmerId)) return bad('Invalid farmer.')
  if (paymentMethod !== 'upi' && paymentMethod !== 'cod' && paymentMethod !== 'razorpay') {
    return bad('Invalid payment method.')
  }
  if (!Array.isArray(items) || items.length === 0) return bad('Cart is empty.')
  if (items.length > 50) return bad('Too many items.')
  for (const it of items) {
    if (!it || typeof it !== 'object') return bad('Invalid item.')
    if (!it.listingId || !UUID_RE.test(it.listingId)) return bad('Invalid listing id.')
    if (it.harvestId != null && !UUID_RE.test(it.harvestId)) return bad('Invalid harvest id.')
    if (!Number.isFinite(it.qty) || it.qty <= 0 || it.qty > 10000) return bad('Invalid quantity.')
  }

  // Guest checkout: no session, so the buyer's identity comes from the request.
  // We still never trust the client for prices or stock — only for who they are.
  const isGuest = !session
  let guestName: string | null = null
  let guestEmail: string | null = null
  let guestPhone: string | null = null
  if (isGuest) {
    guestName = String(body.guest?.name ?? '').trim().slice(0, 80)
    guestEmail = String(body.guest?.email ?? '').trim().toLowerCase().slice(0, 200)
    guestPhone = normalizePhone(body.guest?.phone)
    if (!guestName) return bad('Please enter your name.')
    if (!EMAIL_RE.test(guestEmail)) return bad('Enter a valid email address.')
    if (!guestPhone) return bad('Enter a valid 10-digit mobile number.')
  }

  // self_pickup → buyer collects from the farm; home_delivery → our rider
  // brings it; courier → the farmer ships it themselves. Both delivery kinds
  // need a destination address.
  //
  // Delivery type is chosen PER item now (each harvest picks pickup vs
  // delivery), so one farmer order can mix both. `bodyDeliveryType` is the
  // request-level fallback for legacy/absent per-item values; per-item only
  // carries self_pickup/home_delivery, courier stays a request-level fallback.
  const bodyDeliveryType =
    body.deliveryType === 'home_delivery' ? 'home_delivery'
    : body.deliveryType === 'courier' ? 'courier'
    : 'self_pickup'
  const rowDeliveryTypeOf = (it: IncomingItem): 'self_pickup' | 'home_delivery' | 'courier' =>
    it.deliveryType === 'home_delivery' ? 'home_delivery'
    : it.deliveryType === 'self_pickup' ? 'self_pickup'
    : bodyDeliveryType
  // The address form is required as soon as ANY item ships (home delivery or
  // courier). We validate it once here for the whole batch.
  const anyDelivery = items.some((it) => rowDeliveryTypeOf(it) !== 'self_pickup')
  const needsAddress = anyDelivery
  let deliveryAddress: string | null = null
  let deliveryCity: string | null = null
  let deliveryLandmark: string | null = null
  let deliveryPincode: string | null = null
  let deliveryAltPhone: string | null = null

  if (needsAddress) {
    deliveryAddress = String(body.deliveryAddress ?? '').trim().slice(0, 400)
    deliveryCity = String(body.deliveryCity ?? '').trim().slice(0, 100) || null
    deliveryLandmark = String(body.deliveryLandmark ?? '').trim().slice(0, 200) || null
    const rawPincode = String(body.deliveryPincode ?? '').trim()
    deliveryPincode = /^\d{6}$/.test(rawPincode) ? rawPincode : null
    const altPhone = normalizePhone(body.deliveryAltPhone)
    deliveryAltPhone = altPhone || null

    if (!deliveryAddress) return bad('Enter your delivery address.')
    if (deliveryAddress.length < 10) return bad('Delivery address looks too short. Please add door no, street, and area.')
    if (!deliveryCity) return bad('Enter your city or town.')
    if (!deliveryPincode) return bad('Enter a valid 6-digit pincode.')
  } else if (isGuest) {
    // Guests must always give an address, even for self-pickup, so the farmer
    // has a contact/record on file. We store it in delivery_address.
    deliveryAddress = String(body.deliveryAddress ?? '').trim().slice(0, 400)
    if (!deliveryAddress) return bad('Enter your address.')
    if (deliveryAddress.length < 10) return bad('Address looks too short. Please add door no, street, and area.')
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Resolve the authoritative buyer. For accounts we read name/phone from the
  // DB (never the client); for guests we use the values validated above and
  // leave consumer_id NULL.
  let buyerId: string | null = null
  let buyerName: string
  let buyerPhone: string
  let buyerEmail: string | null = null
  if (session) {
    const { data: consumer } = await supabase
      .from('consumers_auth')
      .select('id, name, phone')
      .eq('id', session.consumerId)
      .maybeSingle()
    if (!consumer) return bad('Account not found. Please log in again.', 401)
    buyerId = consumer.id
    buyerName = consumer.name || 'Buyer'
    buyerPhone = consumer.phone
  } else {
    buyerName = guestName || 'Buyer'
    buyerPhone = guestPhone!
    buyerEmail = guestEmail
  }

  // Idempotency: if this checkout attempt was already saved (double-tap or a
  // retry after a lost response), return the existing rows instead of placing
  // a second order and decrementing stock again. Guest orders have no
  // consumer_id, so we match on the (random UUID) key alone for them.
  if (idempotencyKey) {
    let existingQuery = supabase
      .from('orders')
      .select('id, order_code, total_price, delivery_fee')
      .eq('idempotency_key', idempotencyKey)
    existingQuery = buyerId
      ? existingQuery.eq('consumer_id', buyerId)
      : existingQuery.is('consumer_id', null)
    const { data: existing } = await existingQuery
    if (existing && existing.length > 0) {
      const existingTotal = existing.reduce((s, o) => s + (Number(o.total_price) || 0), 0)
      const existingFee = existing.reduce((s, o) => s + (Number(o.delivery_fee) || 0), 0)
      const existingIds = existing.map((r) => r.id)
      return NextResponse.json({
        ok: true,
        orderIds: existingIds,
        orderCodes: existing.map((r) => (r as { order_code?: string | null }).order_code).filter(Boolean),
        total: existingTotal,
        deliveryFee: existingFee,
        grandTotal: existingTotal + existingFee,
        deduplicated: true,
        ...(isGuest ? { guestToken: createGuestOrderToken(existingIds) } : {}),
      })
    }
  }

  // Farmer COD acceptance check
  const { data: farmer } = await supabase
    .from('farmers')
    .select('id, cod_enabled')
    .eq('id', farmerId)
    .maybeSingle()

  if (!farmer) return bad('Farmer not found.', 404)
  if (paymentMethod === 'cod' && farmer.cod_enabled !== true) {
    return bad('This farmer is not accepting Cash on Delivery.')
  }

  // Pull live listing rows — never trust prices from the client cart
  const listingIds = items.map((i) => i.listingId)
  const { data: listings } = await supabase
    .from('produce_listings')
    .select(
      'id, name, unit, stock_qty, status, farmer_id, price_tier_1_qty, price_tier_1_price, price_tier_2_qty, price_tier_2_price, price_tier_3_price',
    )
    .in('id', listingIds) as { data: ListingRow[] | null }

  if (!listings || listings.length !== listingIds.length) {
    return bad('One or more items in your cart are no longer available.')
  }

  const listingById = new Map(listings.map((l) => [l.id, l]))

  // Harvest-as-product: when a line names a harvest, we sell that harvest's own
  // stock (harvests.stock_qty), not the listing's. Pull the referenced harvests
  // and check each still belongs to its listing (and thus the farmer). Price,
  // name and unit still come from the produce_listing template.
  const harvestIds = [...new Set(items.map((i) => i.harvestId).filter(Boolean))] as string[]
  const harvestById = new Map<string, { id: string; produce_listing_id: string; stock_qty: number | null }>()
  if (harvestIds.length > 0) {
    const { data: harvestRows } = await supabase
      .from('harvests')
      .select('id, produce_listing_id, stock_qty')
      .in('id', harvestIds) as { data: Array<{ id: string; produce_listing_id: string; stock_qty: number | null }> | null }
    if (!harvestRows || harvestRows.length !== harvestIds.length) {
      return bad('One or more harvests in your cart are no longer available.')
    }
    for (const h of harvestRows) harvestById.set(h.id, h)
  }

  const rows: Array<Record<string, unknown>> = []
  let total = 0
  // One OTP for the whole batch. Home delivery: the rider does a single
  // handover at the door. Self-pickup: the customer reads it to the farmer at
  // collection. Either way the whole checkout shares one code.
  const sharedHandoverOtp = generateHandoverOtp()
  // One delivery fee per cart, charged when at least one item is home delivery
  // (our rider). Stamped on the first home-delivery row below.
  const anyHomeDelivery = items.some((it) => rowDeliveryTypeOf(it) === 'home_delivery')
  const deliveryFee = anyHomeDelivery ? DELIVERY_FEE_RUPEES : 0

  // Validate first (price + ownership) before we touch any stock. Stock
  // claims happen below with the RPC so two cart submits can't oversell.
  for (const item of items) {
    const listing = listingById.get(item.listingId)
    if (!listing) return bad('Item missing.')
    if (listing.farmer_id !== farmerId) return bad('Items must belong to the same farmer.')
    // Block ordering a listing the farmer (or moderator) has taken down. A
    // stale cart could still hold a since-paused/suspended item; only
    // 'available' produce may be purchased.
    if (listing.status !== 'available') {
      return bad(`${listing.name} is no longer available.`)
    }

    // A harvest line must reference a harvest of this very listing.
    if (item.harvestId) {
      const harvest = harvestById.get(item.harvestId)
      if (!harvest || harvest.produce_listing_id !== listing.id) {
        return bad(`${listing.name} is no longer available.`)
      }
    }

    const unitPrice = getTierPrice(item.qty, {
      priceTier1Qty: listing.price_tier_1_qty,
      priceTier1Price: listing.price_tier_1_price,
      priceTier2Qty: listing.price_tier_2_qty,
      priceTier2Price: listing.price_tier_2_price,
      priceTier3Price: listing.price_tier_3_price,
    })

    const linePrice = unitPrice != null ? Math.round(unitPrice * item.qty) : null
    if (linePrice == null || linePrice <= 0) {
      return bad(`Price not set for ${listing.name}. Please ask the farmer.`)
    }
    total += linePrice

    // Each item carries its own fulfillment. Address fields live only on rows
    // that ship (home delivery / courier); the pickup point lives only on
    // pickup rows. Guests always keep their address on every row as the
    // farmer's contact record, even for pickup.
    const rowDeliveryType = rowDeliveryTypeOf(item)
    const rowShips = rowDeliveryType === 'home_delivery' || rowDeliveryType === 'courier'

    rows.push({
      farmer_id: farmerId,
      produce_listing_id: listing.id,
      produce_name: listing.name,
      quantity: item.qty,
      unit: listing.unit || 'kg',
      total_price: linePrice,
      buyer_name: buyerName,
      buyer_phone: buyerPhone,
      buyer_email: buyerEmail,
      consumer_id: buyerId,
      idempotency_key: idempotencyKey,
      pickup_location: rowDeliveryType === 'self_pickup' && typeof pickupLocation === 'string'
        ? pickupLocation.slice(0, 200)
        : null,
      status: 'pending',
      payment_method: paymentMethod,
      payment_status: 'pending',
      delivery_type: rowDeliveryType,
      delivery_status: rowDeliveryType === 'home_delivery' ? 'unassigned' : null,
      delivery_address: rowShips ? deliveryAddress : (isGuest ? deliveryAddress : null),
      delivery_city: rowShips ? deliveryCity : null,
      delivery_landmark: rowShips ? deliveryLandmark : null,
      delivery_pincode: rowShips ? deliveryPincode : null,
      delivery_alt_phone: rowShips ? deliveryAltPhone : null,
      handover_otp: sharedHandoverOtp,
      // Fee is paid once per cart, so we stamp it on the first row only.
      // sum(delivery_fee) and sum(rider_payout) over a batch === one fee.
      delivery_fee: 0,
      rider_payout: 0,
    })
  }

  if (deliveryFee > 0) {
    // Stamp the single per-cart fee on the first home-delivery row (rows[0] may
    // be a pickup row now that types are mixed per item).
    const feeRow = rows.find((r) => r.delivery_type === 'home_delivery')
    if (feeRow) {
      feeRow.delivery_fee = deliveryFee
      feeRow.rider_payout = deliveryFee
    }
  }

  // Harvest-as-product: record which harvest each line sold. rows are built 1:1
  // with items in loop order, so rows[i] matches items[i]. Only stamped when the
  // cart actually references harvests — a legacy produce-only checkout never
  // touches the column before its migration runs — and when it is, every row
  // carries it (null where absent) so the bulk insert has a uniform column set.
  if (harvestIds.length > 0) {
    items.forEach((it, i) => { if (rows[i]) rows[i].harvest_id = it.harvestId ?? null })
  }

  // Platform fee (moderator commission) — a % charged PER ITEM and stamped on
  // each row (unlike delivery_fee, which is one-per-cart on the first row). Per
  // row means a single-item cancel/decline withholds or refunds exactly that
  // item's own fee, and the per-item fees the buyer sees at checkout sum to what
  // we charge. Resolved server-side; 0 unless the moderator set a fee. Only
  // touched when a fee applies, so the column is never referenced before its
  // migration runs — and when it is, every row in the batch carries it (even 0)
  // so the bulk insert has a uniform column set.
  const feePercent = await getPlatformFeePercent(supabase)
  let platformFee = 0
  if (feePercent > 0) {
    for (const r of rows) {
      const fee = computePlatformFee(Number(r.total_price) || 0, feePercent)
      r.platform_fee = fee
      platformFee += fee
    }
  }

  // Atomic stock claim. decrement_stock returns false if the listing went
  // below zero (or vanished). On any failure we revert prior claims so we
  // don't leak inventory.
  // A claim is against a harvest (harvest-as-product) or, for legacy produce-
  // card lines, the listing itself. We revert with the matching increment RPC.
  const claimed: Array<{ harvestId?: string; listingId: string; qty: number }> = []
  const revertClaims = async () => {
    for (const c of claimed) {
      try {
        if (c.harvestId) {
          await supabase.rpc('increment_harvest_stock', { p_harvest_id: c.harvestId, p_qty: c.qty })
        } else {
          await supabase.rpc('increment_stock', { p_listing_id: c.listingId, p_qty: c.qty })
        }
      } catch (e) {
        console.error('[YFF] stock revert failed:', e)
      }
    }
  }
  for (const item of items) {
    const listing = listingById.get(item.listingId)!
    const { data: ok, error: rpcErr } = item.harvestId
      ? await supabase.rpc('decrement_harvest_stock', { p_harvest_id: item.harvestId, p_qty: item.qty })
      : await supabase.rpc('decrement_stock', { p_listing_id: item.listingId, p_qty: item.qty })
    if (rpcErr) {
      console.error('[YFF] decrement stock rpc failed:', rpcErr.message)
      await revertClaims()
      return bad('Could not place order. Please try again.', 500)
    }
    if (!ok) {
      await revertClaims()
      return bad(`${listing.name} just sold out. Please reduce the quantity and try again.`)
    }
    claimed.push({ harvestId: item.harvestId, listingId: item.listingId, qty: item.qty })
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('orders')
    .insert(rows)
    .select('id, order_code')

  if (insertErr || !inserted) {
    console.error('[YFF] place-order insert failed:', insertErr?.message)
    // Roll the stock back so the row isn't lost.
    await revertClaims()
    return bad('Could not place order. Please try again.', 500)
  }

  const orderIds = inserted.map((r) => r.id)
  return NextResponse.json({
    ok: true,
    orderIds,
    orderCodes: inserted.map((r) => (r as { order_code?: string | null }).order_code).filter(Boolean),
    total,
    deliveryFee,
    platformFee,
    grandTotal: total + deliveryFee + platformFee,
    // Guests get a short-lived token bound to these orders so they can finish
    // the Razorpay create/verify pair without a session cookie.
    ...(isGuest ? { guestToken: createGuestOrderToken(orderIds) } : {}),
  })
}

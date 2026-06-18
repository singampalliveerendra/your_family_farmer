import { createClient } from '@supabase/supabase-js'
import { randomInt } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { createGuestOrderToken } from '@/lib/guest-order-token'
import { getTierPrice } from '@/lib/pricing'
import { normalizePhone } from '@/lib/phone'
import { DELIVERY_FEE_RUPEES } from '@/lib/delivery-fee'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type IncomingItem = { listingId: string; qty: number }

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
  const deliveryType =
    body.deliveryType === 'home_delivery' ? 'home_delivery'
    : body.deliveryType === 'courier' ? 'courier'
    : 'self_pickup'
  const needsAddress = deliveryType === 'home_delivery' || deliveryType === 'courier'
  let deliveryAddress: string | null = null
  let deliveryLandmark: string | null = null
  let deliveryPincode: string | null = null
  let deliveryAltPhone: string | null = null

  if (needsAddress) {
    deliveryAddress = String(body.deliveryAddress ?? '').trim().slice(0, 400)
    deliveryLandmark = String(body.deliveryLandmark ?? '').trim().slice(0, 200) || null
    const rawPincode = String(body.deliveryPincode ?? '').trim()
    deliveryPincode = /^\d{6}$/.test(rawPincode) ? rawPincode : null
    const altPhone = normalizePhone(body.deliveryAltPhone)
    deliveryAltPhone = altPhone || null

    if (!deliveryAddress) return bad('Enter your delivery address.')
    if (deliveryAddress.length < 10) return bad('Delivery address looks too short. Please add door no, street, and area.')
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
  const rows: Array<Record<string, unknown>> = []
  let total = 0
  // One OTP for the whole batch. Home delivery: the rider does a single
  // handover at the door. Self-pickup: the customer reads it to the farmer at
  // collection. Either way the whole checkout shares one code.
  const sharedHandoverOtp = generateHandoverOtp()
  const deliveryFee = deliveryType === 'home_delivery' ? DELIVERY_FEE_RUPEES : 0

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
      pickup_location: typeof pickupLocation === 'string' ? pickupLocation.slice(0, 200) : null,
      status: 'pending',
      payment_method: paymentMethod,
      payment_status: 'pending',
      delivery_type: deliveryType,
      delivery_status: deliveryType === 'home_delivery' ? 'unassigned' : null,
      delivery_address: deliveryAddress,
      delivery_landmark: deliveryLandmark,
      delivery_pincode: deliveryPincode,
      delivery_alt_phone: deliveryAltPhone,
      handover_otp: sharedHandoverOtp,
      // Fee is paid once per cart, so we stamp it on the first row only.
      // sum(delivery_fee) and sum(rider_payout) over a batch === one fee.
      delivery_fee: 0,
      rider_payout: 0,
    })
  }

  if (rows.length > 0 && deliveryFee > 0) {
    rows[0].delivery_fee = deliveryFee
    rows[0].rider_payout = deliveryFee
  }

  // Atomic stock claim. decrement_stock returns false if the listing went
  // below zero (or vanished). On any failure we revert prior claims so we
  // don't leak inventory.
  const claimed: Array<{ listingId: string; qty: number }> = []
  const revertClaims = async () => {
    for (const c of claimed) {
      try {
        await supabase.rpc('increment_stock', { p_listing_id: c.listingId, p_qty: c.qty })
      } catch (e) {
        console.error('[YFF] increment_stock revert failed:', e)
      }
    }
  }
  for (const item of items) {
    const listing = listingById.get(item.listingId)!
    const { data: ok, error: rpcErr } = await supabase.rpc('decrement_stock', {
      p_listing_id: item.listingId,
      p_qty: item.qty,
    })
    if (rpcErr) {
      console.error('[YFF] decrement_stock rpc failed:', rpcErr.message)
      await revertClaims()
      return bad('Could not place order. Please try again.', 500)
    }
    if (!ok) {
      await revertClaims()
      return bad(`${listing.name} just sold out. Please reduce the quantity and try again.`)
    }
    claimed.push({ listingId: item.listingId, qty: item.qty })
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
    grandTotal: total + deliveryFee,
    // Guests get a short-lived token bound to these orders so they can finish
    // the Razorpay create/verify pair without a session cookie.
    ...(isGuest ? { guestToken: createGuestOrderToken(orderIds) } : {}),
  })
}

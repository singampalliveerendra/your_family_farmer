import { createClient } from '@supabase/supabase-js'
import { randomInt } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { createGuestOrderToken } from '@/lib/guest-order-token'
import { getTierPrice } from '@/lib/pricing'
import { normalizePhone } from '@/lib/phone'
import { isSelfOrder } from '@/lib/sellerBuyerLink'
import { isMissingColumnError } from '@/lib/missingColumn'
import { preorderExpectedDate } from '@/lib/harvestSchedule'
import { getDeliveryCharges, resolveBatchDeliveryFee } from '@/lib/delivery-fee'
import { getPlatformFeePercent, computePlatformFee } from '@/lib/platform-fee'
import { getCodDepositPercent, computeCodSplit } from '@/lib/cod'
import { ORDERABLE_STATUSES } from '@/lib/produceStatus'
import { normalizePickupPhones } from '@/lib/pickup-slots'
import { rateLimit } from '@/lib/rate-limit'

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
  // The buyer saw "this harvest is finished, the next one is expected <date>"
  // and chose to wait. Consent ONLY — it never creates a pre-order on its own:
  // the stock claim below still runs, and a line that claims successfully is an
  // ordinary order however this flag is set. A crafted request can therefore
  // not turn an in-stock purchase into a pre-order, or conjure one where the
  // buyer never agreed to wait.
  preorder?: boolean
  // The date they were shown, echoed back so the farmer sees the promise that
  // was actually made. Display-only and bounds-checked below; the buyer can
  // only mis-date their own order, and the farmer approves or declines it
  // either way.
  preorderExpectedDate?: string
}

// Pragmatic email check — we only need to reject obvious junk, not enforce
// RFC 5322. The real signal is whether the buyer can be reached.
import { normalizeStep, snapToStep, roundQty, formatQty } from '@/lib/saleStep'

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
  sale_step: number | null
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
        pickupPhone?: string | null
        items?: IncomingItem[]
        deliveryType?: string
        deliveryAddress?: string | null
        deliveryCity?: string | null
        deliveryLandmark?: string | null
        deliveryPincode?: string | null
        deliveryAltPhone?: string | null
        idempotencyKey?: string | null
        // Multi-farmer checkout: a shared id linking this farmer's batch to the
        // other farmers' batches.
        //
        // deliveryChargeApplies is a HINT only — it can turn the delivery charge
        // on but never off (see the fee computation below). deliveryFarmerIndex
        // is accepted for backward compatibility with deployed clients and then
        // ignored: which batch carries the base charge is decided from the
        // sibling rows, not from what the caller claims its position is.
        checkoutId?: string | null
        deliveryChargeApplies?: boolean
        deliveryFarmerIndex?: number
        guest?: { name?: string; email?: string; phone?: string } | null
      }
    | null

  // Throttle placement. This route claims stock, so an unauthenticated loop can
  // zero out a farmer's inventory without ever paying — and guest checkout makes
  // it reachable with no account at all. Generous enough that a real buyer
  // checking out from several farmers in one session never sees it.
  const placeIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`place:ip:${placeIp}`, 30, 10 * 60 * 1000)) {
    return bad('Too many orders from this connection. Please wait a few minutes.', 429)
  }

  if (!body) return bad('Invalid request body.')
  const { farmerId, paymentMethod, pickupLocation, items } = body
  // Optional idempotency key (a client-generated UUID per checkout attempt).
  const idempotencyKey = typeof body.idempotencyKey === 'string' && UUID_RE.test(body.idempotencyKey)
    ? body.idempotencyKey
    : null
  // Shared checkout id linking this farmer's batch to the other farmers' batches
  // of the same multi-farmer checkout. Optional (legacy clients omit it).
  const checkoutId = typeof body.checkoutId === 'string' && UUID_RE.test(body.checkoutId)
    ? body.checkoutId
    : null
  // The client's view of whether the delivery charge applies across the whole
  // cart. Honoured only as a way to turn the charge ON — see the fee
  // computation below for why a `false` here is never taken at face value.
  const deliveryChargeApplies = body.deliveryChargeApplies === true

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

  // Optional contact for the pickup point. Stamped on self-pickup rows only
  // (below), and dropped rather than rejected if it isn't a usable number —
  // it's a convenience for the farmer, never a reason to fail a paid checkout.
  const pickupPhone = normalizePhone(body.pickupPhone) || null

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
    .select('id, phone, cod_enabled, pickup_location_phones')
    .eq('id', farmerId)
    .maybeSingle()

  if (!farmer) return bad('Farmer not found.', 404)

  // A seller in buyer view is one tap from their own listing — previewing it is
  // the point — so an accidental order against themselves is easy and would be
  // entirely real. Refuse it here, where every checkout path passes.
  if (isSelfOrder(buyerPhone, farmer.phone)) {
    return bad('This is your own listing. You cannot place an order with yourself.')
  }
  if (paymentMethod === 'cod' && farmer.cod_enabled !== true) {
    return bad('This farmer is not accepting Cash on Delivery.')
  }

  // The chosen pickup point's contact number, looked up in the farmer's
  // per-location map. Null when the farmer never set one for that point.
  const pickupLocationPhone = typeof pickupLocation === 'string'
    ? (normalizePickupPhones(farmer.pickup_location_phones)[pickupLocation] ?? null)
    : null

  // Pull live listing rows — never trust prices from the client cart
  const listingIds = items.map((i) => i.listingId)
  const { data: listings } = await supabase
    .from('produce_listings')
    .select(
      'id, name, unit, stock_qty, status, farmer_id, sale_step, price_tier_1_qty, price_tier_1_price, price_tier_2_qty, price_tier_2_price, price_tier_3_price',
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
      // A paused harvest is filtered out here rather than checked later, so the
      // count test below rejects it exactly like a deleted one — a cart held
      // open across a pause must not be able to place the order.
      .select('id, produce_listing_id, stock_qty')
      .eq('paused', false)
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
  // This farmer's share of the checkout's single delivery charge. The whole
  // checkout is charged base + extra × (farmers − 1); we collect it across the
  // farmers' separate batches by stamping `base` on the first farmer and `extra`
  // on each additional one. `deliveryChargeApplies` is the whole-cart gate (does
  // ANY line, at any farmer, ship by our rider). When a single farmer checks out
  // the old way (no checkoutId sent), we fall back to that farmer's own lines.
  const { base: deliveryBase, extra: deliveryExtra } = await getDeliveryCharges(supabase)
  const anyHomeDelivery = items.some((it) => rowDeliveryTypeOf(it) === 'home_delivery')

  // Everything else in this route recomputes from the database rather than
  // trusting the client (prices from produce_listings, buyer from
  // consumers_auth, stock from the claim RPC). The delivery fee used to be the
  // exception: the gate was just `body.deliveryChargeApplies`, so posting
  // `deliveryChargeApplies: false` alongside home_delivery items bought free
  // delivery, and `deliveryFarmerIndex: 1` bought the cheaper "extra" rate on a
  // batch that should have carried "base".
  //
  // The decision now lives in resolveBatchDeliveryFee (src/lib/delivery-fee.ts),
  // which is pure and unit-tested; read the rule there. All this route does is
  // feed it server-derived facts.
  let siblingCount = 0
  let siblingHomeDelivery = false
  if (checkoutId) {
    const { data: siblings } = await supabase
      .from('orders')
      .select('delivery_type')
      .eq('checkout_id', checkoutId)
    siblingCount = siblings?.length ?? 0
    siblingHomeDelivery = (siblings ?? []).some((r) => r.delivery_type === 'home_delivery')
  }

  const deliveryFee = resolveBatchDeliveryFee({
    charges: { base: deliveryBase, extra: deliveryExtra },
    batchHomeDelivery: anyHomeDelivery,
    siblingHomeDelivery,
    siblingCount,
    hasCheckoutId: !!checkoutId,
    clientChargeApplies: deliveryChargeApplies,
  })

  // Validate first (price + ownership) before we touch any stock. Stock
  // claims happen below with the RPC so two cart submits can't oversell.
  for (const item of items) {
    const listing = listingById.get(item.listingId)
    if (!listing) return bad('Item missing.')
    if (listing.farmer_id !== farmerId) return bad('Items must belong to the same farmer.')
    // Block ordering a listing the farmer (or moderator) has taken down — a
    // stale cart could still hold a since-paused/suspended item. 'sold_out' is
    // NOT a takedown: it mirrors the template's own stock, while a harvest line
    // is backed by the harvest's separate stock. Quantity is settled by the
    // stock-claim RPC below, which rejects an empty listing anyway, so this
    // check only guards availability-by-decision.
    if (!listing.status || !ORDERABLE_STATUSES.includes(listing.status)) {
      return bad(`${listing.name} is no longer available.`)
    }

    // A harvest line must reference a harvest of this very listing.
    if (item.harvestId) {
      const harvest = harvestById.get(item.harvestId)
      if (!harvest || harvest.produce_listing_id !== listing.id) {
        return bad(`${listing.name} is no longer available.`)
      }
    }

    // The step is the farmer's, so it is enforced here and not only in the UI:
    // a crafted request must not be able to order 0.137 kg of something nobody
    // can weigh out. Every offered step divides 1 evenly, so quantities from
    // carts saved before this feature existed are still on the grid.
    const step = normalizeStep(listing.sale_step, listing.unit)
    if (snapToStep(item.qty, step) !== roundQty(item.qty)) {
      return bad(`${listing.name} is sold in multiples of ${formatQty(step)} ${listing.unit || 'kg'}.`)
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
      pickup_phone: rowDeliveryType === 'self_pickup' ? pickupPhone : null,
      // Snapshot of the pickup point's own contact number, resolved from the
      // farmer's record rather than the client body — the cart is never
      // trusted for anything the buyer will be shown as fact. Frozen at order
      // time so a later edit can't rewrite what the buyer was told to call.
      pickup_location_phone: rowDeliveryType === 'self_pickup' ? pickupLocationPhone : null,
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
      // Links this row to the other farmers' batches of the same checkout, so
      // decline/cancel can count the remaining farmers and refund the delivery
      // drop. NULL for single-farmer legacy checkouts.
      checkout_id: checkoutId,
      // This farmer's delivery share is stamped on one row below (0 elsewhere).
      // sum(delivery_fee) over a batch === this farmer's share of the charge.
      delivery_fee: 0,
      delivery_fee_refunded: 0,
      rider_payout: 0,
    })
  }

  if (deliveryFee > 0) {
    // Stamp this farmer's delivery share on one row. Prefer a home-delivery row
    // (the rider earns it as rider_payout); but with "every farmer counts",
    // a pickup-only farmer in a delivery checkout still owes `extra`, so fall
    // back to the first row — with no rider_payout, since no rider serves it.
    const deliveryRow = rows.find((r) => r.delivery_type === 'home_delivery')
    const feeRow = deliveryRow ?? rows[0]
    if (feeRow) {
      feeRow.delivery_fee = deliveryFee
      feeRow.rider_payout = deliveryRow ? deliveryFee : 0
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

  // Part-paid COD — the buyer prepays a deposit online and owes the rest in
  // cash at handover. Stamped per row for the same reason as platform_fee: a
  // single-line cancel then forfeits (or a decline refunds) exactly that
  // line's own deposit. /api/orders/razorpay/create charges the sum of these
  // rather than the full total, and the rider collects cod_balance_due at the
  // door. depositPercent is 0 until the migration runs, which leaves COD
  // behaving exactly as it does today.
  let codDeposit = 0
  if (paymentMethod === 'cod') {
    const depositPercent = await getCodDepositPercent(supabase)
    if (depositPercent > 0) {
      for (const r of rows) {
        const split = computeCodSplit(
          Number(r.total_price) || 0,
          Number(r.platform_fee) || 0,
          Number(r.delivery_fee) || 0,
          depositPercent,
        )
        r.cod_deposit = split.deposit
        r.cod_balance_due = split.balanceDue
        codDeposit += split.deposit
      }
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
  // Lines that found no stock AND carry the buyer's consent to wait. Indexes
  // into `items`, which is 1:1 with `rows`.
  const preorderRows = new Set<number>()
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
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
      // Nothing left to claim. The buyer who agreed to wait gets a pre-order
      // against the next harvest instead of a dead end; everyone else gets the
      // same refusal as before. Note this is also the honest answer to the race
      // where the last kilo went while they were typing their address: without
      // consent on the line, we still refuse rather than quietly converting a
      // purchase into a wait.
      if (item.preorder === true) {
        preorderRows.add(i)
        continue
      }
      await revertClaims()
      return bad(`${listing.name} just sold out. Please reduce the quantity and try again.`)
    }
    claimed.push({ harvestId: item.harvestId, listingId: item.listingId, qty: item.qty })
  }

  // Stamp the pre-order columns, following the same rule as harvest_id above:
  // only when the cart actually contains one, and then on every row (false/null
  // elsewhere) so the bulk insert has a uniform column set. An ordinary
  // checkout therefore never names these columns at all, and is unaffected on an
  // environment where scripts/preorder-migration.sql has not been run.
  if (preorderRows.size > 0) {
    rows.forEach((row, i) => {
      const isPre = preorderRows.has(i)
      row.is_preorder = isPre
      row.preorder_expected_date = isPre ? preorderExpectedDate(items[i].preorderExpectedDate) : null
      // A pre-order is for the NEXT pick, so it must not point at the finished
      // harvest the buyer happened to be looking at — that row's stock is spent,
      // and leaving the link would put the order on a sold-out pick in every
      // farmer and rider view that groups by harvest.
      if (isPre) row.harvest_id = null
    })
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('orders')
    .insert(rows)
    .select('id, order_code')

  if (insertErr || !inserted) {
    console.error('[YFF] place-order insert failed:', insertErr?.message)
    // Roll the stock back so the row isn't lost.
    await revertClaims()
    // The pre-order columns are the one part of this insert that may not exist
    // yet. Fail loudly rather than retrying without them: a pre-order saved as
    // an ordinary order would show the farmer a paid order against stock they
    // do not have, with nothing anywhere to say the buyer agreed to wait.
    if (isMissingColumnError(insertErr?.message, 'is_preorder')) {
      console.error('[YFF] pre-order placed but scripts/preorder-migration.sql has not been run on this database')
      return bad(
        'Pre-orders are not switched on yet. Please try again later, or order something that is in stock.',
        503,
      )
    }
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
    // Part-paid COD. codDeposit is what Razorpay will charge now; the rest is
    // cash at handover. Both 0 on a fully-prepaid order.
    codDeposit,
    codBalanceDue: codDeposit > 0 ? (total + deliveryFee + platformFee) - codDeposit : 0,
    // Guests get a short-lived token bound to these orders so they can finish
    // the Razorpay create/verify pair without a session cookie.
    ...(isGuest ? { guestToken: createGuestOrderToken(orderIds) } : {}),
  })
}

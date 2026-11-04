import { randomInt } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAggregator, svc } from '@/lib/aggregator-auth'
import { cashfreeMode, createCashfreeOrder, makeCashfreeOrderId } from '@/lib/cashfree'
import { rateLimit } from '@/lib/rate-limit'
import { onMarket, type MarketHarvestRow, type MarketListingRow, type MarketSellerRow } from '@/lib/bulkMarket'
import { checkBulkAddress, checkBulkOrder, pickHarvest, type BulkListing, type Delivery } from '@/lib/bulkOrder'
import { getBulkFeePercent } from '@/lib/bulkOrderServer'
import { scheduleWholesaleLowStockCheck } from '@/lib/wholesaleLowStockAlert'
import { wholesaleStock } from '@/lib/wholesaleVisibility'
import { formatQty } from '@/lib/saleStep'
import { accessOf, type SubscriptionRow } from '@/lib/subscriptionPlans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// An aggregator buys one bulk lot (Phase 6):
//   { listingId, qty, delivery: 'pickup' | 'AP' | 'TG', address? }
// Requires a Buying (or Combined) plan. Paid online through Cashfree only —
// there is no cash option for bulk (decision 2026-11-04). Everything that
// costs money is worked out HERE from the live listing (checkBulkOrder): the
// browser sends only how much and where. The order is an ordinary `orders`
// row (order_type 'wholesale', buyer_aggregator_id), placed 'pending' with
// its stock claimed BEFORE the checkout opens; payment settles through the
// shop's Cashfree webhook / verify / reconcile, and an abandoned checkout
// gives the stock back (/api/aggregator/bulk-orders/abandon).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LISTING_COLUMNS =
  'id, farmer_id, name, unit, status, sale_mode, sale_step, stock_qty, wholesale_price, wholesale_min_qty, wholesale_pack_size, wholesale_transport_states, wholesale_transport_rates'

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest) {
  const agg = await requireAggregator(req)
  if (!agg) return bad('Aggregator login required.', 401)
  if (!rateLimit(`bulk-place:${agg.id}`, 20, 10 * 60 * 1000)) return bad('Too many tries. Please wait a few minutes.', 429)

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return bad('Invalid request.')
  const listingId = typeof body.listingId === 'string' ? body.listingId : ''
  if (!UUID_RE.test(listingId)) return bad('Invalid listing.')
  const qty = Number(body.qty)
  if (!Number.isFinite(qty) || qty <= 0 || qty > 10_000_000) return bad('Invalid quantity.')
  const delivery: Delivery = body.delivery === 'AP' || body.delivery === 'TG' ? body.delivery : 'pickup'

  const supabase = svc()

  // A Buying plan, live right now.
  const { data: subs } = await supabase
    .from('aggregator_subscriptions')
    .select('id, kind, source, status, starts_at, ends_at')
    .eq('aggregator_id', agg.id)
  if (!accessOf((subs ?? []) as SubscriptionRow[]).buying) return bad('A Buying plan is needed to order in bulk.', 403)

  const { data: listing, error: lErr } = await supabase.from('produce_listings').select(LISTING_COLUMNS).eq('id', listingId).maybeSingle()
  if (lErr) return bad('Bulk ordering is not switched on yet. Please try again later.', 503)
  if (!listing) return bad('This bulk lot is not available any more.', 404)
  const l = listing as MarketListingRow & BulkListing

  const [{ data: sellerRow }, { data: harvestRows }, { data: me }] = await Promise.all([
    supabase.from('farmers').select('id, name, village, district, state, phone, farm_address, account_type, active, pickup_locations').eq('id', l.farmer_id).maybeSingle(),
    supabase.from('harvests').select('id, produce_listing_id, stock_qty, paused, harvested_at').eq('produce_listing_id', l.id).eq('paused', false),
    supabase.from('farmers').select('id, name, phone').eq('id', agg.id).maybeSingle(),
  ])
  const seller = (sellerRow ?? undefined) as (MarketSellerRow & { pickup_locations?: string[] | null }) | undefined
  const harvests = (harvestRows ?? []) as Array<MarketHarvestRow & { id: string }>
  // Same visibility as the market: available, seller active, not my own, enough stock.
  if (!onMarket(l, harvests, seller, agg.id)) return bad('This bulk lot is not available any more.', 409)

  const check = checkBulkOrder(l, qty, delivery, await getBulkFeePercent(supabase))
  if (!check.ok) return bad(check.error)

  let address: { line: string; city: string; pincode: string; landmark: string | null } | null = null
  if (check.deliveryType === 'courier') {
    const a = checkBulkAddress((body.address ?? {}) as Record<string, unknown>)
    if (!a.ok) return bad(a.error)
    address = a
  }

  const buyer = me as { name?: string | null; phone?: string | null } | null
  const buyerPhone = String(buyer?.phone ?? '').replace(/\D/g, '').slice(-10)
  if (buyerPhone.length !== 10) return bad('Add a valid phone number to your profile first.')

  // One order = one harvest: the newest pick that holds the whole quantity.
  const harvest = harvests.length ? pickHarvest(harvests, check.qty) : null
  if (harvests.length && !harvest) {
    const most = wholesaleStock(l, harvests)
    return bad(`No single harvest has ${formatQty(check.qty)} ${l.unit || 'kg'} right now${most ? ` — you can order up to ${formatQty(most)} ${l.unit || 'kg'}` : ''}.`, 409)
  }
  const claim = harvest
    ? await supabase.rpc('decrement_harvest_stock', { p_harvest_id: harvest.id, p_qty: check.qty })
    : await supabase.rpc('decrement_stock', { p_listing_id: l.id, p_qty: check.qty })
  if (claim.error) return bad('Could not place the order. Please try again.', 500)
  if (!claim.data) return bad(`${l.name} just sold out. Please lower the quantity.`, 409)
  const giveBack = async () => {
    try {
      if (harvest) await supabase.rpc('increment_harvest_stock', { p_harvest_id: harvest.id, p_qty: check.qty })
      else await supabase.rpc('increment_stock', { p_listing_id: l.id, p_qty: check.qty })
    } catch (e) {
      console.error('[YFF bulk place] stock give-back failed:', e)
    }
  }

  const pickupPoint = (seller?.pickup_locations ?? []).find((p) => typeof p === 'string' && p.trim()) ?? seller?.farm_address ?? null
  const row = {
    farmer_id: l.farmer_id,
    produce_listing_id: l.id,
    harvest_id: harvest?.id ?? null,
    produce_name: l.name,
    quantity: check.qty,
    unit: l.unit || 'kg',
    total_price: check.linePrice,
    platform_fee: check.fee,
    transport_charge: check.transport,
    transport_state: check.transportState,
    order_type: 'wholesale',
    buyer_aggregator_id: agg.id,
    consumer_id: null,
    buyer_name: buyer?.name ?? 'Aggregator',
    buyer_phone: buyerPhone,
    status: 'pending',
    payment_method: 'cashfree',
    payment_status: 'pending',
    delivery_type: check.deliveryType,
    delivery_status: null,
    delivery_address: address?.line ?? null,
    delivery_city: address?.city ?? null,
    delivery_landmark: address?.landmark ?? null,
    delivery_pincode: address?.pincode ?? null,
    pickup_location: check.deliveryType === 'self_pickup' && pickupPoint ? String(pickupPoint).slice(0, 200) : null,
    handover_otp: String(randomInt(0, 10000)).padStart(4, '0'),
    delivery_fee: 0,
    delivery_fee_refunded: 0,
    rider_payout: 0,
  }
  const { data: inserted, error: insErr } = await supabase.from('orders').insert(row).select('id, order_code').single()
  if (insErr || !inserted) {
    console.error('[YFF bulk place] insert failed:', insErr?.message)
    await giveBack()
    return bad(/transport_charge|buyer_aggregator_id|transport_state/.test(insErr?.message ?? '')
      ? 'Bulk ordering is not switched on yet. Please try again later.'
      : 'Could not place the order. Please try again.', /transport_charge|buyer_aggregator_id|transport_state/.test(insErr?.message ?? '') ? 503 : 500)
  }
  const order = inserted as { id: string; order_code?: string | null }

  const cashfreeOrderId = makeCashfreeOrderId(order.id)
  let sessionId: string | null | undefined
  try {
    const created = await createCashfreeOrder({
      orderId: cashfreeOrderId,
      amountRupees: check.total,
      customerId: `agg_${agg.id.replace(/-/g, '')}`.slice(0, 50),
      customerPhone: buyerPhone,
      customerName: buyer?.name ?? null,
      note: `Go Grameen bulk order: ${l.name}`,
      tags: { kind: 'bulk', rows: '1' },
    })
    sessionId = created.payment_session_id
  } catch (e) {
    console.error('[YFF bulk place] Cashfree create failed:', e)
  }
  if (!sessionId) {
    await supabase.from('orders').update({ status: 'cancelled', decline_reason: 'Payment could not start' }).eq('id', order.id)
    await giveBack()
    return bad('Could not start payment. Please try again.', 502)
  }
  const { error: stampErr } = await supabase.from('orders').update({ cashfree_order_id: cashfreeOrderId }).eq('id', order.id)
  if (stampErr) {
    await supabase.from('orders').update({ status: 'cancelled', decline_reason: 'Payment could not start' }).eq('id', order.id)
    await giveBack()
    return bad('Could not start payment. Please try again.', 500)
  }

  // Shared stock: if this took a lot below its minimum, its bulk side hides
  // itself and the seller is told (after the response).
  scheduleWholesaleLowStockCheck(supabase, [{ listingId: l.id, harvestId: harvest?.id ?? null, qty: check.qty }])

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    orderCode: order.order_code ?? null,
    mode: cashfreeMode(),
    cashfreeOrderId,
    paymentSessionId: sessionId,
    goods: check.goods,
    transport: check.transport,
    fee: check.fee,
    total: check.total,
  })
}

/**
 * Buying a bulk lot in the app (Phase 6, model agreed 2026-11-04):
 *  - buyers are aggregators holding a Buying (or Combined) plan;
 *  - paid online through Cashfree only — no cash on delivery;
 *  - the seller's transport charge comes from their per-state rate
 *    (src/lib/wholesale.ts TransportRates) and is shown before paying;
 *  - platform fee on bulk orders = a moderator setting, 0% for now;
 *  - the order is an ordinary `orders` row (order_type 'wholesale',
 *    buyer_aggregator_id set), so the seller's whole order flow — approve,
 *    decline with automatic refund, ship, receipts, reports — works as-is.
 *    total_price = goods + transport (the seller receives both), so a decline
 *    refunds the transport too.
 *
 * Pure: the place route and the checkout screen both call checkBulkOrder, so
 * what the aggregator is shown is exactly what the server charges.
 */

import { computePlatformFee } from '@/lib/platform-fee'
import { roundQty, unitAllowsFractions, formatQty } from '@/lib/saleStep'
import { isBilledAfterDelivery, normalizeRates, normalizeStates, parseSaleMode, TRANSPORT_STATE_LABELS, type TransportRate, type TransportRateMode, type TransportRates, type TransportState } from '@/lib/wholesale'
import { wholesaleQtyRules } from '@/lib/wholesaleOrder'

export type BulkListing = {
  name: string
  unit?: string | null
  sale_mode?: unknown
  sale_step?: number | string | null
  wholesale_price?: number | string | null
  wholesale_min_qty?: number | string | null
  wholesale_pack_size?: number | string | null
  /** ₹ for one pack (scripts/pack-pricing-migration.sql); charged per pack when set. */
  wholesale_pack_price?: number | string | null
  wholesale_transport_states?: unknown
  wholesale_transport_rates?: unknown
}

export type Delivery = 'pickup' | TransportState

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * The seller's charge to deliver `qty` under one state's rate, in whole
 * rupees. Free once the order reaches `free_above`.
 */
export function transportCharge(rate: TransportRate, qty: number): number {
  // Per km and cargo bill are billed after delivery and paid to the seller
  // directly — nothing for transport goes into the online payment.
  if (isBilledAfterDelivery(rate.mode)) return 0
  if (rate.free_above !== null && qty + 1e-9 >= rate.free_above) return 0
  const raw = rate.mode === 'per_unit' ? rate.amount * qty : rate.amount
  return Math.max(0, Math.round(raw))
}

/**
 * Where this lot can go: always pickup, plus every state the seller delivers
 * to AND has set a charge for. A state without a charge is not offered — an
 * unset rate is never treated as free.
 */
export function deliveryOptions(l: BulkListing): Array<{ delivery: Delivery; rate: TransportRate | null }> {
  const states = normalizeStates(l.wholesale_transport_states)
  const rates: TransportRates = normalizeRates(l.wholesale_transport_rates)
  return [
    { delivery: 'pickup' as const, rate: null },
    ...states.filter((s) => rates[s]).map((s) => ({ delivery: s, rate: rates[s] as TransportRate })),
  ]
}

/** "₹500 per order", "₹2/kg · free above 1000 kg", "Free delivery". */
export function rateText(rate: TransportRate, unit: string, L: (en: string, te: string) => string): string {
  if (rate.mode === 'per_km') return L(`₹${formatQty(rate.amount)} per km · billed after delivery`, `కి.మీ.కు ₹${formatQty(rate.amount)} · డెలివరీ తర్వాత బిల్లు`)
  if (rate.mode === 'cargo_bill') return L('As per the actual cargo bill · after delivery', 'అసలు కార్గో బిల్లు ప్రకారం · డెలివరీ తర్వాత')
  const free = rate.free_above !== null
    ? L(` · free above ${formatQty(rate.free_above)} ${unit}`, ` · ${formatQty(rate.free_above)} ${unit} పైన ఉచితం`)
    : ''
  if (rate.amount === 0) return L('Free delivery', 'ఉచిత డెలివరీ')
  const base = rate.mode === 'per_unit'
    ? L(`₹${formatQty(rate.amount)}/${unit}`, `₹${formatQty(rate.amount)}/${unit}`)
    : L(`₹${formatQty(rate.amount)} per order`, `ఒక్కో ఆర్డర్‌కు ₹${formatQty(rate.amount)}`)
  return base + free
}

export type BulkCheck =
  | {
      ok: true
      unitPrice: number
      qty: number
      goods: number
      transport: number
      fee: number
      /** What the aggregator pays now. */
      total: number
      /** orders.total_price — goods + transport (the seller's). */
      linePrice: number
      deliveryType: 'self_pickup' | 'courier'
      transportState: TransportState | null
      /** How delivery is charged; per_km / cargo_bill = billed after delivery, paid to the seller. */
      transportMode: TransportRateMode | null
      /** ₹ per km for per_km, else null. */
      transportRate: number | null
    }
  | { ok: false; error: string }

/**
 * Check one bulk order against the live listing and price it. Nothing comes
 * from the browser but the quantity and where it should go.
 */
export function checkBulkOrder(l: BulkListing, qty: number, delivery: Delivery, feePercent: number): BulkCheck {
  const mode = parseSaleMode(l.sale_mode)
  const price = num(l.wholesale_price)
  const minQty = num(l.wholesale_min_qty)
  if ((mode !== 'wholesale' && mode !== 'both') || price === null || price <= 0 || minQty === null || minQty <= 0) {
    return { ok: false, error: `${l.name} is not sold in bulk any more.` }
  }
  const unit = l.unit || 'kg'
  const pack = num(l.wholesale_pack_size)
  const { min, step } = wholesaleQtyRules({ minQty, packSize: pack !== null && pack > 0 ? pack : null }, l.sale_step, l.unit)
  if (!Number.isFinite(qty) || roundQty(qty) < min) return { ok: false, error: `Order at least ${formatQty(min)} ${unit} of ${l.name}.` }
  const steps = roundQty(qty / step)
  if (Math.abs(steps - Math.round(steps)) > 1e-6) {
    return { ok: false, error: pack ? `${l.name} is sold in packs of ${formatQty(pack)} ${unit}.` : `${l.name} is sold in steps of ${formatQty(step)} ${unit}.` }
  }
  if (!unitAllowsFractions(l.unit) && !Number.isInteger(roundQty(qty))) return { ok: false, error: `${l.name} must be a whole number of ${unit}.` }

  let transport = 0
  let transportState: TransportState | null = null
  let transportMode: TransportRateMode | null = null
  let transportRate: number | null = null
  if (delivery !== 'pickup') {
    const opt = deliveryOptions(l).find((o) => o.delivery === delivery)
    if (!opt?.rate) {
      return { ok: false, error: `The seller does not deliver ${l.name} to ${TRANSPORT_STATE_LABELS[delivery]?.en ?? delivery} in the app. Choose pickup.` }
    }
    transport = transportCharge(opt.rate, roundQty(qty))
    transportState = delivery
    transportMode = opt.rate.mode
    transportRate = opt.rate.mode === 'per_km' ? opt.rate.amount : null
  }
  // Packs (2026-11-10): whole packs × the price of one pack, as the seller
  // typed it — never the derived ₹/unit × qty, which can drift by a paisa.
  const packPrice = num(l.wholesale_pack_price)
  const goods = pack !== null && pack > 0 && packPrice !== null && packPrice > 0
    ? Math.round(Math.round(roundQty(qty) / pack) * packPrice)
    : Math.round(price * roundQty(qty))
  if (!(goods > 0)) return { ok: false, error: `Price not set for ${l.name}.` }
  // The fee is on the produce only — transport is the seller's own charge.
  const fee = computePlatformFee(goods, feePercent)
  return {
    ok: true,
    unitPrice: price,
    qty: roundQty(qty),
    goods,
    transport,
    fee,
    total: goods + transport + fee,
    linePrice: goods + transport,
    deliveryType: delivery === 'pickup' ? 'self_pickup' : 'courier',
    transportState,
    transportMode,
    transportRate,
  }
}

/**
 * Which harvest one bulk order draws from: one order = one harvest, so the
 * newest unpaused pick that holds the whole quantity. `untracked` stock (null)
 * can always take it. null = no single harvest holds it.
 */
export function pickHarvest<H extends { id: string; stock_qty?: number | string | null; paused?: boolean | null; harvested_at?: string | null }>(
  harvests: readonly H[],
  qty: number,
): H | null {
  const ok = harvests
    .filter((h) => !h.paused)
    .filter((h) => h.stock_qty === null || h.stock_qty === undefined || (num(h.stock_qty) ?? 0) + 1e-9 >= qty)
    .sort((a, b) => (b.harvested_at ?? '').localeCompare(a.harvested_at ?? ''))
  return ok[0] ?? null
}

/** Address for a delivered bulk order: the same rules as a household delivery. */
export function checkBulkAddress(a: { line?: unknown; city?: unknown; pincode?: unknown; landmark?: unknown }):
  { ok: true; line: string; city: string; pincode: string; landmark: string | null } | { ok: false; error: string } {
  const line = typeof a.line === 'string' ? a.line.trim().slice(0, 300) : ''
  const city = typeof a.city === 'string' ? a.city.trim().slice(0, 100) : ''
  const pincode = typeof a.pincode === 'string' ? a.pincode.replace(/\D/g, '') : ''
  const landmark = typeof a.landmark === 'string' && a.landmark.trim() ? a.landmark.trim().slice(0, 150) : null
  if (line.length < 10) return { ok: false, error: 'Enter the full delivery address (door no, street, area).' }
  if (!city) return { ok: false, error: 'Enter the city or town.' }
  if (!/^[1-9]\d{5}$/.test(pincode)) return { ok: false, error: 'Enter a valid 6-digit pincode.' }
  return { ok: true, line, city, pincode, landmark }
}

// ── Where a bought bulk order is (the aggregator's "My bulk orders") ─

export type BulkOrderRow = {
  status?: string | null
  payment_status?: string | null
  delivery_type?: string | null
  decline_reason?: string | null
  refund_status?: string | null
  shipped_at?: string | null
  received_at?: string | null
  collected_at?: string | null
}

export type BulkStage = { key: 'unpaid' | 'waiting' | 'approved' | 'shipped' | 'done' | 'declined' | 'cancelled'; en: string; te: string; tone: 'grey' | 'amber' | 'blue' | 'green' | 'red' }

export function bulkOrderStage(o: BulkOrderRow): BulkStage {
  const pickup = o.delivery_type !== 'courier'
  if (o.status === 'declined') {
    const refunded = o.refund_status === 'processed'
    return { key: 'declined', en: refunded ? 'Declined — refunded' : 'Declined — refund on the way', te: refunded ? 'తిరస్కరించారు — రీఫండ్ అయింది' : 'తిరస్కరించారు — రీఫండ్ వస్తోంది', tone: 'red' }
  }
  if (o.status === 'cancelled') {
    return o.payment_status === 'paid'
      ? { key: 'cancelled', en: 'Cancelled', te: 'రద్దు అయింది', tone: 'grey' }
      : { key: 'unpaid', en: 'Payment not completed', te: 'చెల్లింపు పూర్తి కాలేదు', tone: 'grey' }
  }
  if (o.payment_status !== 'paid' && o.payment_status !== 'completed') return { key: 'unpaid', en: 'Waiting for payment', te: 'చెల్లింపు కోసం ఎదురుచూస్తోంది', tone: 'amber' }
  if (o.received_at || o.collected_at) {
    return pickup ? { key: 'done', en: 'Collected', te: 'తీసుకున్నారు', tone: 'green' } : { key: 'done', en: 'Delivered', te: 'డెలివరీ అయింది', tone: 'green' }
  }
  if (o.shipped_at) return { key: 'shipped', en: 'On the way', te: 'దారిలో ఉంది', tone: 'blue' }
  if (o.status === 'approved') return pickup
    ? { key: 'approved', en: 'Ready — collect from the seller', te: 'సిద్ధం — అమ్మకందారు దగ్గర తీసుకోండి', tone: 'blue' }
    : { key: 'approved', en: 'Confirmed — seller will deliver', te: 'ఖరారు — అమ్మకందారు డెలివరీ చేస్తారు', tone: 'blue' }
  return { key: 'waiting', en: 'Paid — waiting for the seller to confirm', te: 'చెల్లించారు — అమ్మకందారు ఖరారు కోసం', tone: 'amber' }
}

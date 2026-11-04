/**
 * Buying wholesale (bulk) — the quantity grid, the cart line and the server's
 * check of one bulk line.
 *
 * Decisions:
 *  - 2026-11-04 (final model): bulk is ONLY for subscribed aggregators. Normal
 *    household buyers never see or buy it — the "Buy wholesale" toggle was
 *    removed from the consumer pages and /api/orders/place refuses any bulk
 *    line. These rules stay for the aggregators' bulk market (not built yet).
 *  - 2026-11-03: only a produce sold as BOTH was offered; wholesale-only was
 *    hidden from every buyer (wholesaleVisibility.ts).
 *  - Price: wholesale_price per unit, no tiers.
 *  - Quantity: at least the minimum; in whole packs when a pack size is set,
 *    otherwise in the produce's own sale step.
 *  - Transport: if the farmer transports (AP/TG), the buyer may ask for
 *    delivery and the line becomes a farmer delivery (delivery_type 'courier'):
 *    no rider, no app delivery charge — the transport charge is agreed with the
 *    farmer outside the app. Otherwise the line is pickup only.
 *  - Stock is shared with retail: one wholesale order draws from one harvest,
 *    so a harvest with less than the minimum cannot be bought wholesale.
 *
 * Pure: used by the produce/harvest pages, the cart and /api/orders/place.
 */

import { normalizeStep, roundQty, unitAllowsFractions } from '@/lib/saleStep'
import { normalizeStates, parseSaleMode, type Msg, type TransportState } from '@/lib/wholesale'

export type WholesaleListing = {
  sale_mode?: unknown
  wholesale_price?: number | string | null
  wholesale_min_qty?: number | string | null
  wholesale_pack_size?: number | string | null
  wholesale_transport_states?: unknown
  sale_step?: number | string | null
  unit?: string | null
}

/** What the cart carries for a wholesale line (prices are re-checked by the server). */
export type WholesaleLine = {
  price: number
  minQty: number
  packSize: number | null
  transportStates: TransportState[]
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Can this produce be bought wholesale at all (ignoring stock)? Both only. */
export function offersWholesaleToBuyers(l: WholesaleListing | null | undefined): boolean {
  if (!l || parseSaleMode(l.sale_mode) !== 'both') return false
  const price = num(l.wholesale_price)
  const min = num(l.wholesale_min_qty)
  return price !== null && price > 0 && min !== null && min > 0
}

/** The cart line details, or null when the produce isn't offered wholesale. */
export function wholesaleLineOf(l: WholesaleListing | null | undefined): WholesaleLine | null {
  if (!offersWholesaleToBuyers(l)) return null
  const pack = num(l!.wholesale_pack_size)
  return {
    price: num(l!.wholesale_price) as number,
    minQty: num(l!.wholesale_min_qty) as number,
    packSize: pack !== null && pack > 0 ? pack : null,
    transportStates: normalizeStates(l!.wholesale_transport_states),
  }
}

/**
 * The quantity grid for a wholesale line: the step is the pack size (or the
 * produce's own sale step), and the smallest order is the minimum rounded UP
 * onto that grid — so the minimum is always something that can be ordered.
 */
export function wholesaleQtyRules(
  line: Pick<WholesaleLine, 'minQty' | 'packSize'>,
  saleStep?: number | string | null,
  unit?: string | null,
): { min: number; step: number } {
  const step = line.packSize ?? normalizeStep(num(saleStep), unit)
  const min = roundQty(Math.ceil(roundQty(line.minQty / step) - 1e-9) * step)
  return { min: Math.max(min, step), step }
}

/**
 * Put a wanted quantity on the wholesale grid: not below the minimum, a whole
 * number of steps, not above stock. Returns 0 when even the minimum doesn't
 * fit in the stock — the line can't be bought wholesale.
 */
export function snapWholesaleQty(
  qty: number,
  rules: { min: number; step: number },
  stock?: number | null,
): number {
  const { min, step } = rules
  if (stock != null && stock < min) return 0
  let q = Number.isFinite(qty) ? qty : min
  q = roundQty(Math.round(roundQty(q / step)) * step)
  if (q < min) q = min
  if (stock != null && q > stock) q = roundQty(Math.floor(roundQty(stock / step) + 1e-9) * step)
  return q < min ? 0 : q
}

/** One "+" tap. Stays put at the stock limit. */
export function wholesaleStepUp(qty: number, rules: { min: number; step: number }, stock?: number | null): number {
  const next = roundQty(qty + rules.step)
  if (stock != null && next > stock) return qty
  return next
}

/** One "−" tap. Below the minimum the line is removed (0). */
export function wholesaleStepDown(qty: number, rules: { min: number; step: number }): number {
  const next = roundQty(qty - rules.step)
  return next < rules.min ? 0 : next
}

/** Can this harvest (its stock) take a wholesale order? null stock = not tracked. */
export function canBuyWholesale(l: WholesaleListing | null | undefined, stock: number | null | undefined): boolean {
  const line = wholesaleLineOf(l)
  if (!line) return false
  if (stock == null) return true
  return stock >= wholesaleQtyRules(line, l!.sale_step, l!.unit).min
}

/** The cart key: a wholesale line never merges with the retail line of the same harvest. */
export function wholesaleCartKey(baseKey: string): string {
  return `${baseKey}:wholesale`
}

/** The household checkout's answer to a bulk line (decision 2026-11-04). */
export const BULK_FOR_AGGREGATORS_ONLY: Msg = {
  en: 'Bulk buying is only for aggregators. Please remove the wholesale item from your cart.',
  te: 'బల్క్ కొనుగోలు అగ్రిగేటర్లకు మాత్రమే. దయచేసి మీ కార్ట్ నుండి హోల్‌సేల్ వస్తువును తీసివేయండి.',
}

export const WHOLESALE_TRANSPORT_NOTE: Msg = {
  en: 'Farmer delivers — transport charge to be agreed with the farmer.',
  te: 'రైతు డెలివరీ చేస్తారు — రవాణా ఛార్జ్ రైతుతో మాట్లాడుకోవాలి.',
}
export const WHOLESALE_TRANSPORT_CHARGE_NOTE: Msg = {
  en: 'Transport charge to be agreed with the farmer.',
  te: 'రవాణా ఛార్జ్ రైతుతో మాట్లాడుకోవాలి.',
}
export const WHOLESALE_PICKUP_NOTE: Msg = {
  en: 'Wholesale is pickup only — collect from the farmer.',
  te: 'హోల్‌సేల్ పికప్ మాత్రమే — రైతు దగ్గర తీసుకెళ్లండి.',
}

export type WholesaleLineCheck =
  | { ok: true; unitPrice: number; linePrice: number; deliveryType: 'self_pickup' | 'courier' }
  | { ok: false; error: string }

/**
 * The server's check of one wholesale cart line against the live produce row.
 * `requested` is what the buyer asked for; any delivery becomes a farmer
 * delivery, and is refused when the farmer doesn't transport.
 */
export function checkWholesaleLine(
  l: WholesaleListing & { name: string },
  qty: number,
  requested: 'self_pickup' | 'home_delivery' | 'courier',
): WholesaleLineCheck {
  const line = wholesaleLineOf(l)
  if (!line) return { ok: false, error: `${l.name} is not sold wholesale any more.` }
  const unit = l.unit || 'kg'
  const { min, step } = wholesaleQtyRules(line, l.sale_step, l.unit)
  if (!Number.isFinite(qty) || roundQty(qty) < min) {
    return { ok: false, error: `${l.name} wholesale: order at least ${min} ${unit}.` }
  }
  const steps = roundQty(qty / step)
  if (Math.abs(steps - Math.round(steps)) > 1e-6) {
    return { ok: false, error: line.packSize
      ? `${l.name} wholesale is sold in packs of ${line.packSize} ${unit}.`
      : `${l.name} wholesale is sold in multiples of ${step} ${unit}.` }
  }
  if (!unitAllowsFractions(l.unit) && !Number.isInteger(roundQty(qty))) {
    return { ok: false, error: `${l.name} wholesale must be a whole number of ${unit}.` }
  }
  let deliveryType: 'self_pickup' | 'courier' = 'self_pickup'
  if (requested !== 'self_pickup') {
    if (line.transportStates.length === 0) {
      return { ok: false, error: `${l.name} wholesale is pickup only — the farmer does not transport.` }
    }
    deliveryType = 'courier'
  }
  const linePrice = Math.round(line.price * roundQty(qty))
  if (!(linePrice > 0)) return { ok: false, error: `Price not set for ${l.name}. Please ask the farmer.` }
  return { ok: true, unitPrice: line.price, linePrice, deliveryType }
}

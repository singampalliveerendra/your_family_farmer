import { haversineKm, type PlaceState } from '@/lib/location'

/* Where a retail produce can go (client decision 2026-11-05,
 * scripts/retail-reach-migration.sql):
 *
 *   local     — only buyers within the farmer's local delivery radius see it
 *               (the radius set on the produce; 25 km when not set)
 *   transport — the farmer also sends it by courier / parcel anywhere in the
 *               states they pick (AP, TG), for a fixed charge per order per
 *               state, paid online with the order
 *
 * Buyers who haven't shared a location see everything (local produce is
 * marked "set your location"). Pure — the feed, the cart, the order route and
 * the tests use these. */

export type RetailReach = 'local' | 'transport'
export type RetailTransportRates = Partial<Record<PlaceState, number>>
export const RETAIL_STATES: PlaceState[] = ['AP', 'TG']
export const DEFAULT_LOCAL_RADIUS_KM = 25
export const MAX_RETAIL_TRANSPORT_CHARGE = 99999

type Msg = { en: string; te: string }
const STATE_NAME: Record<PlaceState, Msg> = { AP: { en: 'Andhra Pradesh', te: 'ఆంధ్రప్రదేశ్' }, TG: { en: 'Telangana', te: 'తెలంగాణ' } }
export const stateName = (s: PlaceState): Msg => STATE_NAME[s]

export const parseReach = (v: unknown): RetailReach => (v === 'transport' ? 'transport' : 'local')

/** A stored rates column (or junk) → clean rates. Only AP / TG, 0 or more. */
export function normalizeRetailRates(raw: unknown): RetailTransportRates {
  const out: RetailTransportRates = {}
  if (!raw || typeof raw !== 'object') return out
  for (const s of RETAIL_STATES) {
    const n = Number((raw as Record<string, unknown>)[s])
    const v = (raw as Record<string, unknown>)[s]
    if (v === null || v === undefined || v === '' || !Number.isFinite(n) || n < 0 || n > MAX_RETAIL_TRANSPORT_CHARGE) continue
    out[s] = Math.round(n)
  }
  return out
}

/** Check what a seller saves. Transportable needs delivery allowed and at least one state with a charge (₹0 = free). */
export function parseRetailReachSave(
  body: { retail_reach?: unknown; retail_transport_rates?: unknown },
  deliveryMode: string | null | undefined,
): { ok: true; reach: RetailReach; rates: RetailTransportRates } | { ok: false; error: Msg } {
  const reach = parseReach(body.retail_reach)
  if (reach === 'local') return { ok: true, reach, rates: {} }
  if (deliveryMode === 'pickup') {
    return { ok: false, error: { en: 'Transportable needs delivery — choose "Farmer courier" or "Both", not "Pickup only".', te: 'రవాణాకు డెలివరీ అవసరం — "పికప్ మాత్రమే" కాకుండా "రైతు కొరియర్" లేదా "రెండూ" ఎంచుకోండి.' } }
  }
  const raw = (body.retail_transport_rates && typeof body.retail_transport_rates === 'object' ? body.retail_transport_rates : {}) as Record<string, unknown>
  for (const s of RETAIL_STATES) {
    const v = raw[s]
    if (v === null || v === undefined || v === '') continue
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || n > MAX_RETAIL_TRANSPORT_CHARGE) {
      return { ok: false, error: { en: `Transport charge for ${STATE_NAME[s].en} must be a number, 0 or more.`, te: `${STATE_NAME[s].te} రవాణా ఛార్జ్ 0 లేదా అంతకంటే ఎక్కువ సంఖ్య ఉండాలి.` } }
    }
  }
  const rates = normalizeRetailRates(raw)
  if (!Object.keys(rates).length) {
    return { ok: false, error: { en: 'Set the transport charge for Andhra Pradesh, Telangana or both (0 = free).', te: 'ఆంధ్రప్రదేశ్, తెలంగాణ లేదా రెండింటికీ రవాణా ఛార్జ్ పెట్టండి (0 = ఉచితం).' } }
  }
  return { ok: true, reach, rates }
}

export type Buyer = { lat: number; lng: number; state: PlaceState | null } | null
export type FarmPoint = { lat: number; lng: number } | null

export type Reachability =
  /** No buyer location: shown, but we can't say if it delivers there. */
  | { show: true; kind: 'unknown'; distKm: null; charge: null }
  | { show: true; kind: 'local'; distKm: number | null; charge: null }
  | { show: true; kind: 'transport'; distKm: number | null; charge: number }
  | { show: false; kind: 'out_of_range'; distKm: number | null; charge: null }

/**
 * Does this produce reach this buyer, and how? Local first: a buyer inside the
 * farmer's radius gets the normal local options. Beyond it, only transportable
 * produce for the buyer's state — with that state's charge.
 */
export function reachFor(
  listing: { retail_reach?: unknown; retail_transport_rates?: unknown; delivery_radius_km?: unknown },
  farm: FarmPoint,
  buyer: Buyer,
): Reachability {
  if (!buyer) return { show: true, kind: 'unknown', distKm: null, charge: null }
  const radius = Number(listing.delivery_radius_km) > 0 ? Number(listing.delivery_radius_km) : DEFAULT_LOCAL_RADIUS_KM
  const distKm = farm ? haversineKm(buyer.lat, buyer.lng, farm.lat, farm.lng) : null
  if (distKm !== null && distKm <= radius) return { show: true, kind: 'local', distKm, charge: null }
  if (parseReach(listing.retail_reach) === 'transport' && buyer.state) {
    const charge = normalizeRetailRates(listing.retail_transport_rates)[buyer.state]
    if (charge !== undefined) return { show: true, kind: 'transport', distKm, charge }
  }
  return { show: false, kind: 'out_of_range', distKm, charge: null }
}

/**
 * The transport charge on one farmer's order: one parcel per farmer, so the
 * highest charge among the transported lines, for the delivery state. null =
 * one of the lines does not go to that state (the order is refused).
 */
export function orderTransportCharge(
  lines: Array<{ retail_reach?: unknown; retail_transport_rates?: unknown }>,
  state: PlaceState | null,
): number | null {
  if (!lines.length) return 0
  if (!state) return null
  let max = 0
  for (const l of lines) {
    if (parseReach(l.retail_reach) !== 'transport') return null
    const c = normalizeRetailRates(l.retail_transport_rates)[state]
    if (c === undefined) return null
    max = Math.max(max, c)
  }
  return max
}

/** A coarse farm point for public use: ~5.5 km grid, never the exact farm. */
export function coarsePoint(lat: number, lng: number): { lat: number; lng: number } {
  const r = (n: number) => Math.round(n * 20) / 20
  return { lat: r(lat), lng: r(lng) }
}

/**
 * For the save routes: when the payload carries the reach, check it and write
 * the clean columns into `target`. Returns the error to show, or null. A
 * payload without `retail_reach` leaves both columns alone (older callers, and
 * a database before the migration).
 */
export function applyRetailReach(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  deliveryMode: string | null | undefined,
): Msg | null {
  if (!('retail_reach' in source)) {
    delete target.retail_transport_rates
    return null
  }
  const r = parseRetailReachSave(source, deliveryMode)
  if (!r.ok) return r.error
  target.retail_reach = r.reach
  target.retail_transport_rates = r.rates
  return null
}

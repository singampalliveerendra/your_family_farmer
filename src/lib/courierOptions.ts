/**
 * Delivery for one produce (client card 2026-11-10, "Delivery" step after
 * "How do you want to sell?"):
 *
 *   Pickup only  → the farmer's pickup points (profile: locations, timings,
 *                  address and phone) — nothing stored on the produce
 *   I will courier / Both → courier type:
 *     local  — the farmer delivers nearby (radius in km). Who bears it:
 *                farmer → free for the buyer (charge 0)
 *                buyer  → the farmer's charge (₹, required)
 *     cargo  — sent by cargo/parcel services anywhere in AP & TG. The farmer
 *              ticks the services in their area that take ToPay; the buyer
 *              orders only if one of them works in their area. Who bears it:
 *                buyer  → ToPay: the buyer pays the cargo company on delivery
 *                farmer → the farmer books it prepaid, free for the buyer
 *              Either way nothing for cargo is paid online.
 *
 * Decisions (user, 2026-11-10): pickup points stay on the profile (shown and
 * edited in this step); cargo services = a known list + Other; cargo REPLACES
 * the old "Transportable across AP & TG" (charge per state) — a listing saved
 * with that keeps working until it is edited.
 *
 * Storage (scripts/courier-options-migration.sql, on produce_listings):
 *   courier_type      'local' | 'cargo' | null (pickup only)
 *   cargo_services    jsonb array of service names
 *   delivery_paid_by  'farmer' | 'buyer' | null (pickup only)
 * Cargo also writes retail_reach = 'transport' with ₹0 for AP and TG, so the
 * shop's existing reach rules offer it across both states at no online charge.
 */

import { isMissingColumnError } from '@/lib/missingColumn'

export type Msg = { en: string; te: string }
export type CourierType = 'local' | 'cargo'
export type PaidBy = 'farmer' | 'buyer'

/** Cargo / parcel services common in AP & TG. "Other" names are typed in. */
export const KNOWN_CARGO_SERVICES = [
  'APSRTC Cargo',
  'TGSRTC Logistics',
  'VRL Logistics',
  'Navata Road Transport',
  'KPN Parcel Service',
  'SRMT',
] as const

export const MAX_CARGO_SERVICES = 12
export const MAX_CARGO_NAME = 40
export const MAX_COURIER_CHARGE = 99999
export const MAX_RADIUS_KM = 500

export const COURIER_COLUMNS = ['courier_type', 'cargo_services', 'delivery_paid_by'] as const

/** What the form holds (strings from the inputs). */
export type CourierForm = {
  courierType: CourierType | ''
  cargoServices: string[]
  /** The "Other" box: comma- or line-separated names. */
  otherCargo: string
  paidBy: PaidBy | ''
  charge: string
  radius: string
}

export const EMPTY_COURIER_FORM: CourierForm = { courierType: '', cargoServices: [], otherCargo: '', paidBy: '', charge: '', radius: '' }

const fail = (en: string, te: string) => ({ ok: false as const, error: { en, te } })

/** Clean a list of names: trimmed, no repeats (case-insensitive), capped. */
export function normalizeCargoServices(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\n]/) : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of list) {
    if (typeof x !== 'string') continue
    const name = x.replace(/\s+/g, ' ').trim().slice(0, MAX_CARGO_NAME)
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push(name)
  }
  return out.slice(0, MAX_CARGO_SERVICES)
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) ? n : NaN
}

export type CourierColumns = {
  courier_type: CourierType | null
  cargo_services: string[]
  delivery_paid_by: PaidBy | null
  delivery_charge: number | null
  delivery_radius_km: number | null
  /** Only set for cargo (and cleared for local/pickup when `fromCargo`). */
  retail_reach?: 'local' | 'transport'
  retail_transport_rates?: Record<string, number>
}

/**
 * Check the Delivery step and turn it into columns. Mirrors the migration's
 * CHECKs. `deliveryMode` is the existing pickup / courier / both choice.
 */
export function resolveCourier(input: {
  deliveryMode: unknown
  courierType: unknown
  cargoServices?: unknown
  otherCargo?: unknown
  paidBy: unknown
  charge?: unknown
  radius?: unknown
}): { ok: true; columns: CourierColumns } | { ok: false; error: Msg } {
  const mode = input.deliveryMode
  if (mode === 'pickup') {
    return { ok: true, columns: { courier_type: null, cargo_services: [], delivery_paid_by: null, delivery_charge: null, delivery_radius_km: null, retail_reach: 'local', retail_transport_rates: {} } }
  }
  if (mode !== 'courier' && mode !== 'both') {
    return fail('Choose a delivery method: Pickup only, I will courier, or Both.', 'డెలివరీ విధానం ఎంచుకోండి: పికప్ మాత్రమే, నేను డెలివరీ చేస్తా, లేదా రెండూ.')
  }
  const type = input.courierType
  if (type !== 'local' && type !== 'cargo') {
    return fail('How will you send it? Choose Local delivery or Cargo.', 'ఎలా పంపుతారు? లోకల్ డెలివరీ లేదా కార్గో ఎంచుకోండి.')
  }
  const paidBy = input.paidBy
  if (paidBy !== 'farmer' && paidBy !== 'buyer') {
    return fail('Who pays for delivery? Choose Farmer or Buyer.', 'డెలివరీ ఖర్చు ఎవరు భరిస్తారు? రైతు లేదా కొనుగోలుదారు ఎంచుకోండి.')
  }

  if (type === 'cargo') {
    const services = normalizeCargoServices([
      ...(Array.isArray(input.cargoServices) ? input.cargoServices : normalizeCargoServices(input.cargoServices)),
      ...normalizeCargoServices(input.otherCargo),
    ])
    if (services.length === 0) {
      return fail('Choose at least one cargo service in your area that takes ToPay.', 'మీ ప్రాంతంలో ToPay తీసుకునే కనీసం ఒక కార్గో సర్వీస్ ఎంచుకోండి.')
    }
    return {
      ok: true,
      columns: {
        courier_type: 'cargo', cargo_services: services, delivery_paid_by: paidBy,
        // Nothing for cargo is paid online: ToPay, or the farmer pays it.
        delivery_charge: 0, delivery_radius_km: null,
        retail_reach: 'transport', retail_transport_rates: { AP: 0, TG: 0 },
      },
    }
  }

  // Local delivery.
  const radius = num(input.radius)
  if (radius !== null && (Number.isNaN(radius) || radius <= 0 || radius > MAX_RADIUS_KM)) {
    return fail(`Delivery radius must be 1 to ${MAX_RADIUS_KM} km, or left blank.`, `డెలివరీ పరిధి 1 నుండి ${MAX_RADIUS_KM} కి.మీ. ఉండాలి, లేదా ఖాళీగా వదలండి.`)
  }
  let charge = 0
  if (paidBy === 'buyer') {
    const c = num(input.charge)
    if (c === null) return fail('Enter the delivery charge the buyer pays.', 'కొనుగోలుదారు చెల్లించే డెలివరీ ఛార్జ్ నమోదు చేయండి.')
    if (Number.isNaN(c) || c <= 0 || c > MAX_COURIER_CHARGE) {
      return fail('Delivery charge must be a number above 0. If it is free, choose "Farmer pays".', 'డెలివరీ ఛార్జ్ 0 కంటే ఎక్కువ ఉండాలి. ఉచితమైతే "రైతు భరిస్తారు" ఎంచుకోండి.')
    }
    charge = Math.round(c)
  }
  return {
    ok: true,
    columns: {
      courier_type: 'local', cargo_services: [], delivery_paid_by: paidBy,
      delivery_charge: charge, delivery_radius_km: radius === null ? null : Math.round(radius),
      retail_reach: 'local', retail_transport_rates: {},
    },
  }
}

/** A saved listing → form strings. An old "Transportable" listing opens on Cargo, to be finished. */
export function courierFormFromRow(row: Record<string, unknown> | null | undefined): CourierForm {
  if (!row) return { ...EMPTY_COURIER_FORM }
  const saved = normalizeCargoServices(row.cargo_services)
  const known = new Set<string>(KNOWN_CARGO_SERVICES)
  const type: CourierType | '' =
    row.courier_type === 'local' || row.courier_type === 'cargo' ? row.courier_type
    : row.retail_reach === 'transport' ? 'cargo'
    : row.delivery_mode === 'courier' || row.delivery_mode === 'both' ? 'local'
    : ''
  const charge = num(row.delivery_charge)
  const paidBy: PaidBy | '' = row.delivery_paid_by === 'farmer' || row.delivery_paid_by === 'buyer'
    ? row.delivery_paid_by
    // Before this step existed: a charge meant the buyer paid it, ₹0 / none meant free.
    : type === 'local' ? (charge !== null && charge > 0 ? 'buyer' : 'farmer') : ''
  return {
    courierType: type,
    cargoServices: saved.filter((s) => known.has(s)),
    otherCargo: saved.filter((s) => !known.has(s)).join(', '),
    paidBy,
    charge: charge !== null && !Number.isNaN(charge) && charge > 0 ? String(charge) : '',
    radius: row.delivery_radius_km != null ? String(row.delivery_radius_km) : '',
  }
}

/** The columns as a request body (moderator API / farmer payload). */
export function courierRequestBody(f: CourierForm): Record<string, unknown> {
  return {
    courier_type: f.courierType || null,
    cargo_services: [...f.cargoServices, ...normalizeCargoServices(f.otherCargo)],
    delivery_paid_by: f.paidBy || null,
    delivery_charge: f.charge,
    delivery_radius_km: f.radius,
  }
}

/** Shown when cargo is saved on a server without scripts/courier-options-migration.sql. */
export const COURIER_NOT_READY: Msg = {
  en: 'Cargo delivery is not switched on yet. Choose Local delivery for now, or try again later.',
  te: 'కార్గో డెలివరీ ఇంకా ప్రారంభం కాలేదు. ప్రస్తుతానికి లోకల్ డెలివరీ ఎంచుకోండి, లేదా తర్వాత ప్రయత్నించండి.',
}

export function isCourierColumnMissing(msg: string | null | undefined): boolean {
  return COURIER_COLUMNS.some((c) => isMissingColumnError(msg, c))
}

/**
 * Server check for a seller's payload (column names). Applies only when the
 * payload names a courier column; then the whole Delivery step is checked with
 * the form's rules and normalised (charge, radius and reach included), so a
 * crafted request can't, say, save cargo with a paid online charge. Mutates.
 */
export function applyCourierColumns(payload: Record<string, unknown>): Msg | null {
  if (!COURIER_COLUMNS.some((c) => c in payload)) return null
  const r = resolveCourier({
    deliveryMode: payload.delivery_mode,
    courierType: payload.courier_type,
    cargoServices: payload.cargo_services,
    paidBy: payload.delivery_paid_by,
    charge: payload.delivery_charge,
    radius: payload.delivery_radius_km,
  })
  if (!r.ok) return r.error
  Object.assign(payload, r.columns)
  return null
}

/** The same payload without the courier columns (pre-migration retry for Local / Pickup). */
export function withoutCourier<T extends Record<string, unknown>>(payload: T): T {
  const copy: Record<string, unknown> = { ...payload }
  for (const c of COURIER_COLUMNS) delete copy[c]
  return copy as T
}

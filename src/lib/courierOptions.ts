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
 *     cargo  — sent by cargo/parcel services anywhere in India (2026-11-11;
 *              it was AP & TG the day before). The farmer
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
 * Cargo also writes retail_reach = 'transport' (₹0 for AP and TG kept for the
 * old reach check); the shop's reach rule offers cargo anywhere in India and
 * the order route takes any valid pincode for it (2026-11-11), with no
 * online transport charge.
 */

import { isMissingColumnError } from '@/lib/missingColumn'
import { haversineKm } from '@/lib/location'

export type Msg = { en: string; te: string }
/** 'both' (2026-11-27): local for buyers within 20 km, cargo further away. */
export type CourierType = 'local' | 'cargo' | 'both'
export type PaidBy = 'farmer' | 'buyer'

/** Cargo / parcel services common in AP & TG (they ship India-wide). "Other" names are typed in. */
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

/**
 * What the produce form holds. Since 2026-11-27 only HOW it goes: the
 * services, who pays, the local charge and radius are set once on the
 * farmer's profile (src/lib/deliverySettings.ts).
 */
export type CourierForm = { courierType: CourierType | '' }

export const EMPTY_COURIER_FORM: CourierForm = { courierType: '' }

/** Does this courier type send by cargo (to buyers beyond 20 km)? */
export const sendsByCargo = (t: unknown): boolean => t === 'cargo' || t === 'both'

/** The farmer's profile delivery settings (src/lib/deliverySettings.ts). */
export type ProfileDelivery = {
  cargoServices: string[]
  cargoPaidBy: PaidBy | null
  localPaidBy: PaidBy | null
  /** ₹ per order when the buyer pays for local delivery. */
  localCharge: number | null
  /** null = the default 25 km. */
  localRadiusKm: number | null
}

/** Is cargo ready to be chosen on a produce? */
export const cargoReady = (s: ProfileDelivery): boolean => s.cargoServices.length > 0 && s.cargoPaidBy !== null
/** Is local delivery ready to be chosen on a produce? */
export const localReady = (s: ProfileDelivery): boolean =>
  s.localPaidBy === 'farmer' || (s.localPaidBy === 'buyer' && s.localCharge !== null && s.localCharge > 0)

export const CARGO_SETTINGS_MISSING: Msg = {
  en: 'Add your cargo services in your profile first (Delivery settings).',
  te: 'ముందు మీ ప్రొఫైల్‌లో కార్గో సర్వీసులు జోడించండి (డెలివరీ సెట్టింగ్స్).',
}
export const LOCAL_SETTINGS_MISSING: Msg = {
  en: 'Set your local delivery in your profile first (Delivery settings).',
  te: 'ముందు మీ ప్రొఫైల్‌లో లోకల్ డెలివరీ సెట్ చేయండి (డెలివరీ సెట్టింగ్స్).',
}

/** What a courier type still needs from the profile; null = ready. */
export function missingFor(type: unknown, s: ProfileDelivery): Msg | null {
  if (sendsByCargo(type) && !cargoReady(s)) return CARGO_SETTINGS_MISSING
  if ((type === 'local' || type === 'both') && !localReady(s)) return LOCAL_SETTINGS_MISSING
  return null
}

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
 * Check the Delivery step and turn it into columns. `deliveryMode` is the
 * pickup / courier / both choice; `courierType` is Local / Cargo / Both. The
 * rest comes from the farmer's profile (`settings`) — the same copy the
 * database trigger makes (scripts/delivery-settings-migration.sql). `settings`
 * undefined = only the type is checked (the browser); null = a database without that migration: Local saves as free delivery,
 * Cargo / Both are refused (COURIER_NOT_READY).
 */
export function resolveCourier(input: {
  deliveryMode: unknown
  courierType: unknown
  settings?: ProfileDelivery | null
}): { ok: true; columns: CourierColumns } | { ok: false; error: Msg } {
  const mode = input.deliveryMode
  if (mode === 'pickup') {
    return { ok: true, columns: { courier_type: null, cargo_services: [], delivery_paid_by: null, delivery_charge: null, delivery_radius_km: null, retail_reach: 'local', retail_transport_rates: {} } }
  }
  if (mode !== 'courier' && mode !== 'both') {
    return fail('Choose a delivery method: Pickup only, I will courier, or Both.', 'డెలివరీ విధానం ఎంచుకోండి: పికప్ మాత్రమే, నేను డెలివరీ చేస్తా, లేదా రెండూ.')
  }
  const type = input.courierType
  if (type !== 'local' && type !== 'cargo' && type !== 'both') {
    return fail('How will you send it? Choose Local, Cargo or Both.', 'ఎలా పంపుతారు? లోకల్, కార్గో లేదా రెండూ ఎంచుకోండి.')
  }
  // Not given (the browser before the profile has loaded): the type alone is
  // checked here — the server fills the rest from the profile.
  if (input.settings === undefined) {
    return { ok: true, columns: { courier_type: type, cargo_services: [], delivery_paid_by: null, delivery_charge: null, delivery_radius_km: null } }
  }
  const s = input.settings
  if (!s) {
    if (type !== 'local') return { ok: false, error: COURIER_NOT_READY }
    return { ok: true, columns: { courier_type: 'local', cargo_services: [], delivery_paid_by: 'farmer', delivery_charge: 0, delivery_radius_km: null, retail_reach: 'local', retail_transport_rates: {} } }
  }
  const missing = missingFor(type, s)
  if (missing) return { ok: false, error: missing }
  const cargo = sendsByCargo(type)
  const local = type === 'local' || type === 'both'
  return {
    ok: true,
    columns: {
      courier_type: type,
      cargo_services: cargo ? s.cargoServices : [],
      delivery_paid_by: (cargo ? s.cargoPaidBy : s.localPaidBy) as PaidBy,
      // Nothing for cargo is paid online: ToPay, or the farmer pays it.
      delivery_charge: local && s.localPaidBy === 'buyer' ? Math.round(s.localCharge ?? 0) : 0,
      delivery_radius_km: local ? s.localRadiusKm : null,
      retail_reach: cargo ? 'transport' : 'local',
      retail_transport_rates: cargo ? { AP: 0, TG: 0 } : {},
    },
  }
}

/** A saved listing → the form. An old "Transportable" listing opens on Cargo. */
export function courierFormFromRow(row: Record<string, unknown> | null | undefined): CourierForm {
  if (!row) return { ...EMPTY_COURIER_FORM }
  const type: CourierType | '' =
    row.courier_type === 'local' || row.courier_type === 'cargo' || row.courier_type === 'both' ? row.courier_type
    : row.retail_reach === 'transport' ? 'cargo'
    : row.delivery_mode === 'courier' || row.delivery_mode === 'both' ? 'local'
    : ''
  return { courierType: type }
}

/** The form as a request body (moderator API / farmer payload). */
export function courierRequestBody(f: CourierForm): Record<string, unknown> {
  return { courier_type: f.courierType || null }
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
export function applyCourierColumns(payload: Record<string, unknown>, settings: ProfileDelivery | null): Msg | null {
  if (!COURIER_COLUMNS.some((c) => c in payload)) return null
  const r = resolveCourier({ deliveryMode: payload.delivery_mode, courierType: payload.courier_type, settings })
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

// ── Checkout (part 2, 2026-11-10) ──────────────────────────────────

/** What a cart line carries for a cargo produce. */
export type CartCargoFields = {
  courierType?: CourierType
  cargoServices?: string[]
  deliveryPaidBy?: PaidBy
}

/** The cargo fields for a cart line (nothing for local / pickup produce). */
export function cartCargoFields(l: { courier_type?: unknown; cargo_services?: unknown; delivery_paid_by?: unknown } | null | undefined): CartCargoFields {
  // 'both' (2026-11-27) goes by cargo to far buyers too.
  if (!l || !sendsByCargo(l.courier_type)) return {}
  const services = normalizeCargoServices(l.cargo_services)
  if (!services.length) return {}
  return { courierType: 'cargo', cargoServices: services, deliveryPaidBy: l.delivery_paid_by === 'farmer' ? 'farmer' : 'buyer' }
}

/**
 * The services a buyer can pick for one farmer's parcel: the ones EVERY cargo
 * line lists (one parcel per farmer, one cargo company). Order kept from the
 * first line. Empty = the lines share none (order them separately).
 */
export function commonCargoServices(lines: ReadonlyArray<{ cargoServices?: readonly string[] }>): string[] {
  const lists = lines.map((l) => normalizeCargoServices(l.cargoServices ?? []))
  if (!lists.length) return []
  return lists[0].filter((s) => lists.every((l) => l.some((x) => x.toLowerCase() === s.toLowerCase())))
}

/** Who pays, for the parcel: the buyer if ANY line says ToPay. */
export function parcelPaidBy(lines: ReadonlyArray<{ deliveryPaidBy?: PaidBy }>): PaidBy {
  return lines.some((l) => l.deliveryPaidBy !== 'farmer') ? 'buyer' : 'farmer'
}

/**
 * Server check of the buyer's cargo choice for one farmer's order. `rows` are
 * the transported courier lines' listings. null = no cargo line (nothing to
 * check); otherwise the chosen service must be one every cargo line lists.
 */
export function checkCargoChoice(
  rows: ReadonlyArray<{ name: string; courier_type?: unknown; cargo_services?: unknown; delivery_paid_by?: unknown }>,
  chosen: unknown,
): null | { ok: true; service: string; paidBy: PaidBy } | { ok: false; error: string } {
  const cargo = rows.filter((r) => sendsByCargo(r.courier_type))
  if (!cargo.length) return null
  const lines = cargo.map((r) => cartCargoFields(r))
  const common = commonCargoServices(lines)
  if (!common.length) return { ok: false, error: `${cargo.map((r) => r.name).join(' and ')} go by different cargo services. Please order them separately.` }
  const pick = typeof chosen === 'string' ? chosen.trim().toLowerCase() : ''
  const service = common.find((s) => s.toLowerCase() === pick)
  if (!service) return { ok: false, error: `Choose the cargo service that works in your area: ${common.join(', ')}.` }
  return { ok: true, service, paidBy: parcelPaidBy(lines) }
}

// ── Cargo only for far buyers (client card 2026-11-27) ─────────────

/**
 * A cargo produce goes by cargo only when the buyer is FAR from the farm.
 * Within this distance home delivery is the normal local delivery (no cargo
 * service asked). Only for the cargo decision — the produce's own local
 * radius (retailReach.ts) is unchanged.
 */
export const CARGO_LOCAL_KM = 20

type Point = { lat: number; lng: number } | null | undefined

/**
 * Must this buyer's home delivery of a cargo produce go by cargo? Yes when
 * they are more than CARGO_LOCAL_KM away — and also when we can't tell (no
 * saved buyer location, or no farm point), to be safe (decision 2026-11-27).
 * The farm point is the rough ~5 km area (farmArea.ts), so the line is soft by
 * a few km.
 */
export function cargoNeeded(farm: Point, buyer: Point): boolean {
  if (!farm || !buyer) return true
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n)
  if (!ok(farm.lat) || !ok(farm.lng) || !ok(buyer.lat) || !ok(buyer.lng)) return true
  if (buyer.lat === 0 && buyer.lng === 0) return true
  return haversineKm(buyer.lat, buyer.lng, farm.lat, farm.lng) > CARGO_LOCAL_KM
}

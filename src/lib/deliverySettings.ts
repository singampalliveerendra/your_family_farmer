/**
 * Delivery settings on the farmer's PROFILE (client card 2026-11-27).
 *
 * Set once, used by every produce: the cargo services in their area that take
 * ToPay, who pays for cargo, who pays for local delivery (and the charge), and
 * how far they deliver locally. Each produce then only picks HOW it goes —
 * Local, Cargo or Both (courierOptions.ts). The database copies these onto the
 * produce (scripts/delivery-settings-migration.sql), so buyers' screens read
 * the produce as before.
 */

import {
  KNOWN_CARGO_SERVICES, MAX_COURIER_CHARGE, COURIER_COLUMNS, applyCourierColumns, MAX_RADIUS_KM, normalizeCargoServices, cargoReady, localReady,
  type Msg as CourierMsg, type PaidBy, type ProfileDelivery,
} from '@/lib/courierOptions'
export { cargoReady, localReady, missingFor, CARGO_SETTINGS_MISSING, LOCAL_SETTINGS_MISSING } from '@/lib/courierOptions'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumnError } from '@/lib/missingColumn'

type Msg = { en: string; te: string }

export const DELIVERY_SETTINGS_COLUMNS = 'cargo_services, cargo_paid_by, local_paid_by, local_delivery_charge, local_radius_km'

export type DeliverySettings = ProfileDelivery

export const EMPTY_SETTINGS: DeliverySettings = { cargoServices: [], cargoPaidBy: null, localPaidBy: null, localCharge: null, localRadiusKm: null }

const paid = (v: unknown): PaidBy | null => (v === 'farmer' || v === 'buyer' ? v : null)
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** A farmers row (or API answer) → settings. */
export function settingsFromRow(row: Record<string, unknown> | null | undefined): DeliverySettings {
  if (!row) return { ...EMPTY_SETTINGS }
  return {
    cargoServices: normalizeCargoServices(row.cargo_services),
    cargoPaidBy: paid(row.cargo_paid_by),
    localPaidBy: paid(row.local_paid_by),
    localCharge: num(row.local_delivery_charge),
    localRadiusKm: num(row.local_radius_km),
  }
}

// ── The editor form ────────────────────────────────────────────────

export type SettingsForm = {
  cargoServices: string[]
  otherCargo: string
  cargoPaidBy: PaidBy | ''
  localPaidBy: PaidBy | ''
  localCharge: string
  localRadius: string
}

export function formFromSettings(s: DeliverySettings): SettingsForm {
  const known = new Set<string>(KNOWN_CARGO_SERVICES)
  return {
    cargoServices: s.cargoServices.filter((x) => known.has(x)),
    otherCargo: s.cargoServices.filter((x) => !known.has(x)).join(', '),
    cargoPaidBy: s.cargoPaidBy ?? '',
    localPaidBy: s.localPaidBy ?? '',
    localCharge: s.localCharge !== null && s.localCharge > 0 ? String(s.localCharge) : '',
    localRadius: s.localRadiusKm !== null ? String(s.localRadiusKm) : '',
  }
}

/** The request body the editor sends. */
export function bodyFromForm(f: SettingsForm): Record<string, unknown> {
  return {
    cargo_services: [...f.cargoServices, ...normalizeCargoServices(f.otherCargo)],
    cargo_paid_by: f.cargoPaidBy || null,
    local_paid_by: f.localPaidBy || null,
    local_delivery_charge: f.localCharge,
    local_radius_km: f.localRadius,
  }
}

/**
 * Check what is saved and turn it into farmers columns. Each part is
 * optional (a farmer who never sends by cargo leaves it empty), but a part
 * that is started must be complete. `inUse` = the courier types the farmer's
 * produce already use: the settings they rely on can't be emptied.
 */
export function validateSettings(
  body: Record<string, unknown>,
  inUse: { cargo: boolean; local: boolean } = { cargo: false, local: false },
): { ok: true; columns: Record<string, unknown>; settings: DeliverySettings } | { ok: false; error: Msg } {
  const raw = Array.isArray(body.cargo_services) ? body.cargo_services : []
  const services = normalizeCargoServices(raw)
  const cargoPaidBy = paid(body.cargo_paid_by)
  if (services.length && !cargoPaidBy) return fail('Who pays for cargo? Choose Buyer (ToPay) or I pay.', 'కార్గో ఖర్చు ఎవరు భరిస్తారు? కొనుగోలుదారు (ToPay) లేదా నేను ఎంచుకోండి.')
  if (!services.length && inUse.cargo) return fail('Some of your produce goes by cargo — keep at least one cargo service.', 'మీ కొన్ని ఉత్పత్తులు కార్గోలో వెళ్తాయి — కనీసం ఒక కార్గో సర్వీస్ ఉంచండి.')

  const localPaidBy = paid(body.local_paid_by)
  const radius = num(body.local_radius_km)
  if (radius !== null && (radius < 1 || radius > MAX_RADIUS_KM)) return fail(`Local delivery distance must be 1 to ${MAX_RADIUS_KM} km, or left blank.`, `లోకల్ డెలివరీ దూరం 1 నుండి ${MAX_RADIUS_KM} కి.మీ. ఉండాలి, లేదా ఖాళీగా వదలండి.`)
  let charge: number | null = null
  if (localPaidBy === 'buyer') {
    const c = num(body.local_delivery_charge)
    if (c === null) return fail('Enter the local delivery charge the buyer pays.', 'కొనుగోలుదారు చెల్లించే లోకల్ డెలివరీ ఛార్జ్ నమోదు చేయండి.')
    if (c <= 0 || c > MAX_COURIER_CHARGE) return fail('Delivery charge must be above 0. If it is free, choose "I pay".', 'డెలివరీ ఛార్జ్ 0 కంటే ఎక్కువ ఉండాలి. ఉచితమైతే "నేను భరిస్తా" ఎంచుకోండి.')
    charge = Math.round(c)
  }
  if (!localPaidBy && inUse.local) return fail('Some of your produce is delivered locally — choose who pays for local delivery.', 'మీ కొన్ని ఉత్పత్తులు లోకల్‌గా డెలివరీ అవుతాయి — లోకల్ డెలివరీ ఖర్చు ఎవరు భరిస్తారో ఎంచుకోండి.')

  const settings: DeliverySettings = {
    cargoServices: services,
    cargoPaidBy: services.length ? cargoPaidBy : null,
    localPaidBy,
    localCharge: charge,
    localRadiusKm: radius === null ? null : Math.round(radius),
  }
  return {
    ok: true,
    settings,
    columns: {
      cargo_services: settings.cargoServices,
      cargo_paid_by: settings.cargoPaidBy,
      local_paid_by: settings.localPaidBy,
      local_delivery_charge: settings.localCharge,
      local_radius_km: settings.localRadiusKm,
    },
  }
}

function fail(en: string, te: string): { ok: false; error: Msg } {
  return { ok: false, error: { en, te } }
}

/** Short lines for the produce form's summary. */
export function settingsSummary(s: DeliverySettings, L: (en: string, te: string) => string): { cargo: string | null; local: string | null } {
  const cargo = cargoReady(s)
    ? `${s.cargoServices.join(', ')} · ${s.cargoPaidBy === 'farmer' ? L('you pay', 'మీరు భరిస్తారు') : L('ToPay (buyer pays)', 'ToPay (కొనుగోలుదారు)')}`
    : null
  const km = s.localRadiusKm ?? 25
  const local = localReady(s)
    ? `${L(`Within ${km} km`, `${km} కి.మీ. లోపు`)} · ${s.localPaidBy === 'farmer' ? L('free for the buyer', 'కొనుగోలుదారుకు ఉచితం') : `₹${s.localCharge} ${L('per order', 'ఒక్కో ఆర్డర్')}`}`
    : null
  return { cargo, local }
}

// ── Server helpers ─────────────────────────────────────────────────

/**
 * A farmer's settings for a server route. `ready: false` = the migration has
 * not run (no columns yet) — routes then refuse Cargo / Both with
 * COURIER_NOT_READY and keep the old behaviour for Local.
 */
export async function loadSettings(db: SupabaseClient, farmerId: string): Promise<{ ready: boolean; settings: DeliverySettings }> {
  const { data, error } = await db.from('farmers').select(DELIVERY_SETTINGS_COLUMNS).eq('id', farmerId).maybeSingle()
  if (error) {
    if (isMissingColumnError(error.message, 'cargo_paid_by') || isMissingColumnError(error.message, 'local_paid_by') || isMissingColumnError(error.message, 'cargo_services')) {
      return { ready: false, settings: { ...EMPTY_SETTINGS } }
    }
    return { ready: true, settings: { ...EMPTY_SETTINGS } }
  }
  return { ready: true, settings: settingsFromRow(data as Record<string, unknown> | null) }
}

/** Did a produce save fail because the profile has no cargo services (the DB trigger)? */
export const isCargoProfileError = (msg: string | null | undefined): boolean => typeof msg === 'string' && msg.includes('CARGO_PROFILE_REQUIRED')

/**
 * For the produce save routes: when the request touches the delivery, check
 * the courier type against the farmer's profile and fill in the columns the
 * profile decides (the DB trigger does the same). null = fine / untouched.
 */
export async function applyProfileCourier(db: SupabaseClient, farmerId: string, payload: Record<string, unknown>): Promise<CourierMsg | null> {
  if (!COURIER_COLUMNS.some((c) => c in payload)) return null
  const { ready, settings } = await loadSettings(db, farmerId)
  return applyCourierColumns(payload, ready ? settings : null)
}

/**
 * Save a farmer's settings (the farmer's own route and the moderator's).
 * The courier types their produce already use decide what can't be emptied.
 * The DB trigger then re-copies the settings onto every delivered produce.
 */
export async function saveSettings(
  db: SupabaseClient,
  farmerId: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; settings: DeliverySettings } | { ok: false; error: Msg; status: number }> {
  const { data: used } = await db.from('produce_listings').select('courier_type').eq('farmer_id', farmerId).not('courier_type', 'is', null)
  const types = new Set(((used ?? []) as Array<{ courier_type: string }>).map((r) => r.courier_type))
  const inUse = { cargo: types.has('cargo') || types.has('both'), local: types.has('local') || types.has('both') }
  const v = validateSettings(body, inUse)
  if (!v.ok) return { ok: false, error: v.error, status: 400 }
  const { error } = await db.from('farmers').update(v.columns).eq('id', farmerId)
  if (error) {
    if (isMissingColumnError(error.message, 'cargo_paid_by') || isMissingColumnError(error.message, 'local_paid_by')) {
      return { ok: false, status: 503, error: { en: 'Delivery settings are not switched on yet. Please try again later.', te: 'డెలివరీ సెట్టింగ్స్ ఇంకా ప్రారంభం కాలేదు. తర్వాత మళ్ళీ ప్రయత్నించండి.' } }
    }
    if (isCargoProfileError(error.message)) return { ok: false, status: 400, error: CARGO_SETTINGS_MISSING_MSG }
    return { ok: false, status: 500, error: { en: 'Could not save. Please try again.', te: 'సేవ్ కాలేదు. మళ్ళీ ప్రయత్నించండి.' } }
  }
  return { ok: true, settings: v.settings }
}

const CARGO_SETTINGS_MISSING_MSG: Msg = {
  en: 'Some of your produce goes by cargo — keep at least one cargo service.',
  te: 'మీ కొన్ని ఉత్పత్తులు కార్గోలో వెళ్తాయి — కనీసం ఒక కార్గో సర్వీస్ ఉంచండి.',
}

/** The same message for a moderator, who edits someone else's profile. */
export const forModerator = (en: string): string => en.replace(/\byour profile\b/g, 'the farmer’s profile').replace(/^Some of your produce/, 'Some of this farmer’s produce')

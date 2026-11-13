/**
 * Wholesale — a produce can be sold Retail, Wholesale or Both.
 *
 * Columns (scripts/wholesale-migration.sql), all on produce_listings:
 *   sale_mode                   'retail' | 'wholesale' | 'both'
 *   wholesale_price             ₹ per listing unit
 *   wholesale_min_qty           least a wholesale buyer can order
 *   wholesale_pack_size         optional; wholesale orders go in multiples of it
 *   wholesale_pack_price        ₹ for ONE pack, exactly as typed (2026-11-10,
 *                               scripts/pack-pricing-migration.sql); with a
 *                               pack size the farmer prices the pack, the
 *                               minimum is one pack, and wholesale_price
 *                               (per unit) is derived from it
 *   wholesale_transport_states  {} = buyer collects, else AP and/or TG
 *
 * Retail and wholesale share one stock (harvests.stock_qty), so nothing here
 * touches stock.
 *
 * One set of rules for every form and route — the farmer/aggregator dashboard,
 * the moderator form, and the moderator API — so they cannot drift apart. The
 * database CHECKs in the migration are the last line; these rules are stricter
 * and give the farmer a message in their own language.
 */

import { isMissingColumnError } from '@/lib/missingColumn'
import { roundQty, unitAllowsFractions } from '@/lib/saleStep'

export const SALE_MODES = ['retail', 'wholesale', 'both'] as const
export type SaleMode = (typeof SALE_MODES)[number]

/* Where a seller transports bulk orders. 'IN' = anywhere in India (client,
 * 2026-11-11): the form now saves only that, with ONE way of charging. 'AP' /
 * 'TG' are lots saved before — they keep working until edited. */
export const TRANSPORT_STATES = ['AP', 'TG', 'IN'] as const
export type TransportState = (typeof TRANSPORT_STATES)[number]
/** What the form saves for "Yes, I can transport". */
export const ALL_INDIA: TransportState = 'IN'

export const SALE_MODE_LABELS: Record<SaleMode, { en: string; te: string; icon: string }> = {
  retail: { en: 'Retail', te: 'చిల్లర', icon: '🛒' },
  wholesale: { en: 'Wholesale', te: 'హోల్‌సేల్', icon: '🚚' },
  both: { en: 'Both', te: 'రెండూ', icon: '🔁' },
}

export const TRANSPORT_STATE_LABELS: Record<TransportState, { en: string; te: string }> = {
  AP: { en: 'Andhra Pradesh', te: 'ఆంధ్రప్రదేశ్' },
  TG: { en: 'Telangana', te: 'తెలంగాణ' },
  IN: { en: 'Pan India transport', te: 'దేశవ్యాప్త రవాణా' },
}

// Column limits: numeric(8,2) for the price, numeric(10,3) for quantities
// (the same as stock_qty).
export const MAX_WHOLESALE_PRICE = 999999.99
export const MAX_WHOLESALE_QTY = 9999999.999

/** Every wholesale column, for stripping a payload on a pre-migration server. */
export const WHOLESALE_COLUMNS = [
  'sale_mode',
  'wholesale_price',
  'wholesale_min_qty',
  'wholesale_pack_size',
  'wholesale_pack_price',
  'wholesale_transport_states',
  'wholesale_transport_rates',
] as const

/* What the seller charges to deliver a bulk order, per state (Phase 6,
 * scripts/bulk-orders-migration.sql; per km + cargo bill 2026-11-05,
 * scripts/transport-bill-migration.sql). The seller picks ONE per state:
 *   per_order  — one fixed charge, paid online with the produce
 *   per_km     — ₹ per km (amount); after delivery the seller enters the km,
 *                the app works out km × rate and the buyer pays the seller
 *                directly (not through the app)
 *   cargo_bill — the actual transport cost: after delivery the seller uploads
 *                the cargo bill with its amount; the buyer pays the seller
 *                directly
 *   per_unit   — OLD (₹ per kg × quantity). No longer offered in the form
 *                (client, 2026-11-05) but a listing saved with it keeps
 *                working until the seller edits it.
 *   free_above — optional, per_order / per_unit only: no charge once the order
 *                is at least this quantity
 * ₹0 per order is allowed (free delivery). A state the seller delivers to but
 * has no rate for is offered as pickup only — an unset rate is never "free". */
export const TRANSPORT_RATE_MODES = ['per_order', 'per_km', 'cargo_bill', 'per_unit'] as const
/** What the form offers now. */
export const OFFERED_TRANSPORT_MODES = ['per_order', 'per_km', 'cargo_bill'] as const
/** Billed after delivery and paid to the seller directly — not part of the online payment. */
export const isBilledAfterDelivery = (mode: TransportRateMode | string | null | undefined): boolean =>
  mode === 'per_km' || mode === 'cargo_bill'
export const MAX_TRANSPORT_KM = 5000
const rateMode = (v: unknown): TransportRateMode =>
  v === 'per_unit' || v === 'per_km' || v === 'cargo_bill' ? v : 'per_order'
export type TransportRateMode = (typeof TRANSPORT_RATE_MODES)[number]
export type TransportRate = { mode: TransportRateMode; amount: number; free_above: number | null }
export type TransportRates = Partial<Record<TransportState, TransportRate>>
/** One state's rate as the form holds it (strings from the inputs). */
export type RateForm = { mode: TransportRateMode; amount: string; freeAbove: string }

export type Msg = { en: string; te: string }

/** Unknown, missing or misspelt reads as 'retail' — how every listing behaved before. */
export function parseSaleMode(raw: unknown): SaleMode {
  return raw === 'wholesale' || raw === 'both' ? raw : 'retail'
}

export const offersWholesale = (mode: SaleMode): boolean => mode !== 'retail'
export const offersRetail = (mode: SaleMode): boolean => mode !== 'wholesale'

/** What the form holds: strings straight from the inputs. */
export type WholesaleForm = {
  saleMode: SaleMode
  price: string
  minQty: string
  packSize: string
  /** ₹ for one pack — asked instead of the per-unit price once a pack size is set. */
  packPrice: string
  /** Transport Yes/No. null = not answered yet. */
  transport: boolean | null
  states: TransportState[]
  /** The charge for each state in `states`. */
  rates: Partial<Record<TransportState, RateForm>>
}

export const EMPTY_WHOLESALE_FORM: WholesaleForm = {
  saleMode: 'retail',
  price: '',
  minQty: '',
  packSize: '',
  packPrice: '',
  transport: null,
  states: [],
  rates: {},
}

/** The columns a save writes. Retail writes only sale_mode, so saved wholesale values survive a switch back. */
export type WholesaleColumns =
  | { sale_mode: 'retail' }
  | {
      sale_mode: 'wholesale' | 'both'
      wholesale_price: number
      wholesale_min_qty: number
      wholesale_pack_size: number | null
      wholesale_pack_price: number | null
      wholesale_transport_states: TransportState[]
      wholesale_transport_rates: TransportRates
    }

export type WholesaleResult = { ok: true; columns: WholesaleColumns } | { ok: false; error: Msg }

const fail = (en: string, te: string): WholesaleResult => ({ ok: false, error: { en, te } })

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * '' / null / undefined → null (left blank). Anything else must be a finite
 * number; otherwise NaN, so the caller reports it instead of treating it as blank.
 */
function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN
  if (typeof raw !== 'string') return NaN
  const s = raw.trim()
  if (!s) return null
  // Number('') is 0 and Number('1e3') is 1000 — accept plain decimals only.
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return NaN
  return Number(s)
}

/** Clean the state list: known states only, no repeats, always AP before TG. */
export function normalizeStates(raw: unknown): TransportState[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  const set = new Set(list.map((s) => String(s).trim().toUpperCase()))
  return TRANSPORT_STATES.filter((s) => set.has(s))
}

/** Yes/No from a form or a JSON body. Anything not clearly yes/no is unanswered. */
export function parseTransport(raw: unknown): boolean | null {
  if (raw === true || raw === 'yes' || raw === 'true' || raw === 1 || raw === '1') return true
  if (raw === false || raw === 'no' || raw === 'false' || raw === 0 || raw === '0') return false
  return null
}

/** Is `qty` a whole number of `pack`s? Tolerant of float noise (0.1 + 0.2). */
export function isMultipleOf(qty: number, pack: number): boolean {
  if (!(pack > 0)) return false
  const ratio = qty / pack
  return Math.abs(ratio - Math.round(ratio)) < 1e-6
}

/**
 * Check the wholesale part of a produce form and turn it into columns.
 *
 * Rules:
 *  - Retail: nothing else is checked; only sale_mode is written.
 *  - Wholesale / Both (client card 2026-11-10):
 *     • WITH a pack size: the price of ONE pack is required (an old caller
 *       that sends only a per-unit price gets pack price = price × pack); the
 *       minimum is one pack (any typed minimum is ignored); the per-unit
 *       wholesale_price is derived (pack price ÷ pack)
 *     • WITHOUT a pack size: a minimum quantity and a price per unit
 *     • prices > 0, at most MAX_WHOLESALE_PRICE, kept to 2 decimals
 *       (quantities to 3, like stock)
 *     • quantities > 0, at most MAX_WHOLESALE_QTY; whole numbers on
 *       piece / bunch / dozen units
 *     • transport must be answered; Yes needs at least one state
 */
export function resolveWholesale(input: {
  saleMode: unknown
  price: unknown
  minQty: unknown
  packSize: unknown
  /** ₹ for one pack (used when a pack size is set). */
  packPrice?: unknown
  transport: unknown
  states: unknown
  /** Per-state charges, in the form's or the column's shape. */
  rates?: unknown
  unit?: string | null
}): WholesaleResult {
  const mode = parseSaleMode(input.saleMode)
  if (mode === 'retail') return { ok: true, columns: { sale_mode: 'retail' } }

  const pack = toNumber(input.packSize)
  const min = toNumber(input.minQty)
  for (const [n, en, te] of [
    [pack, 'Pack size', 'ప్యాక్ పరిమాణం'],
    [pack === null ? min : null, 'Minimum quantity', 'కనీస పరిమాణం'],
  ] as const) {
    if (n === null) continue
    if (Number.isNaN(n) || n <= 0) return fail(`${en} must be a number above 0.`, `${te} 0 కంటే ఎక్కువ సంఖ్య ఉండాలి.`)
    if (n > MAX_WHOLESALE_QTY) return fail(`${en} is too large.`, `${te} చాలా ఎక్కువగా ఉంది.`)
    if (!unitAllowsFractions(input.unit) && !Number.isInteger(n)) {
      return fail(`${en} must be a whole number for this unit.`, `ఈ యూనిట్‌కు ${te} పూర్తి సంఖ్య ఉండాలి.`)
    }
  }
  if (pack === null && min === null) {
    return fail('Enter the pack size or the minimum quantity.', 'ప్యాక్ పరిమాణం లేదా కనీస పరిమాణం నమోదు చేయండి.')
  }
  const packSize = pack === null ? null : roundQty(pack)
  // With a pack, the minimum is one pack (client card 2026-11-10).
  const minQty = packSize !== null ? packSize : roundQty(min as number)

  // The price: one pack's when there is a pack, else per unit.
  let price: number
  let packPrice: number | null = null
  if (packSize !== null) {
    const typed = toNumber(input.packPrice)
    const perUnit = toNumber(input.price)
    const pp = typed !== null ? typed : perUnit !== null && !Number.isNaN(perUnit) ? round2(perUnit * packSize) : null
    if (pp === null) return fail('Enter the wholesale price of one pack.', 'ఒక ప్యాక్ హోల్‌సేల్ ధర నమోదు చేయండి.')
    if (Number.isNaN(pp) || pp <= 0) return fail('Wholesale pack price must be a number above 0.', 'హోల్‌సేల్ ప్యాక్ ధర 0 కంటే ఎక్కువ సంఖ్య ఉండాలి.')
    if (pp > MAX_WHOLESALE_PRICE) return fail('Wholesale pack price is too high.', 'హోల్‌సేల్ ప్యాక్ ధర చాలా ఎక్కువగా ఉంది.')
    packPrice = round2(pp)
    price = round2(packPrice / packSize)
    if (!(price > 0)) return fail('Wholesale pack price is too low for this pack size.', 'ఈ ప్యాక్ పరిమాణానికి హోల్‌సేల్ ప్యాక్ ధర చాలా తక్కువ.')
  } else {
    const p = toNumber(input.price)
    if (p === null) return fail('Enter the wholesale price.', 'హోల్‌సేల్ ధర నమోదు చేయండి.')
    if (Number.isNaN(p) || p <= 0) {
      return fail('Wholesale price must be a number above 0.', 'హోల్‌సేల్ ధర 0 కంటే ఎక్కువ సంఖ్య ఉండాలి.')
    }
    if (p > MAX_WHOLESALE_PRICE) {
      return fail('Wholesale price is too high.', 'హోల్‌సేల్ ధర చాలా ఎక్కువగా ఉంది.')
    }
    price = p
  }

  // The "Can you transport anywhere in India?" question left the form
  // (client 2026-11-13): bulk delivery now follows the produce's Courier
  // setting (bulkOrder.ts deliveryOptions). Not answered = no wholesale-only
  // transport. An older caller that still sends Yes + states keeps working.
  const transport = parseTransport(input.transport) ?? false
  const states = transport ? normalizeStates(input.states) : []
  if (transport && states.length === 0) {
    return fail('Choose Yes or No for transport.', 'రవాణాకు అవును లేదా కాదు ఎంచుకోండి.')
  }

  // The charge for each state they deliver to (₹0 = free). Left blank, that
  // state is pickup-only in the app until a charge is set — it is never read
  // as free, and a listing saved before charges existed still saves as it was.
  const rawRates = (input.rates && typeof input.rates === 'object' ? input.rates : {}) as Record<string, unknown>
  const rates: TransportRates = {}
  for (const st of states) {
    const r = (rawRates[st] && typeof rawRates[st] === 'object' ? rawRates[st] : {}) as Record<string, unknown>
    const name = TRANSPORT_STATE_LABELS[st]
    const mode = rateMode(r.mode)
    // Cargo bill: nothing to set now — the amount is the bill, after delivery.
    if (mode === 'cargo_bill') { rates[st] = { mode, amount: 0, free_above: null }; continue }
    const amount = toNumber(typeof r.amount === 'number' ? r.amount : r.amount ?? '')
    if (amount === null) continue
    if (mode === 'per_km') {
      if (Number.isNaN(amount) || amount <= 0 || amount > MAX_WHOLESALE_PRICE) {
        return fail(`Transport charge per km for ${name.en} must be more than 0.`, `${name.te}కు కిలోమీటరుకు రవాణా ఛార్జ్ 0 కంటే ఎక్కువ ఉండాలి.`)
      }
      rates[st] = { mode, amount: round2(amount), free_above: null }
      continue
    }
    if (Number.isNaN(amount) || amount < 0 || amount > MAX_WHOLESALE_PRICE) {
      return fail(`Transport charge for ${name.en} must be a number, 0 or more.`, `${name.te} రవాణా ఛార్జ్ 0 లేదా అంతకంటే ఎక్కువ సంఖ్య ఉండాలి.`)
    }
    const freeRaw = r.free_above ?? r.freeAbove ?? ''
    const free = toNumber(typeof freeRaw === 'number' ? freeRaw : String(freeRaw))
    if (free !== null && (Number.isNaN(free) || free <= 0 || free > MAX_WHOLESALE_QTY)) {
      return fail(`"Free above" for ${name.en} must be a quantity above 0, or left blank.`, `${name.te}కు "ఉచితం ఎప్పుడు" పరిమాణం 0 కంటే ఎక్కువ ఉండాలి, లేదా ఖాళీగా వదలండి.`)
    }
    rates[st] = { mode, amount: round2(amount), free_above: free === null ? null : roundQty(free) }
  }

  return {
    ok: true,
    columns: {
      sale_mode: mode,
      wholesale_price: round2(price),
      wholesale_min_qty: minQty,
      wholesale_pack_size: packSize,
      wholesale_pack_price: packPrice,
      wholesale_transport_states: states,
      wholesale_transport_rates: rates,
    },
  }
}

/** Same as resolveWholesale, from the dashboard/moderator form state. The
 *  form no longer asks about wholesale transport (2026-11-13), so a save
 *  clears any old wholesale-only transport and the lot follows Courier. */
export function resolveWholesaleForm(form: WholesaleForm, unit?: string | null): WholesaleResult {
  return resolveWholesale({ ...form, ...NO_WHOLESALE_TRANSPORT, unit })
}

/** What the form saves for transport now: none of its own — Courier decides. */
export const NO_WHOLESALE_TRANSPORT = { transport: false, states: [] as TransportState[], rates: {} as WholesaleForm['rates'] }

/**
 * Read a JSON request body (moderator API). Accepts the column names, so the
 * moderator form can send exactly what it stores, plus `wholesale_transport`
 * as the Yes/No. A body with no sale_mode at all is retail.
 */
export function resolveWholesaleBody(b: Record<string, unknown>, unit?: string | null): WholesaleResult {
  return resolveWholesale({
    saleMode: b.sale_mode,
    price: b.wholesale_price,
    minQty: b.wholesale_min_qty,
    packSize: b.wholesale_pack_size,
    packPrice: b.wholesale_pack_price,
    transport: b.wholesale_transport,
    states: b.wholesale_transport_states,
    rates: b.wholesale_transport_rates,
    unit,
  })
}

/**
 * Server check for a payload that already uses the column names (the farmer
 * dashboard's edit goes through /api/farmer/update-listing with columns, not
 * form strings). Transport is read from the state list: a non-empty list is
 * Yes, an empty one No.
 *   - no wholesale key at all → { ok: true, columns: null } (leave the row alone)
 *   - a stray wholesale field without sale_mode → refused, so a caller can't
 *     change the price of a live wholesale listing past the rules
 *   - otherwise → the same rules as the form, normalised columns back
 */
export function resolveWholesaleColumns(
  payload: Record<string, unknown>,
  unit?: string | null,
): { ok: true; columns: WholesaleColumns | null } | { ok: false; error: Msg } {
  const touched = WHOLESALE_COLUMNS.filter((c) => c in payload)
  if (touched.length === 0) return { ok: true, columns: null }
  if (!('sale_mode' in payload)) {
    return { ok: false, error: { en: 'Send sale_mode with the wholesale fields.', te: 'హోల్‌సేల్ వివరాలతో పాటు అమ్మకం విధానం కూడా పంపండి.' } }
  }
  const states = payload.wholesale_transport_states
  if (states !== undefined && states !== null && !Array.isArray(states)) {
    return { ok: false, error: { en: 'Transport regions must be a list.', te: 'రవాణా ప్రాంతాలు జాబితాగా ఉండాలి.' } }
  }
  return resolveWholesale({
    saleMode: payload.sale_mode,
    price: payload.wholesale_price,
    minQty: payload.wholesale_min_qty,
    packSize: payload.wholesale_pack_size,
    packPrice: payload.wholesale_pack_price,
    transport: Array.isArray(states) ? states.length > 0 : states == null ? false : null,
    states,
    rates: payload.wholesale_transport_rates,
    unit,
  })
}

/** A stored rates column (or junk) → clean rates. Lenient: bad entries drop out. */
export function normalizeRates(raw: unknown): TransportRates {
  const out: TransportRates = {}
  if (!raw || typeof raw !== 'object') return out
  for (const st of TRANSPORT_STATES) {
    const r = (raw as Record<string, unknown>)[st]
    if (!r || typeof r !== 'object') continue
    const x = r as Record<string, unknown>
    const mode = rateMode(x.mode)
    if (mode === 'cargo_bill') { out[st] = { mode, amount: 0, free_above: null }; continue }
    const amount = Number(x.amount)
    if (!Number.isFinite(amount) || amount < 0 || (mode === 'per_km' && amount <= 0)) continue
    const free = x.free_above == null || x.free_above === '' ? null : Number(x.free_above)
    out[st] = {
      mode,
      amount: round2(amount),
      free_above: mode !== 'per_km' && free !== null && Number.isFinite(free) && free > 0 ? roundQty(free) : null,
    }
  }
  return out
}

function packPriceFromUnit(price: unknown, pack: unknown): string {
  const p = Number(price)
  const k = Number(pack)
  return price != null && pack != null && price !== '' && pack !== '' && Number.isFinite(p) && Number.isFinite(k) && p > 0 && k > 0 ? String(round2(p * k)) : ''
}

const numStr = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v : '')

/**
 * A saved listing row → form state, for Edit. A row from before the migration
 * (no sale_mode key) reads as Retail with empty fields. Transport is answered
 * only when the row is already wholesale — a retail row was never asked.
 */
export function wholesaleFormFromRow(row: Record<string, unknown> | null | undefined): WholesaleForm {
  if (!row) return { ...EMPTY_WHOLESALE_FORM }
  const saleMode = parseSaleMode(row.sale_mode)
  const states = normalizeStates(row.wholesale_transport_states)
  const saved = normalizeRates(row.wholesale_transport_rates)
  const rates: WholesaleForm['rates'] = {}
  for (const st of states) {
    const r = saved[st]
    rates[st] = r
      ? { mode: r.mode, amount: r.mode === 'cargo_bill' ? '' : String(r.amount), freeAbove: r.free_above == null ? '' : String(r.free_above) }
      : { mode: 'per_order', amount: '', freeAbove: '' }
  }
  return {
    saleMode,
    price: numStr(row.wholesale_price),
    minQty: numStr(row.wholesale_min_qty),
    packSize: numStr(row.wholesale_pack_size),
    // A pack saved before pack prices existed: show what one pack cost (price × pack).
    packPrice: numStr(row.wholesale_pack_price) || packPriceFromUnit(row.wholesale_price, row.wholesale_pack_size),
    transport: states.length > 0 ? true : saleMode === 'retail' ? null : false,
    states,
    rates,
  }
}

/** Did the save fail only because the wholesale columns don't exist on this server yet? */
export function isWholesaleColumnMissing(msg: string | null | undefined): boolean {
  return WHOLESALE_COLUMNS.some((c) => isMissingColumnError(msg, c))
}

/** A copy of the payload with every wholesale column removed. */
export function withoutWholesale<T extends Record<string, unknown>>(payload: T): T {
  const copy: Record<string, unknown> = { ...payload }
  for (const c of WHOLESALE_COLUMNS) delete copy[c]
  return copy as T
}

/**
 * What to do when a save failed on a missing wholesale column
 * (scripts/wholesale-migration.sql not run on this server):
 *   retail     → 'retry' without the wholesale columns; nothing is lost,
 *                retail is what the row already is.
 *   wholesale  → 'refuse': saving would silently drop the farmer's choice.
 */
export function missingColumnAction(mode: SaleMode): 'retry' | 'refuse' {
  return mode === 'retail' ? 'retry' : 'refuse'
}

export const WHOLESALE_NOT_READY: Msg = {
  en: 'Wholesale is not switched on for this server yet. Choose Retail for now, or ask the moderator.',
  te: 'ఈ సర్వర్‌లో హోల్‌సేల్ ఇంకా ప్రారంభం కాలేదు. ప్రస్తుతానికి చిల్లర ఎంచుకోండి, లేదా మోడరేటర్‌ను అడగండి.',
}

/** A retail price is required unless the produce is sold wholesale only. */
export function needsRetailPrice(mode: SaleMode): boolean {
  return offersRetail(mode)
}

// ── Both (Retail + Wholesale): wholesale must be cheaper ────────────
//
// Decision 2026-11-05: when a produce is sold both ways, the wholesale price
// must be LOWER than every retail price the seller entered (tier 1, and tiers 2
// / 3 when filled) — otherwise saving is blocked. A household buying more at a
// tier price never pays less than an aggregator buying in bulk.

export const RETAIL_PRICE_KEYS = ['price_tier_1_price', 'price_tier_2_price', 'price_tier_3_price'] as const

/** Keys that can change the outcome of the rule — the server checks only when one is sent. */
export const BOTH_PRICE_RULE_KEYS = ['sale_mode', 'wholesale_price', ...RETAIL_PRICE_KEYS] as const

export function touchesBothPriceRule(payload: Record<string, unknown>): boolean {
  return BOTH_PRICE_RULE_KEYS.some((k) => k in payload)
}

const positive = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

/** The lowest retail price entered, or null when none is. */
export function lowestRetailPrice(row: Record<string, unknown>): number | null {
  const prices = RETAIL_PRICE_KEYS.map((k) => positive(row[k])).filter((n): n is number => n !== null)
  return prices.length ? Math.min(...prices) : null
}

/**
 * The block for a Both listing whose wholesale price is not below retail.
 * Works on column names (server rows / payloads) — the forms map their fields
 * onto them. Anything else (not Both, a price missing) is left to the other
 * checks and returns null.
 */
export function bothPricesError(row: Record<string, unknown>): Msg | null {
  if (parseSaleMode(row.sale_mode) !== 'both') return null
  const wholesale = positive(row.wholesale_price)
  const retail = lowestRetailPrice(row)
  if (wholesale === null || retail === null || wholesale < retail) return null
  const r = `₹${retail}`
  return {
    en: `Wholesale price must be lower than your retail price (${r}).`,
    te: `హోల్‌సేల్ ధర మీ చిల్లర ధర (${r}) కంటే తక్కువగా ఉండాలి.`,
  }
}

/**
 * Which wholesale columns a save should include. Retail on a server that has
 * no wholesale columns yet (`serverReady` false) sends nothing, so an
 * un-migrated environment keeps saving exactly as before; otherwise the
 * resolved columns go as they are.
 */
export function wholesaleColumnsToSend(columns: WholesaleColumns, serverReady: boolean): Partial<Record<(typeof WHOLESALE_COLUMNS)[number], unknown>> {
  if (columns.sale_mode === 'retail' && !serverReady) return {}
  return { ...columns }
}

/** The moderator form's request body for the wholesale part (read back by resolveWholesaleBody). */
export function wholesaleRequestBody(form: WholesaleForm, serverReady: boolean): Record<string, unknown> {
  if (form.saleMode === 'retail' && !serverReady) return {}
  return {
    sale_mode: form.saleMode,
    wholesale_price: form.price,
    wholesale_min_qty: form.minQty,
    wholesale_pack_size: form.packSize,
    wholesale_pack_price: form.packPrice,
    // No wholesale transport question since 2026-11-13 — Courier decides.
    wholesale_transport: NO_WHOLESALE_TRANSPORT.transport,
    wholesale_transport_states: NO_WHOLESALE_TRANSPORT.states,
    wholesale_transport_rates: NO_WHOLESALE_TRANSPORT.rates,
  }
}

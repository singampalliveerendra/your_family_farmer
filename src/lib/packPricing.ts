/**
 * Selling in packs (client card 2026-11-10, "How do you want to sell?").
 *
 * RETAIL — only for kg / gram. The farmer picks a pack size from a fixed list
 * (100 g … 5 kg), types the price of ONE pack, and may add "buy more, save
 * more" tiers counted in packs ("5+ packs → ₹22 a pack"). No pack size = sold
 * loose by the unit, exactly as before (price per kg, "sell in multiples of",
 * household tiers in kg). Columns (scripts/pack-pricing-migration.sql):
 *   retail_pack_size    the pack, in the listing's own unit (0.25 for 250 g on kg)
 *   retail_pack_price   ₹ for one pack, exactly as typed
 *   retail_pack_tiers   [{ min_packs, price }] — up to MAX_PACK_TIERS
 *
 * WHOLESALE — any unit. With a pack size the buyer orders whole packs, the
 * minimum is one pack, and the farmer types the price of one pack
 * (wholesale_pack_price). Without one: a minimum quantity and a price per unit,
 * as before. (Logic in src/lib/wholesale.ts; the pricing helper is here.)
 *
 * Money is charged as packs × price-per-pack, so ₹10 for 300 g never turns
 * into ₹9.99. The old per-unit columns are still filled in (derived), so the
 * Android app and screens not yet moved to packs show a sensible ₹/kg.
 */

import { isMissingColumnError } from '@/lib/missingColumn'
import { formatQty, roundQty } from '@/lib/saleStep'

export type Msg = { en: string; te: string }

/** Units a RETAIL pack size can be set on. */
// 'g' is the moderator form's spelling of gram.
export const PACK_UNITS = ['kg', 'gram', 'g'] as const
export const unitAllowsRetailPacks = (unit: string | null | undefined): boolean =>
  (PACK_UNITS as readonly string[]).includes((unit ?? '').trim().toLowerCase())

/** The fixed retail pack sizes, in grams. */
export const RETAIL_PACK_GRAMS = [100, 250, 500, 1000, 2000, 5000] as const

/** Same limits as the price columns (numeric(8,2)). */
export const MAX_PACK_PRICE = 999999.99
/** "Buy more, save more": at most this many tiers after the base pack price. */
export const MAX_PACK_TIERS = 2
export const MAX_TIER_PACKS = 9999

export type PackTier = { min_packs: number; price: number }
/** A tier as the form holds it (strings from the inputs). */
export type PackTierForm = { minPacks: string; price: string }

const grams = (g: number) => (g >= 1000 ? `${formatQty(g / 1000)} kg` : `${g} g`)

/** The pack sizes offered for this unit, as stored values (in the unit) + labels. */
export function retailPackChoices(unit: string | null | undefined): Array<{ value: number; label: string }> {
  const u = (unit ?? '').trim().toLowerCase()
  if (u === 'kg') return RETAIL_PACK_GRAMS.map((g) => ({ value: roundQty(g / 1000), label: grams(g) }))
  if (u === 'gram' || u === 'g') return RETAIL_PACK_GRAMS.map((g) => ({ value: g, label: grams(g) }))
  return []
}

/** "250 g", "1 kg", "25 kg", "12 piece" — a pack as a buyer reads it. */
export function packLabel(size: number, unit: string | null | undefined): string {
  const u = (unit ?? 'kg').trim().toLowerCase()
  if (u === 'kg') return grams(Math.round(size * 1000))
  if (u === 'gram' || u === 'g') return grams(Math.round(size))
  return `${formatQty(size)} ${unit || 'kg'}`
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) ? n : NaN
}
const round2 = (n: number) => Math.round(n * 100) / 100

/** Tolerant whole-number check for qty / pack (float noise from 0.1 + 0.2). */
export function wholePacks(qty: number, packSize: number): number | null {
  if (!(packSize > 0) || !(qty > 0)) return null
  const r = qty / packSize
  const n = Math.round(r)
  return n >= 1 && Math.abs(r - n) < 1e-6 ? n : null
}

/** Tiers from the column (jsonb) or a body: clean, ascending, at most MAX_PACK_TIERS. */
export function normalizeTiers(raw: unknown): PackTier[] {
  const list = Array.isArray(raw) ? raw : []
  const out: PackTier[] = []
  for (const t of list) {
    if (!t || typeof t !== 'object') continue
    const o = t as Record<string, unknown>
    const m = num(o.min_packs ?? o.minPacks)
    const p = num(o.price)
    if (m === null || p === null || Number.isNaN(m) || Number.isNaN(p) || !Number.isInteger(m) || m < 2 || p <= 0) continue
    out.push({ min_packs: m, price: round2(p) })
  }
  return out.sort((a, b) => a.min_packs - b.min_packs).slice(0, MAX_PACK_TIERS)
}

/** Price of one pack when buying `packs` of them: the best tier reached, else the base. */
export function pricePerPack(packs: number, basePrice: number, tiers: readonly PackTier[]): number {
  let price = basePrice
  for (const t of tiers) if (packs >= t.min_packs && t.price < price) price = t.price
  return price
}

export type PackListing = {
  unit?: string | null
  retail_pack_size?: number | string | null
  retail_pack_price?: number | string | null
  retail_pack_tiers?: unknown
}

/** The retail pack of a listing, or null when it is sold loose. */
export function retailPackOf(l: PackListing | null | undefined): { size: number; price: number; tiers: PackTier[] } | null {
  if (!l) return null
  const size = num(l.retail_pack_size)
  const price = num(l.retail_pack_price)
  if (size === null || price === null || Number.isNaN(size) || Number.isNaN(price) || size <= 0 || price <= 0) return null
  return { size, price, tiers: normalizeTiers(l.retail_pack_tiers) }
}

/**
 * One retail line priced in packs. `null` = the listing is not sold in packs
 * (use the old per-unit pricing). `{ ok: false }` = the quantity is not a whole
 * number of packs.
 */
export function packLinePrice(qty: number, l: PackListing):
  | null
  | { ok: true; packs: number; perPack: number; total: number }
  | { ok: false; error: string } {
  const pack = retailPackOf(l)
  if (!pack) return null
  const packs = wholePacks(roundQty(qty), pack.size)
  if (packs === null) return { ok: false, error: `sold in packs of ${packLabel(pack.size, l.unit)}` }
  const perPack = pricePerPack(packs, pack.price, pack.tiers)
  return { ok: true, packs, perPack, total: Math.round(packs * perPack) }
}

// ── The farmer's form ───────────────────────────────────────────────

export type RetailPackColumns = {
  retail_pack_size: number | null
  retail_pack_price: number | null
  retail_pack_tiers: PackTier[]
}

export const RETAIL_PACK_COLUMNS = ['retail_pack_size', 'retail_pack_price', 'retail_pack_tiers'] as const

const fail = (en: string, te: string) => ({ ok: false as const, error: { en, te } })

/**
 * Check the retail pack part of a form and turn it into columns. A blank pack
 * size = sold loose (all three cleared). Mirrors the migration's CHECKs.
 */
export function resolveRetailPack(input: {
  unit: string | null | undefined
  packSize: unknown
  packPrice: unknown
  tiers?: readonly PackTierForm[] | unknown
}): { ok: true; columns: RetailPackColumns } | { ok: false; error: Msg } {
  const size = num(input.packSize)
  if (size === null) return { ok: true, columns: { retail_pack_size: null, retail_pack_price: null, retail_pack_tiers: [] } }
  if (!unitAllowsRetailPacks(input.unit)) {
    return fail('A pack size can only be set for kg or gram.', 'ప్యాక్ పరిమాణం kg లేదా gram కు మాత్రమే.')
  }
  const choice = retailPackChoices(input.unit).find((c) => Number.isFinite(size) && Math.abs(c.value - size) < 1e-9)
  if (!choice) return fail('Choose a pack size from the list.', 'జాబితా నుండి ప్యాక్ పరిమాణం ఎంచుకోండి.')

  const price = num(input.packPrice)
  if (price === null) return fail('Enter the price of one pack.', 'ఒక ప్యాక్ ధర నమోదు చేయండి.')
  if (Number.isNaN(price) || price <= 0) return fail('Pack price must be a number above 0.', 'ప్యాక్ ధర 0 కంటే ఎక్కువ సంఖ్య ఉండాలి.')
  if (price > MAX_PACK_PRICE) return fail('Pack price is too high.', 'ప్యాక్ ధర చాలా ఎక్కువగా ఉంది.')

  const rows = (Array.isArray(input.tiers) ? input.tiers : []) as Array<Record<string, unknown>>
  const tiers: PackTier[] = []
  let lastPacks = 1
  let lastPrice = round2(price)
  for (const r of rows) {
    const m = num(r?.minPacks ?? r?.min_packs)
    const p = num(r?.price)
    if (m === null && p === null) continue // a blank row
    if (tiers.length >= MAX_PACK_TIERS) return fail(`At most ${MAX_PACK_TIERS} buy-more prices.`, `గరిష్టంగా ${MAX_PACK_TIERS} ఎక్కువ-కొనుగోలు ధరలు.`)
    if (m === null || Number.isNaN(m) || !Number.isInteger(m) || m < 2 || m > MAX_TIER_PACKS) {
      return fail('Buy more: enter a whole number of packs, 2 or more.', 'ఎక్కువ కొంటే: 2 లేదా అంతకంటే ఎక్కువ పూర్తి ప్యాక్‌ల సంఖ్య నమోదు చేయండి.')
    }
    if (m <= lastPacks) return fail('Buy more: each row needs more packs than the one before.', 'ఎక్కువ కొంటే: ప్రతి వరుసకు ముందు దాని కంటే ఎక్కువ ప్యాక్‌లు ఉండాలి.')
    if (p === null || Number.isNaN(p) || p <= 0) return fail(`Buy more: enter the price per pack for ${m}+ packs.`, `ఎక్కువ కొంటే: ${m}+ ప్యాక్‌లకు ఒక్కో ప్యాక్ ధర నమోదు చేయండి.`)
    if (round2(p) >= lastPrice) return fail('Buy more: the price per pack must go down as they buy more.', 'ఎక్కువ కొంటే: ఎక్కువ కొన్నప్పుడు ఒక్కో ప్యాక్ ధర తగ్గాలి.')
    tiers.push({ min_packs: m, price: round2(p) })
    lastPacks = m
    lastPrice = round2(p)
  }
  return { ok: true, columns: { retail_pack_size: choice.value, retail_pack_price: round2(price), retail_pack_tiers: tiers } }
}

/**
 * The old per-unit columns, derived from a pack, so readers that do not know
 * packs yet (the Android app, older screens) still show a fair ₹/unit, and
 * the sale step makes "+" add one pack. Tier semantics of the old columns:
 * up to tier1 qty → p1; up to tier2 qty → p2; above → p3.
 */
export function legacyColumnsForPack(c: RetailPackColumns): Record<string, number | null> {
  if (c.retail_pack_size === null || c.retail_pack_price === null) return {}
  const s = c.retail_pack_size
  const perUnit = (p: number) => round2(p / s)
  const [a, b] = c.retail_pack_tiers
  return {
    sale_step: s,
    price_tier_1_price: perUnit(c.retail_pack_price),
    price_tier_1_qty: a ? roundQty((a.min_packs - 1) * s) : null,
    price_tier_2_price: a && b ? perUnit(a.price) : null,
    price_tier_2_qty: a && b ? roundQty((b.min_packs - 1) * s) : null,
    price_tier_3_price: b ? perUnit(b.price) : a ? perUnit(a.price) : null,
    price_tier_3_qty: b ? roundQty(b.min_packs * s) : a ? roundQty(a.min_packs * s) : null,
  }
}

/** The form's strings for a saved listing. */
export function retailPackFormFromRow(row: Record<string, unknown> | null | undefined): { packSize: string; packPrice: string; tiers: PackTierForm[] } {
  const pack = retailPackOf(row as PackListing)
  if (!pack) return { packSize: '', packPrice: '', tiers: [] }
  return {
    packSize: String(pack.size),
    packPrice: String(pack.price),
    tiers: pack.tiers.map((t) => ({ minPacks: String(t.min_packs), price: String(t.price) })),
  }
}

/** Shown when a pack is saved on a server without scripts/pack-pricing-migration.sql. */
export const PACKS_NOT_READY: Msg = {
  en: 'Selling in packs is not switched on yet. Choose "Loose" for now, or try again later.',
  te: 'ప్యాక్‌లలో అమ్మకం ఇంకా ప్రారంభం కాలేదు. ప్రస్తుతానికి "విడిగా" ఎంచుకోండి, లేదా తర్వాత ప్రయత్నించండి.',
}

/**
 * Server check for a seller's payload (column names). No retail-pack key → the
 * payload is left alone. Otherwise the pack is validated with the form's rules
 * and, when set, the derived per-unit columns overwrite whatever was sent, so a
 * crafted request can't sell a pack at a different ₹/kg. Mutates `payload`.
 */
export function applyRetailPackColumns(payload: Record<string, unknown>, unit: string | null | undefined): Msg | null {
  if (!RETAIL_PACK_COLUMNS.some((c) => c in payload)) return null
  const r = resolveRetailPack({
    unit,
    packSize: payload.retail_pack_size,
    packPrice: payload.retail_pack_price,
    tiers: payload.retail_pack_tiers,
  })
  if (!r.ok) return r.error
  Object.assign(payload, r.columns, legacyColumnsForPack(r.columns))
  return null
}

/** Did a save fail only because the retail pack columns don't exist yet? */
export function isPackColumnMissing(msg: string | null | undefined): boolean {
  return RETAIL_PACK_COLUMNS.some((c) => isMissingColumnError(msg, c))
}

// ── Buyer side (part 2, 2026-11-10) ─────────────────────────────────

/** What a cart line carries for a pack produce (absent = sold loose). */
export type CartPackFields = {
  retailPackSize?: number
  retailPackPrice?: number
  retailPackTiers?: PackTier[]
}

/** The pack fields to put on a cart line, plus the step (= one pack). */
export function cartPackFields(l: PackListing | null | undefined): CartPackFields & { saleStep?: number } {
  const pack = retailPackOf(l)
  if (!pack) return {}
  return { retailPackSize: pack.size, retailPackPrice: pack.price, retailPackTiers: pack.tiers, saleStep: pack.size }
}

/**
 * A pack cart line's price per UNIT for `qty`, so the cart's existing
 * "price per unit × qty" totals come out as packs × the price of one pack
 * (with the buy-more tier reached). null = not a pack line.
 */
export function packPerUnit(qty: number, item: CartPackFields): { perUnit: number; perPack: number; packs: number; isDiscount: boolean } | null {
  const size = item.retailPackSize
  const base = item.retailPackPrice
  if (!size || !base || size <= 0 || base <= 0) return null
  const packs = Math.max(1, Math.round(roundQty(qty) / size))
  const perPack = pricePerPack(packs, base, item.retailPackTiers ?? [])
  return { perUnit: perPack / size, perPack, packs, isDiscount: perPack < base }
}

/** The headline price on a card / page: "₹25 / 250 g" for a pack, else null. */
export function packPriceTag(l: PackListing | null | undefined): { price: number; pack: string } | null {
  const pack = retailPackOf(l)
  return pack ? { price: pack.price, pack: packLabel(pack.size, l?.unit) } : null
}

/** "3 packs (750 g)" / "1 pack (250 g)" for a quantity in the listing unit. */
export function packsText(qty: number, size: number, unit: string | null | undefined, L: (en: string, te: string) => string): string {
  const packs = Math.max(1, Math.round(roundQty(qty) / size))
  const total = packLabel(roundQty(packs * size), unit)
  return packs === 1 ? L(`1 pack (${total})`, `1 ప్యాక్ (${total})`) : L(`${packs} packs (${total})`, `${packs} ప్యాక్‌లు (${total})`)
}

/** The buy-more lines for a page: "5+ packs → ₹22 a pack". */
export function packTierLines(l: PackListing | null | undefined, L: (en: string, te: string) => string): Array<{ label: string; price: number }> {
  const pack = retailPackOf(l)
  if (!pack) return []
  const name = packLabel(pack.size, l?.unit)
  const first = pack.tiers[0]?.min_packs
  return [
    { label: first ? L(`1–${first - 1} packs of ${name}`, `${name} 1–${first - 1} ప్యాక్‌లు`) : L(`One ${name} pack`, `ఒక ${name} ప్యాక్`), price: pack.price },
    ...pack.tiers.map((t) => ({ label: L(`${t.min_packs}+ packs`, `${t.min_packs}+ ప్యాక్‌లు`), price: t.price })),
  ]
}

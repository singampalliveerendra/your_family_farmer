/**
 * Keeping retail and wholesale apart, and wholesale low-stock.
 *
 * 1. Retail visibility. A produce sold Wholesale ONLY must never reach a
 *    household buyer: home feed, search, farmer and region pages, product and
 *    harvest pages, share images, the Android app (which reads /api/produce and
 *    /api/produce/search). 'both' stays visible — its retail side is for them.
 *    A row with no sale_mode (a server where scripts/wholesale-migration.sql
 *    has not run) is retail, so every check here is safe before the migration.
 *
 * 2. Wholesale stock. Retail and wholesale share the harvest stock. A wholesale
 *    order is filled from ONE harvest (orders carry one harvest_id), so the
 *    wholesale stock of a produce is its best single harvest — the same
 *    "harvests are the authority" rule as isSoldOutWithHarvests in
 *    src/lib/produceStatus.ts. When it falls below the wholesale minimum the
 *    wholesale side is hidden automatically (computed, so it also comes back by
 *    itself when stock is added) and the farmer is alerted with three choices:
 *    lower the minimum, move it to retail, or add more stock.
 */

import { isMissingColumnError } from '@/lib/missingColumn'
import { roundQty, unitAllowsFractions } from '@/lib/saleStep'
import { offersWholesale, parseSaleMode, withoutWholesale } from '@/lib/wholesale'

// ---------------------------------------------------------------------------
// Retail visibility

/** Can a household (retail) buyer see this produce? */
export function isRetailVisible(row: { sale_mode?: unknown } | null | undefined): boolean {
  if (!row) return false
  return parseSaleMode(row.sale_mode) !== 'wholesale'
}

/** Drop wholesale-only produce from a list a household buyer will see. */
export function retailOnly<T extends { sale_mode?: unknown }>(rows: readonly T[] | null | undefined): T[] {
  return (rows ?? []).filter(isRetailVisible)
}

/**
 * retailOnly, and each remaining row stripped of its wholesale columns, for a
 * response that goes to household buyers (the web feed and the Android app):
 * a "both" produce is shown at its retail price, and its wholesale price and
 * minimum are not theirs to see.
 */
export function retailRows<T extends Record<string, unknown>>(rows: readonly T[] | null | undefined): T[] {
  return retailOnly(rows as ReadonlyArray<T & { sale_mode?: unknown }>).map((r) => withoutWholesale(r))
}

type QueryResult<T> = { data: T | null; error: { message: string } | null }

/**
 * Run a query that names sale_mode in an explicit column list, falling back to
 * the same query without it on a server where the column does not exist yet.
 * There can be no wholesale produce on such a server, so the fallback rows are
 * all retail — correct, not just tolerated.
 *
 *   readWithSaleMode((withMode) =>
 *     supabase.from('produce_listings').select(withMode ? 'id, name, sale_mode' : 'id, name'))
 */
export async function readWithSaleMode<T>(
  run: (withSaleMode: boolean) => PromiseLike<QueryResult<T>>,
): Promise<QueryResult<T>> {
  const first = await run(true)
  if (first.error && isMissingColumnError(first.error.message, 'sale_mode')) return run(false)
  return first
}

// ---------------------------------------------------------------------------
// Wholesale stock

export type StockListing = {
  sale_mode?: unknown
  wholesale_min_qty?: number | string | null
  wholesale_pack_size?: number | string | null
  stock_qty?: number | string | null
  unit?: string | null
}
export type StockHarvest = { id?: string; stock_qty?: number | string | null }

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * The most a single wholesale order could take right now. Null = not tracked
 * (a harvest or produce with no stock number), which never counts as low —
 * the same reading isSoldOutWithHarvests gives a null stock.
 * `harvests` must be the produce's UNPAUSED harvests.
 */
export function wholesaleStock(listing: StockListing, harvests: readonly StockHarvest[]): number | null {
  if (harvests.length === 0) return num(listing.stock_qty)
  let best = 0
  for (const h of harvests) {
    const s = num(h.stock_qty)
    if (s === null) return null
    if (s > best) best = s
  }
  return roundQty(best)
}

/**
 * Is the wholesale side short of stock? True only for a produce sold wholesale
 * whose tracked stock is below its minimum. This is what hides it.
 */
export function isWholesaleLowStock(listing: StockListing, harvests: readonly StockHarvest[]): boolean {
  if (!offersWholesale(parseSaleMode(listing.sale_mode))) return false
  const min = num(listing.wholesale_min_qty)
  if (min === null || min <= 0) return false
  const stock = wholesaleStock(listing, harvests)
  return stock !== null && stock < min
}

/** Can a wholesale buyer see this produce? (For the wholesale side.) */
export function isWholesaleVisible(listing: StockListing, harvests: readonly StockHarvest[]): boolean {
  return offersWholesale(parseSaleMode(listing.sale_mode)) && !isWholesaleLowStock(listing, harvests)
}

/**
 * The minimum the farmer could lower to and stay listed: the stock there is,
 * rounded DOWN to whole packs (or whole units where fractions can't be sold).
 * Null when not even one pack is left — then "lower the minimum" can't help.
 */
export function suggestedMinimum(listing: StockListing, harvests: readonly StockHarvest[]): number | null {
  const stock = wholesaleStock(listing, harvests)
  if (stock === null || stock <= 0) return null
  const pack = num(listing.wholesale_pack_size)
  let m: number
  if (pack !== null && pack > 0) m = roundQty(Math.floor(roundQty(stock / pack) + 1e-9) * pack)
  else m = unitAllowsFractions(listing.unit) ? stock : Math.floor(stock)
  return m > 0 ? m : null
}

/** How much is missing to reach the minimum again (0 when not low). */
export function stockShortfall(listing: StockListing, harvests: readonly StockHarvest[]): number {
  if (!isWholesaleLowStock(listing, harvests)) return 0
  const min = num(listing.wholesale_min_qty) as number
  const stock = wholesaleStock(listing, harvests) as number
  return roundQty(min - stock)
}

/**
 * Did these stock claims (an order just placed) push the wholesale side below
 * its minimum? `harvestsAfter` is the produce's unpaused harvests as they are
 * now; the claims are added back to get "before". Only a real crossing counts,
 * so an alert goes once, when it happens — not on every later order.
 */
export function crossedBelowMinimum(
  listing: StockListing,
  harvestsAfter: readonly StockHarvest[],
  claims: ReadonlyArray<{ harvestId?: string | null; qty: number }>,
  listingStockAfter?: number | string | null,
): boolean {
  if (!isWholesaleLowStock({ ...listing, stock_qty: listingStockAfter ?? listing.stock_qty }, harvestsAfter)) return false
  const back = new Map<string, number>()
  let backToListing = 0
  for (const c of claims) {
    if (c.harvestId) back.set(c.harvestId, (back.get(c.harvestId) ?? 0) + c.qty)
    else backToListing += c.qty
  }
  const before = harvestsAfter.map((h) => {
    const s = num(h.stock_qty)
    return h.id && back.has(h.id) && s !== null ? { ...h, stock_qty: roundQty(s + (back.get(h.id) as number)) } : h
  })
  const afterListing = num(listingStockAfter ?? listing.stock_qty)
  const beforeListing = afterListing === null ? null : roundQty(afterListing + backToListing)
  return !isWholesaleLowStock({ ...listing, stock_qty: beforeListing }, before)
}

// ---------------------------------------------------------------------------
// The farmer's alert

export type LowStockChoice = 'lower_minimum' | 'move_to_retail' | 'add_stock'

export const LOW_STOCK_CHOICES: Record<LowStockChoice, { en: string; te: string }> = {
  lower_minimum: { en: 'Lower the minimum', te: 'కనీస పరిమాణం తగ్గించండి' },
  move_to_retail: { en: 'Move to retail', te: 'చిల్లరకు మార్చండి' },
  add_stock: { en: 'Add more stock', te: 'మరింత స్టాక్ జోడించండి' },
}

/**
 * The columns each choice writes (through /api/farmer/update-listing, which
 * re-checks them with the wholesale rules). add_stock writes nothing here — it
 * opens the produce so the farmer can log a harvest or raise its stock.
 *
 * move_to_retail on a Wholesale-only produce needs a retail price, because a
 * retail buyer will now see it; `retailPrice` must then be given.
 */
export function lowStockChoicePayload(
  choice: LowStockChoice,
  listing: StockListing & {
    wholesale_price?: number | string | null
    wholesale_transport_states?: unknown
    price_tier_1_price?: number | string | null
  },
  harvests: readonly StockHarvest[],
  retailPrice?: number | string | null,
): { ok: true; payload: Record<string, unknown> | null } | { ok: false; error: { en: string; te: string } } {
  const mode = parseSaleMode(listing.sale_mode)
  if (choice === 'add_stock') return { ok: true, payload: null }

  if (choice === 'lower_minimum') {
    const min = suggestedMinimum(listing, harvests)
    if (min === null) {
      return { ok: false, error: { en: 'Not even one pack is left — add stock or move it to retail.', te: 'ఒక్క ప్యాక్ కూడా మిగల్లేదు — స్టాక్ జోడించండి లేదా చిల్లరకు మార్చండి.' } }
    }
    return {
      ok: true,
      payload: {
        sale_mode: mode,
        wholesale_price: num(listing.wholesale_price),
        wholesale_min_qty: min,
        wholesale_pack_size: num(listing.wholesale_pack_size),
        wholesale_transport_states: Array.isArray(listing.wholesale_transport_states) ? listing.wholesale_transport_states : [],
      },
    }
  }

  // move_to_retail
  if (mode === 'both') return { ok: true, payload: { sale_mode: 'retail' } }
  const existing = num(listing.price_tier_1_price)
  const price = num(retailPrice) ?? existing
  if (price === null || price <= 0) {
    return { ok: false, error: { en: 'Enter a retail price first.', te: 'ముందు చిల్లర ధర నమోదు చేయండి.' } }
  }
  return {
    ok: true,
    payload: existing !== null && num(retailPrice) === null
      ? { sale_mode: 'retail' }
      : { sale_mode: 'retail', price_tier_1_price: Math.round(price * 100) / 100, price_tier_1_qty: 1 },
  }
}

/** WhatsApp body for the farmer: produce, what is left, the minimum. */
export function lowStockAlertParams(
  name: string,
  unit: string | null | undefined,
  stock: number,
  min: number,
): string[] {
  const u = unit || 'kg'
  return [name.slice(0, 60), `${roundQty(stock)} ${u}`, `${roundQty(min)} ${u}`]
}

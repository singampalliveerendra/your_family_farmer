/**
 * Sale step — the smallest quantity a produce can be bought in.
 *
 * Buyers don't want a kilo of everything. Mirchi goes 250 g at a time; rice
 * goes by the kilo. The step is a property of the PRODUCE (mirchi is 250 g
 * wherever it is sold), so it lives on `produce_listings.sale_step` and every
 * harvest under that listing inherits it.
 *
 * A null/absent step means 1, which is exactly how every listing behaved
 * before this existed — so untouched rows keep working with no backfill.
 */

export const DEFAULT_STEP = 1

// Units where a fraction is meaningless — you cannot sell a third of an egg.
// Anything not listed here (kg, gram, litre) is treated as divisible.
const WHOLE_ONLY_UNITS = new Set(['piece', 'pieces', 'bunch', 'bunches', 'dozen', 'nos', 'no', 'egg', 'eggs'])

export function unitAllowsFractions(unit: string | null | undefined): boolean {
  return !WHOLE_ONLY_UNITS.has((unit ?? 'kg').trim().toLowerCase())
}

/**
 * Quantities are money-adjacent, so they must not drift. 0.1 + 0.2 is
 * 0.30000000000000004 in binary floating point, and three taps of a 0.25 step
 * would otherwise accumulate a tail that fails an `=== stock` comparison and
 * renders as "0.7500000000000001 kg". Three decimals is well inside the
 * numeric(10,3) the column stores and covers every step worth offering.
 */
export function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** The effective step for a listing: sanitised, and never fractional on a unit that can't be split. */
export function normalizeStep(step: number | null | undefined, unit?: string | null): number {
  const n = Number(step)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_STEP
  if (!unitAllowsFractions(unit)) return Math.max(1, Math.round(n))
  return roundQty(n)
}

/**
 * Snap an arbitrary quantity onto the step grid. Used when a buyer TYPES a
 * quantity — "0.4" on a 250 g step becomes 0.5, not a half-step order the
 * farmer can't weigh out. Never returns less than one step.
 */
export function snapToStep(qty: number, step: number, max?: number | null): number {
  const s = step > 0 ? step : DEFAULT_STEP
  if (!Number.isFinite(qty) || qty <= 0) return s
  let snapped = roundQty(Math.round(qty / s) * s)
  if (snapped < s) snapped = s
  if (max != null && snapped > max) {
    // Step DOWN to the last whole step that fits — never hand back more than stock.
    snapped = roundQty(Math.floor(max / s) * s)
    if (snapped < s) snapped = roundQty(max)
  }
  return snapped
}

/** One tap of "+". Capped at stock, and only ever lands on the grid. */
export function stepUp(qty: number, step: number, max?: number | null): number {
  const s = step > 0 ? step : DEFAULT_STEP
  const next = roundQty(qty + s)
  if (max != null && next > max) return roundQty(Math.min(qty, max))
  return next
}

/**
 * One tap of "−". Returns 0 when the line would drop below a single step,
 * which the cart already reads as "remove this line" — so the last tap clears
 * the item instead of parking it at an unsellable 0.1 kg.
 */
export function stepDown(qty: number, step: number): number {
  const s = step > 0 ? step : DEFAULT_STEP
  const next = roundQty(qty - s)
  return next < s ? 0 : next
}

/**
 * Quantity as a buyer should read it: "0.25", "1", "1.5" — never "1.500" or
 * the floating-point tail. Trailing zeros are dropped because "1.000 kg" reads
 * like a machine wrote it.
 */
export function formatQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return ''
  const v = roundQty(Number(n))
  return Number.isInteger(v) ? String(v) : String(v).replace(/0+$/, '').replace(/\.$/, '')
}

/**
 * The steps a farmer can choose from. Deliberately a fixed list rather than a
 * free number field: an arbitrary 0.37 kg step is a mis-tap, not a business
 * need, and every value here is something a farmer can actually weigh.
 */
export const STEP_CHOICES = [
  { value: 1,     en: '1 (whole)',   te: '1 (పూర్తి)' },
  { value: 0.5,   en: '1/2',         te: '1/2' },
  { value: 0.25,  en: '1/4',         te: '1/4' },
  { value: 0.1,   en: '1/10',        te: '1/10' },
]

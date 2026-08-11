// Harvest model helpers — the "Harvested 2 hours ago" clock and freshness math.
// A produce_listing is the template; a `harvests` row is one actual pick with a
// harvested_at timestamp + shelf_life_days. See scripts/harvests-migration.sql.

export type Harvest = {
  id: string
  produce_listing_id: string
  farmer_id?: string | null
  harvested_at: string
  shelf_life_days?: number | null
  approx_quantity?: number | null
  unit?: string | null
  notes?: string | null
  // Farmer has hidden this pick from buyers without deleting it. Optional so
  // code still typechecks against rows fetched before the column existed.
  paused?: boolean | null
}

type Tr = (en: string, te: string) => string
const en: Tr = (e) => e

// Local midnight (start of the calendar day) for a given time, so day-level
// differences are counted by the calendar — "yesterday" means the previous
// calendar day — not by elapsed 24-hour chunks. Without this, a pick from the
// 5th at 4pm viewed on the 7th at 10am (42h) would round to 1 → "yesterday",
// when a person reading the dates expects "2 days ago".
function startOfLocalDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// "just now" / "12 min ago" / "2 hours ago" / "yesterday" / "3 days ago".
// For a future harvest (farmer logged an upcoming pick) → "in 2 hours" etc.
// Exported bare (without the "Harvested" prefix harvestClock adds) for the
// compact harvest tables, where the column header already says When/Expected
// and the width is needed for the harvest name.
export function harvestRelTime(iso: string, L: Tr = en): string {
  const then = new Date(iso).getTime()
  if (isNaN(then)) return ''
  const now = Date.now()
  const diffMs = now - then
  const future = diffMs < 0
  const mins = Math.floor(Math.abs(diffMs) / 60000)

  if (mins < 1) return L('just now', 'ఇప్పుడే')
  const fmt = (n: number, unitEn: string, unitTe: string) =>
    future
      ? `${L('in', 'లో')} ${n} ${L(unitEn, unitTe)}`
      : `${n} ${L(unitEn, unitTe)} ${L('ago', 'క్రితం')}`

  if (mins < 60) return fmt(mins, mins === 1 ? 'min' : 'mins', 'నిమి')

  // Day buckets are counted by calendar days, not 24-hour spans. Within the
  // same calendar day we still show hours ("5 hours ago"); once the date rolls
  // over it's "yesterday", "2 days ago", etc.
  const dayDiff = Math.round((startOfLocalDay(now) - startOfLocalDay(then)) / 86_400_000)
  if (dayDiff === 0) {
    const hrs = Math.floor(mins / 60)
    return fmt(hrs, hrs === 1 ? 'hour' : 'hours', 'గం')
  }
  if (dayDiff === 1) return L('yesterday', 'నిన్న')
  if (dayDiff === -1) return L('tomorrow', 'రేపు')
  return fmt(Math.abs(dayDiff), 'days', 'రోజులు')
}

// The headline clock shown on a harvest, e.g. "🌾 Harvested 2 hours ago".
export function harvestClock(harvestedAt: string, L: Tr = en): string {
  const rel = harvestRelTime(harvestedAt, L)
  if (!rel) return ''
  const future = new Date(harvestedAt).getTime() > Date.now()
  return future
    ? `${L('Harvest expected', 'కోత అంచనా')} ${rel}`
    : `${L('Harvested', 'కోసింది')} ${rel}`
}

// Calendar days a harvest has been off the plant. Day 0 = picked today, 1 =
// yesterday, etc. Counted by calendar date (not elapsed 24-hour chunks) so it
// stays consistent with the "Harvested N days ago" clock above.
export function harvestAgeDays(harvestedAt: string): number {
  const then = new Date(harvestedAt).getTime()
  if (isNaN(then) || then > Date.now()) return 0
  return Math.max(0, Math.round((startOfLocalDay(Date.now()) - startOfLocalDay(then)) / 86_400_000))
}

// Freshness from shelf life: days left before it spoils, and whether it's past.
// Returns null when no shelf life is set (can't compute).
export function freshnessLeftDays(harvestedAt: string, shelfLifeDays?: number | null): number | null {
  if (shelfLifeDays == null || shelfLifeDays <= 0) return null
  const left = shelfLifeDays - harvestAgeDays(harvestedAt)
  return left
}

// Short freshness label, e.g. "3 days fresh left" / "Use today" / "Past best".
export function freshnessLabel(harvestedAt: string, shelfLifeDays?: number | null, L: Tr = en): string | null {
  const left = freshnessLeftDays(harvestedAt, shelfLifeDays)
  if (left == null) return null
  if (left < 0) return L('Past best', 'గడువు ముగిసింది')
  if (left === 0) return L('Use today', 'ఈరోజే వాడండి')
  if (left === 1) return L('1 day fresh left', '1 రోజు తాజా')
  return `${left} ${L('days fresh left', 'రోజులు తాజా')}`
}

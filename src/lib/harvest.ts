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
}

type Tr = (en: string, te: string) => string
const en: Tr = (e) => e

// "just now" / "12 min ago" / "2 hours ago" / "yesterday" / "3 days ago".
// For a future harvest (farmer logged an upcoming pick) → "in 2 hours" etc.
function relTime(iso: string, L: Tr): string {
  const then = new Date(iso).getTime()
  if (isNaN(then)) return ''
  const diffMs = Date.now() - then
  const future = diffMs < 0
  const mins = Math.floor(Math.abs(diffMs) / 60000)

  if (mins < 1) return L('just now', 'ఇప్పుడే')
  const fmt = (n: number, unitEn: string, unitTe: string) =>
    future
      ? `${L('in', 'లో')} ${n} ${L(unitEn, unitTe)}`
      : `${n} ${L(unitEn, unitTe)} ${L('ago', 'క్రితం')}`

  if (mins < 60) return fmt(mins, mins === 1 ? 'min' : 'mins', 'నిమి')
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return fmt(hrs, hrs === 1 ? 'hour' : 'hours', 'గం')
  const days = Math.floor(hrs / 24)
  if (days === 1) return future ? L('tomorrow', 'రేపు') : L('yesterday', 'నిన్న')
  return fmt(days, 'days', 'రోజులు')
}

// The headline clock shown on a harvest, e.g. "🌾 Harvested 2 hours ago".
export function harvestClock(harvestedAt: string, L: Tr = en): string {
  const rel = relTime(harvestedAt, L)
  if (!rel) return ''
  const future = new Date(harvestedAt).getTime() > Date.now()
  return future
    ? `${L('Harvest expected', 'కోత అంచనా')} ${rel}`
    : `${L('Harvested', 'కోసింది')} ${rel}`
}

// Whole days (rounded up) a harvest has been off the plant. Day 0 = picked today.
export function harvestAgeDays(harvestedAt: string): number {
  const diffMs = Date.now() - new Date(harvestedAt).getTime()
  if (isNaN(diffMs) || diffMs < 0) return 0
  return Math.floor(diffMs / 86_400_000)
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

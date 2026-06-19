// A farmer's pickup schedule is keyed BY pickup location: each location has its
// own list of windows, each window its own set of weekdays plus a from/to time —
// e.g. "Bus stand" → Mon/Wed/Fri 08:00–12:00 AND Sat/Sun 16:00–18:00, while
// "Market road" → Sun 17:00–19:00. Stored in the farmers.pickup_slots JSON column
// as { [locationName]: PickupSlot[] }.

export type PickupSlot = {
  days: string[]
  time_from: string
  time_to: string
}

// Per-location pickup schedule: location name → its time windows.
export type PickupSchedule = Record<string, PickupSlot[]>

export const PICKUP_DEFAULT_FROM = '08:00'
export const PICKUP_DEFAULT_TO = '12:00'

// Normalize the raw pickup_slots value into a clean array of slots. Accepts
// either the new array shape, the LEGACY single-object shape
// ({ days, time_from, time_to }) saved before multi-slot support, or null —
// always returns an array. Slots with no chosen days are dropped, so callers
// can persist `result.length ? result : null`.
export function normalizePickupSlots(raw: unknown): PickupSlot[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  const out: PickupSlot[] = []
  for (const s of list) {
    if (!s || typeof s !== 'object') continue
    const o = s as { days?: unknown; time_from?: unknown; time_to?: unknown }
    const days = Array.isArray(o.days)
      ? Array.from(new Set(o.days.map((d) => String(d)).filter(Boolean)))
      : []
    if (days.length === 0) continue
    out.push({
      days,
      time_from: typeof o.time_from === 'string' && o.time_from ? o.time_from : PICKUP_DEFAULT_FROM,
      time_to: typeof o.time_to === 'string' && o.time_to ? o.time_to : PICKUP_DEFAULT_TO,
    })
  }
  return out
}

// A fresh, empty slot for the "+ Add" action.
export function emptyPickupSlot(): PickupSlot {
  return { days: [], time_from: PICKUP_DEFAULT_FROM, time_to: PICKUP_DEFAULT_TO }
}

// "08:00" → "8:00 AM". Leaves anything it can't parse untouched.
function formatTime(t: string): string {
  const [hStr, mStr] = (t ?? '').split(':')
  let h = parseInt(hStr, 10)
  if (Number.isNaN(h)) return t
  const m = mStr ?? '00'
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${m} ${ampm}`
}

// Human-readable lines for a location's windows, e.g.
// ["Mon, Wed, Fri · 8:00 AM–12:00 PM", "Sat, Sun · 4:00 PM–6:00 PM"].
// Windows with no chosen days are skipped.
export function formatPickupSlots(slots: PickupSlot[] | undefined): string[] {
  if (!Array.isArray(slots)) return []
  return slots
    .filter((s) => s.days.length > 0)
    .map((s) => `${s.days.map((d) => d.slice(0, 3)).join(', ')} · ${formatTime(s.time_from)}–${formatTime(s.time_to)}`)
}

// Build a clean per-location schedule from a raw stored value, scoped to the
// locations that currently exist. Accepts:
//   • the new map shape { [location]: PickupSlot[] }
//   • the LEGACY flat-array shape (a single global schedule) — attached to the
//     first location, since old data had no per-location association
//   • null/anything else → empty schedule
// `locations` scopes the result: when provided, only those locations are kept
// (so a schedule for a removed location is dropped). When omitted, the map's own
// keys are used. Locations with no usable windows are omitted entirely.
export function normalizePickupSchedule(raw: unknown, locations?: string[]): PickupSchedule {
  const out: PickupSchedule = {}

  if (Array.isArray(raw)) {
    // Legacy global schedule — attach to the first known location, if any.
    const slots = normalizePickupSlots(raw)
    const first = locations?.[0]
    if (slots.length > 0 && first) out[first] = slots
    return out
  }

  if (raw && typeof raw === 'object') {
    const map = raw as Record<string, unknown>
    const keys = locations ?? Object.keys(map)
    for (const loc of keys) {
      const slots = normalizePickupSlots(map[loc])
      if (slots.length > 0) out[loc] = slots
    }
  }

  return out
}

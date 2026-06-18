// A farmer's pickup schedule is a list of windows, each its own set of weekdays
// plus a from/to time — e.g. Mon/Wed/Fri 08:00–12:00 AND Sat/Sun 16:00–18:00.
// Stored in the farmers.pickup_slots JSON column.

export type PickupSlot = {
  days: string[]
  time_from: string
  time_to: string
}

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

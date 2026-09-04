import { todayInIndia } from './date'

/* When the next harvest is due — the farmer's answer, turned into a date.
 *
 * The farmer's produce form carries an availability window (from → to) and a
 * harvesting cadence: daily, weekly or monthly, optionally several times per
 * period ("weekly × 2" = picked twice a week). Those four columns have existed
 * since the 2026-06-26 availability migration; what was missing was anything
 * that READ them.
 *
 * Two things read them now. The buyer who is told "this harvest is finished,
 * the next one is expected around <date>" before they agree to wait, and the
 * pre-order that stores that same date so the farmer sees the promise that was
 * made — even if they later change the cadence.
 *
 * Everything here is date-only arithmetic in YYYY-MM-DD, matching the `date`
 * columns and `todayInIndia()`. No Date objects cross the boundary: a
 * timestamp would drag UTC back in and roll the answer over at 5:30am IST.
 */

export const HARVEST_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const
export type HarvestFrequency = (typeof HARVEST_FREQUENCIES)[number]

/** Days in one cycle of each cadence. A month is 30 days: the estimate is shown
 *  as "around <date>", and calendar-exact month arithmetic would imply a
 *  precision a harvest does not have. */
const CYCLE_DAYS: Record<HarvestFrequency, number> = { daily: 1, weekly: 7, monthly: 30 }

export function parseHarvestFrequency(raw: string | null | undefined): HarvestFrequency | null {
  return HARVEST_FREQUENCIES.includes(raw as HarvestFrequency) ? (raw as HarvestFrequency) : null
}

/**
 * How many days between one pick and the next.
 *
 * `count` is how many times per cycle the produce is picked, so it DIVIDES the
 * gap: weekly × 2 is every 3-4 days, not every fortnight. Rounded up, and never
 * below a day — two picks a day is still "tomorrow" as far as a buyer waiting
 * on the next one is concerned.
 */
export function harvestIntervalDays(
  frequency: string | null | undefined,
  count?: number | null,
): number | null {
  const freq = parseHarvestFrequency(frequency)
  if (!freq) return null
  const times = count != null && Number.isFinite(count) && count > 0 ? Math.floor(count) : 1
  return Math.max(1, Math.ceil(CYCLE_DAYS[freq] / times))
}

/** Add whole days to a YYYY-MM-DD date, staying in date space. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  // Date.UTC + getUTC* keeps this arithmetic off the local timezone entirely;
  // the input and output are both plain calendar dates.
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}

/** YYYY-MM-DD from a timestamp column (or a date already in that shape). */
export function isoDate(value: string | null | undefined): string | null {
  if (!value) return null
  const head = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null
}

/**
 * The date the next harvest is expected, or null when the farmer has not said
 * enough for an honest guess.
 *
 * Null is a real answer, not a failure: without a cadence we do not know, and
 * inventing "next week" would put a date in front of a buyer that the farmer
 * never agreed to. The caller falls back to wording with no date in it.
 *
 * Counted from the LAST pick, and never in the past — a farmer who has not
 * logged a harvest in a month would otherwise produce an estimate that has
 * already been and gone, so the schedule is rolled forward from today.
 */
export function nextHarvestDate(input: {
  lastHarvestedAt?: string | null
  frequency?: string | null
  frequencyCount?: number | null
  availabilityTo?: string | null
  today?: string
}): string | null {
  const interval = harvestIntervalDays(input.frequency, input.frequencyCount)
  if (interval == null) return null

  const today = input.today ?? todayInIndia()
  const last = isoDate(input.lastHarvestedAt)

  // No pick on record: the next one is a full cycle out from today.
  let next = last ? addDays(last, interval) : addDays(today, interval)
  // Roll forward over however many cycles have been missed, so the estimate is
  // always the NEXT one rather than a stale one.
  while (next <= today) next = addDays(next, interval)

  // Past the end of the season there is no next harvest to promise.
  const to = isoDate(input.availabilityTo)
  if (to && next > to) return null

  return next
}

/**
 * Is this produce inside the window the farmer said they can supply it in?
 *
 * An empty window means "no season set", which every listing predating the
 * availability columns is — those must stay orderable, so an absent bound is
 * always open rather than closed.
 */
export function isWithinAvailability(input: {
  from?: string | null
  to?: string | null
  today?: string
}): boolean {
  const today = input.today ?? todayInIndia()
  const from = isoDate(input.from)
  const to = isoDate(input.to)
  if (from && today < from) return false
  if (to && today > to) return false
  return true
}

/**
 * A next-harvest date as a buyer reads it: "12 Sep".
 *
 * en-IN with no year, matching how every other date in the shop is rendered.
 * The year is noise for a date that is days or weeks away, and this string
 * appears mid-sentence in a dialog where brevity matters.
 */
export function formatHarvestDate(iso: string | null | undefined): string | null {
  const date = isoDate(iso)
  if (!date) return null
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/**
 * Sanitise the expected-harvest date a client sends with a pre-order.
 *
 * The buyer's browser computed this from the listing's own cadence and showed
 * it to them, and it is stored so the farmer sees the date the promise was made
 * on. It is display data, not money or inventory — but it still gets bounded
 * rather than written through, because a stored date is a date somebody later
 * acts on. Anything malformed, already past, or more than a year out is dropped
 * to null, and the order simply carries no promised date.
 */
export function preorderExpectedDate(
  raw: string | null | undefined,
  today: string = todayInIndia(),
): string | null {
  const date = isoDate(raw)
  if (!date) return null
  if (date < today) return null
  if (date > addDays(today, 365)) return null
  return date
}

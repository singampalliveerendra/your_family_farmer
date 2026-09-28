import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  harvestRelTime,
  harvestClock,
  harvestAgeDays,
  freshnessLeftDays,
  freshnessLabel,
} from '@/lib/harvest'

// The harvest clock IS the product's promise: "Harvested 2 hours ago" is the
// one thing a buyer cannot get from a shop. If it drifts, the app is claiming a
// freshness it can't back — the single fastest way to lose a buyer's trust.
//
// The clock is frozen for these tests so "2 hours ago" means the same thing on
// every machine and at every hour of the day. Dates are built from local
// components (not UTC strings) because the day buckets are counted by the
// LOCAL calendar, exactly as a person reading the dates would count them.

// A fixed reference: 7 Sep 2026, 2:00 pm local time.
const NOW = new Date(2026, 8, 7, 14, 0, 0)
const at = (d: Date) => d.toISOString()
const minutesAgo = (n: number) => at(new Date(NOW.getTime() - n * 60_000))
const hoursAgo = (n: number) => at(new Date(NOW.getTime() - n * 3_600_000))
// Same clock time, N calendar days back — the shape real harvest data takes.
const daysAgoAt = (days: number, hour: number) =>
  at(new Date(2026, 8, 7 - days, hour, 0, 0))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('harvestRelTime', () => {
  // USE: a farmer logs a pick and immediately looks at their own listing. If it
  // said "0 mins ago" it would read as broken; "just now" is what confirms the
  // log actually landed.
  it('says "just now" for a pick logged in the last minute', () => {
    expect(harvestRelTime(minutesAgo(0))).toBe('just now')
    expect(harvestRelTime(minutesAgo(0.5))).toBe('just now')
  })

  // USE: singular/plural is not cosmetic here — "1 mins ago" on the flagship
  // freshness badge is the kind of detail buyers read as amateurish.
  it('counts minutes with the right singular and plural', () => {
    expect(harvestRelTime(minutesAgo(1))).toBe('1 min ago')
    expect(harvestRelTime(minutesAgo(12))).toBe('12 mins ago')
    expect(harvestRelTime(minutesAgo(59))).toBe('59 mins ago')
  })

  // USE: the switch from minutes to hours is where the badge stops shouting
  // "brand new" and starts reading as today's produce. Pinning the boundary
  // stops an off-by-one that would show "60 mins ago".
  it('switches to hours at the 60-minute mark', () => {
    expect(harvestRelTime(hoursAgo(1))).toBe('1 hour ago')
    expect(harvestRelTime(hoursAgo(5))).toBe('5 hours ago')
  })

  // USE: THE bug this function was written to prevent. A pick from the 5th at
  // 4pm, read on the 7th at 10am, is 42 elapsed hours — which rounds to "1 day"
  // and would print "yesterday" to a buyer looking at a two-day-old vegetable.
  // Day buckets are counted by the calendar instead, so it reads "2 days ago".
  it('counts days by the calendar, not by 24-hour chunks', () => {
    vi.setSystemTime(new Date(2026, 8, 7, 10, 0, 0))
    expect(harvestRelTime(at(new Date(2026, 8, 5, 16, 0, 0)))).toBe('2 days ago')
  })

  // USE: "yesterday" is friendlier and more precise than "1 days ago", and it
  // must trigger on the date rolling over — an 11pm pick read at 1am is
  // yesterday's, even though only two hours have passed.
  it('says "yesterday" as soon as the date rolls over', () => {
    vi.setSystemTime(new Date(2026, 8, 7, 1, 0, 0))
    expect(harvestRelTime(at(new Date(2026, 8, 6, 23, 0, 0)))).toBe('yesterday')
  })

  // USE: farmers log picks they are about to make, so the consumer feed can
  // advertise tomorrow's harvest. Rendering that as "in 2 hours" instead of
  // "-120 mins ago" is what makes a pre-announced pick usable.
  it('phrases a future pick as "in ..." rather than a negative age', () => {
    const inTwoHours = at(new Date(NOW.getTime() + 2 * 3_600_000))
    expect(harvestRelTime(inTwoHours)).toBe('in 2 hours')
    expect(harvestRelTime(at(new Date(2026, 8, 8, 7, 0, 0)))).toBe('tomorrow')
  })

  // USE: a bad timestamp must produce an empty string, which the callers hide.
  // The alternative is "NaN mins ago" printed across the consumer feed.
  it('renders nothing at all for an unparseable date', () => {
    expect(harvestRelTime('not-a-date')).toBe('')
    expect(harvestRelTime('')).toBe('')
  })

  // USE: Telugu is the app's default language. The clock is on every harvest
  // card, so an untranslated one is the most visible possible language leak.
  it('translates through the L() helper when one is supplied', () => {
    const te = (_en: string, t: string) => t
    expect(harvestRelTime(minutesAgo(0), te)).toBe('ఇప్పుడే')
    expect(harvestRelTime(hoursAgo(3), te)).toBe('3 గం క్రితం')
  })
})

describe('harvestClock', () => {
  // USE: the headline string on the card. Past picks are stated as fact,
  // upcoming ones must be clearly an expectation — a buyer told "Harvested
  // tomorrow" would reasonably think the produce is already in hand.
  it('labels a past pick as harvested and a future one as expected', () => {
    expect(harvestClock(hoursAgo(2))).toBe('Harvested 2 hours ago')
    expect(harvestClock(at(new Date(NOW.getTime() + 3 * 3_600_000)))).toBe(
      'Harvest expected in 3 hours',
    )
  })

  // USE: with no usable timestamp the whole clock disappears rather than
  // printing a bare prefix like "Harvested".
  it('is empty when the timestamp is unusable', () => {
    expect(harvestClock('nonsense')).toBe('')
  })
})

describe('harvestAgeDays', () => {
  // USE: this number drives the freshness maths below and the "Fresh Harvests"
  // shelf-life window on the consumer feed. Day 0 must mean picked today.
  it('counts calendar days off the plant, starting at 0 for today', () => {
    expect(harvestAgeDays(daysAgoAt(0, 6))).toBe(0)
    expect(harvestAgeDays(daysAgoAt(1, 6))).toBe(1)
    expect(harvestAgeDays(daysAgoAt(3, 6))).toBe(3)
  })

  // USE: a pick logged for later is not "aged -1 days". Clamping to 0 keeps the
  // freshness figure sane for pre-announced harvests.
  it('treats a future pick as zero days old, never negative', () => {
    expect(harvestAgeDays(at(new Date(NOW.getTime() + 86_400_000)))).toBe(0)
  })

  // USE: garbage in must not poison the freshness label with NaN.
  it('is 0 for an invalid date', () => {
    expect(harvestAgeDays('rubbish')).toBe(0)
  })
})

describe('freshnessLeftDays', () => {
  // USE: shelf life minus age is what tells a buyer whether to cook it tonight.
  it('is the shelf life less the days already gone', () => {
    expect(freshnessLeftDays(daysAgoAt(0, 6), 5)).toBe(5)
    expect(freshnessLeftDays(daysAgoAt(2, 6), 5)).toBe(3)
  })

  // USE: past its window it must go negative rather than clamp, so the label
  // can say "Past best" instead of a cheerful "0 days left".
  it('goes negative once the shelf life is used up', () => {
    expect(freshnessLeftDays(daysAgoAt(7, 6), 5)).toBe(-2)
  })

  // USE: shelf life is optional on a listing. No shelf life means the app
  // cannot know, and must say nothing — inventing a number here would be a
  // freshness claim we have no basis for.
  it('returns null when no shelf life was recorded', () => {
    expect(freshnessLeftDays(daysAgoAt(1, 6), null)).toBeNull()
    expect(freshnessLeftDays(daysAgoAt(1, 6), undefined)).toBeNull()
    expect(freshnessLeftDays(daysAgoAt(1, 6), 0)).toBeNull()
  })
})

describe('freshnessLabel', () => {
  // USE: the four rungs a buyer actually reads. Each boundary is a different
  // buying decision, so each is pinned separately.
  it('phrases every rung of the freshness ladder', () => {
    expect(freshnessLabel(daysAgoAt(0, 6), 5)).toBe('5 days fresh left')
    expect(freshnessLabel(daysAgoAt(4, 6), 5)).toBe('1 day fresh left')
    expect(freshnessLabel(daysAgoAt(5, 6), 5)).toBe('Use today')
    expect(freshnessLabel(daysAgoAt(6, 6), 5)).toBe('Past best')
  })

  // USE: null means the card renders no freshness chip at all, rather than an
  // empty or misleading one.
  it('is null when freshness cannot be computed', () => {
    expect(freshnessLabel(daysAgoAt(1, 6), null)).toBeNull()
  })

  // USE: same language rule as the clock — this chip sits right beside it.
  it('translates', () => {
    const te = (_en: string, t: string) => t
    expect(freshnessLabel(daysAgoAt(6, 6), 5, te)).toBe('గడువు ముగిసింది')
  })
})

import { describe, it, expect } from 'vitest'
import {
  HARVEST_FREQUENCIES,
  formatHarvestDate,
  addDays,
  harvestIntervalDays,
  isWithinAvailability,
  isoDate,
  nextHarvestDate,
  parseHarvestFrequency,
  preorderExpectedDate,
} from '@/lib/harvestSchedule'

// The date a buyer is shown before they agree to wait for the next harvest, and
// the date stored on the pre-order as the promise the farmer has to meet. A
// wrong answer here is not a cosmetic bug: it is a date a customer planned
// their week around.
//
// Every case passes an explicit `today` so the suite cannot drift with the
// calendar.

describe('parseHarvestFrequency', () => {
  // USE: the three cadences the farmer's form offers. 'monthly' is the new one
  // — the column is bare text with no CHECK, so nothing but this guard stops a
  // typo becoming a stored value nobody can compute from.
  it('accepts exactly the three cadences the form offers', () => {
    expect(HARVEST_FREQUENCIES).toEqual(['daily', 'weekly', 'monthly'])
    expect(parseHarvestFrequency('daily')).toBe('daily')
    expect(parseHarvestFrequency('weekly')).toBe('weekly')
    expect(parseHarvestFrequency('monthly')).toBe('monthly')
  })

  // USE: listings created before the cadence existed carry null, and rows
  // written by hand can carry anything at all.
  it('rejects everything else', () => {
    expect(parseHarvestFrequency(null)).toBeNull()
    expect(parseHarvestFrequency(undefined)).toBeNull()
    expect(parseHarvestFrequency('')).toBeNull()
    expect(parseHarvestFrequency('fortnightly')).toBeNull()
    expect(parseHarvestFrequency('Weekly')).toBeNull()
  })
})

describe('harvestIntervalDays', () => {
  // USE: the plain cadences, with no count set.
  it('maps each cadence to its cycle', () => {
    expect(harvestIntervalDays('daily')).toBe(1)
    expect(harvestIntervalDays('weekly')).toBe(7)
    expect(harvestIntervalDays('monthly')).toBe(30)
  })

  // USE: `harvest_frequency_count` is picks PER cycle, so it divides the gap.
  // Reading it as a multiplier would tell a buyer to wait a fortnight for
  // produce picked twice a week.
  it('divides the cycle by the number of picks in it', () => {
    expect(harvestIntervalDays('weekly', 2)).toBe(4)
    expect(harvestIntervalDays('monthly', 3)).toBe(10)
  })

  // USE: several picks a day is still "tomorrow" to someone waiting for the
  // next one, and a zero or negative count must never produce a zero interval —
  // nextHarvestDate loops on it.
  it('never goes below a day, whatever the count says', () => {
    expect(harvestIntervalDays('daily', 3)).toBe(1)
    expect(harvestIntervalDays('weekly', 0)).toBe(7)
    expect(harvestIntervalDays('weekly', -4)).toBe(7)
  })

  // USE: no cadence means no estimate — see nextHarvestDate.
  it('has no answer without a cadence', () => {
    expect(harvestIntervalDays(null)).toBeNull()
    expect(harvestIntervalDays('sometimes')).toBeNull()
  })
})

describe('nextHarvestDate', () => {
  // USE: the ordinary case — picked last Monday, picked weekly, so the next one
  // is this Monday.
  it('counts one interval on from the last pick', () => {
    expect(nextHarvestDate({
      lastHarvestedAt: '2026-09-01T06:30:00.000Z',
      frequency: 'weekly',
      today: '2026-09-04',
    })).toBe('2026-09-08')
  })

  // USE: a farmer who stopped logging picks for a month. Counting one interval
  // blindly would hand the buyer a date in August and call it "next".
  it('rolls a stale schedule forward instead of promising a past date', () => {
    expect(nextHarvestDate({
      lastHarvestedAt: '2026-07-01',
      frequency: 'weekly',
      today: '2026-09-04',
    })).toBe('2026-09-09')
  })

  // USE: today's pick is finished and the produce is picked daily — the answer
  // is tomorrow, never today, or the buyer waits for something already gone.
  it('is always in the future, never today', () => {
    expect(nextHarvestDate({
      lastHarvestedAt: '2026-09-04',
      frequency: 'daily',
      today: '2026-09-04',
    })).toBe('2026-09-05')
  })

  // USE: a produce with a cadence but no logged pick at all still deserves an
  // estimate — a full cycle out from today.
  it('estimates from today when nothing has been picked yet', () => {
    expect(nextHarvestDate({ frequency: 'monthly', today: '2026-09-04' })).toBe('2026-10-04')
  })

  // USE: the honest null. Without a cadence we do not know, and inventing "next
  // week" puts a date in front of the buyer the farmer never agreed to.
  it('returns null rather than guessing when no cadence is set', () => {
    expect(nextHarvestDate({ lastHarvestedAt: '2026-09-01', today: '2026-09-04' })).toBeNull()
    expect(nextHarvestDate({ frequency: '', today: '2026-09-04' })).toBeNull()
  })

  // USE: the season is over — the mango tree is done until next year, and the
  // farmer's window says so. No date is better than one past the end of it.
  it('has no answer past the end of the availability window', () => {
    expect(nextHarvestDate({
      lastHarvestedAt: '2026-09-01',
      frequency: 'weekly',
      availabilityTo: '2026-09-05',
      today: '2026-09-04',
    })).toBeNull()
  })

  // USE: the count feeds straight through to the promised date.
  it('honours picks-per-cycle', () => {
    expect(nextHarvestDate({
      lastHarvestedAt: '2026-09-01',
      frequency: 'weekly',
      frequencyCount: 2,
      today: '2026-09-04',
    })).toBe('2026-09-05')
  })
})

describe('isWithinAvailability', () => {
  // USE: inside the season the farmer declared.
  it('is open inside the window, including both ends', () => {
    expect(isWithinAvailability({ from: '2026-09-01', to: '2026-09-30', today: '2026-09-04' })).toBe(true)
    expect(isWithinAvailability({ from: '2026-09-04', to: '2026-09-04', today: '2026-09-04' })).toBe(true)
  })

  // USE: before it starts and after it ends.
  it('is closed outside it', () => {
    expect(isWithinAvailability({ from: '2026-10-01', today: '2026-09-04' })).toBe(false)
    expect(isWithinAvailability({ to: '2026-09-03', today: '2026-09-04' })).toBe(false)
  })

  // USE: every listing predating the availability columns has null bounds. If an
  // absent bound read as closed, the whole existing catalogue would go dark.
  it('treats an unset bound as open, so old listings stay orderable', () => {
    expect(isWithinAvailability({ today: '2026-09-04' })).toBe(true)
    expect(isWithinAvailability({ from: null, to: null, today: '2026-09-04' })).toBe(true)
    expect(isWithinAvailability({ from: '2026-01-01', to: null, today: '2026-09-04' })).toBe(true)
  })
})

describe('addDays / isoDate', () => {
  // USE: the arithmetic must not care what timezone the server is in, and must
  // cross month and year ends correctly.
  it('adds days in date space, across month and year boundaries', () => {
    expect(addDays('2026-09-04', 7)).toBe('2026-09-11')
    expect(addDays('2026-09-28', 7)).toBe('2026-10-05')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  // USE: harvested_at is a timestamp column and availability_from is a date
  // column; both have to reduce to the same YYYY-MM-DD.
  it('reduces a timestamp or a date to a plain date', () => {
    expect(isoDate('2026-09-04T18:30:00.000Z')).toBe('2026-09-04')
    expect(isoDate('2026-09-04')).toBe('2026-09-04')
    expect(isoDate(null)).toBeNull()
    expect(isoDate('not a date')).toBeNull()
  })
})

describe('formatHarvestDate', () => {
  // USE: the string that lands mid-sentence in the pre-order dialog. It must
  // read as a date a buyer in India recognises, with no year to pad out a
  // sentence about something a week away.
  // Matched on a prefix, not an exact string: ICU spells September as both
  // "Sep" and "Sept" depending on its CLDR version, and this renders in the
  // buyer's browser as often as in Node. Pinning one spelling would fail on a
  // library upgrade without anything actually being wrong.
  it('renders a plain day-and-month', () => {
    expect(formatHarvestDate('2026-09-12')).toMatch(/^12 Sep/)
    expect(formatHarvestDate('2027-01-02')).toBe('2 Jan')
  })

  // USE: the same helper is handed harvested_at, which is a timestamp. Parsing
  // it as local time could shift the date a day either way depending on where
  // the server sits.
  it('does not shift the day when given a timestamp', () => {
    expect(formatHarvestDate('2026-09-12T23:30:00.000Z')).toMatch(/^12 Sep/)
    expect(formatHarvestDate('2026-09-12T00:10:00.000Z')).toMatch(/^12 Sep/)
  })

  // USE: nextHarvestDate returns null whenever the farmer has not said enough,
  // and the caller renders the no-date wording instead.
  it('passes a missing date straight through as null', () => {
    expect(formatHarvestDate(null)).toBeNull()
    expect(formatHarvestDate('')).toBeNull()
  })
})

describe('preorderExpectedDate', () => {
  // USE: the ordinary case — the date the buyer was shown is stored as-is, so
  // the farmer sees the promise the buyer is holding them to.
  it('keeps a sane date the buyer was shown', () => {
    expect(preorderExpectedDate('2026-09-12', '2026-09-04')).toBe('2026-09-12')
    expect(preorderExpectedDate('2026-09-04', '2026-09-04')).toBe('2026-09-04')
  })

  // USE: this value arrives from the browser, so it is whatever the client
  // says. A promised date in the past is nonsense on an order the farmer has
  // yet to fulfil.
  it('drops a date that has already been', () => {
    expect(preorderExpectedDate('2026-09-03', '2026-09-04')).toBeNull()
  })

  // USE: nobody waits three years for a harvest; a date that far out is a bug
  // or a crafted request, and null is more honest than storing it.
  it('drops an absurdly distant date', () => {
    expect(preorderExpectedDate('2029-01-01', '2026-09-04')).toBeNull()
    expect(preorderExpectedDate('2027-09-04', '2026-09-04')).toBe('2027-09-04')
  })

  // USE: a listing with no cadence produces no date at all, and the order
  // carries none. Malformed input must land in the same place, not throw inside
  // the checkout that has already claimed stock.
  it('drops anything malformed or absent', () => {
    expect(preorderExpectedDate(null, '2026-09-04')).toBeNull()
    expect(preorderExpectedDate('', '2026-09-04')).toBeNull()
    expect(preorderExpectedDate('next week', '2026-09-04')).toBeNull()
    expect(preorderExpectedDate('12-09-2026', '2026-09-04')).toBeNull()
  })
})

import { describe, it, expect, afterEach, vi } from 'vitest'
import { todayInIndia, isPastDate } from '@/lib/date'

// Every user of this app is in India; the servers are not. Using toISOString()
// for "today" rolls the date over at 5:30am IST, so between midnight and 5:30am
// a consumer could pick yesterday as a needed-by date and a farmer's "today"
// harvest list would still be showing the previous day.

afterEach(() => {
  vi.useRealTimers()
})

describe('todayInIndia', () => {
  // USE: the exact window the bug lived in. At 01:00 IST on the 8th, UTC is
  // still the 7th — this must say the 8th, which is what the farmer's phone says.
  it('is the Indian calendar date, not the UTC one, in the small hours', () => {
    vi.useFakeTimers()
    // 2026-09-07T20:30:00Z is 2026-09-08 02:00 IST.
    vi.setSystemTime(new Date('2026-09-07T20:30:00Z'))
    expect(todayInIndia()).toBe('2026-09-08')
  })

  // USE: and the ordinary daytime case still agrees.
  it('agrees with the plain date during the Indian day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T06:00:00Z')) // 11:30 IST
    expect(todayInIndia()).toBe('2026-09-07')
  })

  // USE: the format is compared as a STRING against ISO dates from date inputs
  // and Postgres. A locale that emitted "07/09/2026" would break every
  // comparison silently rather than loudly.
  it('is always YYYY-MM-DD, which is what the string comparisons rely on', () => {
    expect(todayInIndia()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('isPastDate', () => {
  // USE: this is what stops a consumer requesting produce for a day that has
  // already gone, and what greys out expired harvest dates.
  it('flags a date before today and accepts today itself', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T06:00:00Z'))
    expect(isPastDate('2026-09-06')).toBe(true)
    expect(isPastDate('2026-09-07')).toBe(false)
    expect(isPastDate('2026-09-08')).toBe(false)
  })

  // USE: an empty date field is "not chosen yet", not "in the past" — treating
  // it as past would show a validation error before the user has typed anything.
  it('treats a missing date as not past', () => {
    expect(isPastDate(null)).toBe(false)
    expect(isPastDate(undefined)).toBe(false)
    expect(isPastDate('')).toBe(false)
  })
})

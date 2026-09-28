import { describe, it, expect } from 'vitest'
import {
  normalizePickupSlots,
  normalizePickupSchedule,
  normalizePickupPhones,
  formatPickupSlots,
  emptyPickupSlot,
  PICKUP_DEFAULT_FROM,
  PICKUP_DEFAULT_TO,
} from '@/lib/pickup-slots'

// A pickup schedule tells a buyer when and where to physically turn up. Every
// failure here wastes somebody's trip. The column also holds THREE historical
// shapes — a single object, a flat array, and today's per-location map — so
// this normaliser is what stops old farmer profiles from rendering as blank.

describe('normalizePickupSlots', () => {
  // USE: the current shape passes through intact, with days de-duplicated so a
  // double-tap in the form doesn't print "Mon, Mon, Wed".
  it('keeps a well-formed slot and de-duplicates its days', () => {
    expect(normalizePickupSlots([{ days: ['Monday', 'Monday', 'Friday'], time_from: '09:00', time_to: '11:00' }]))
      .toEqual([{ days: ['Monday', 'Friday'], time_from: '09:00', time_to: '11:00' }])
  })

  // USE: profiles saved before multi-slot support hold ONE object, not an
  // array. Without this branch every such farmer's pickup times disappear from
  // their public page.
  it('upgrades the legacy single-object shape to an array', () => {
    expect(normalizePickupSlots({ days: ['Sunday'], time_from: '17:00', time_to: '19:00' }))
      .toEqual([{ days: ['Sunday'], time_from: '17:00', time_to: '19:00' }])
  })

  // USE: a window with no days chosen is a half-finished form row, not a
  // schedule. Dropping it lets the caller persist `result.length ? result : null`
  // and never advertise a pickup window that means nothing.
  it('drops windows with no days chosen', () => {
    expect(normalizePickupSlots([{ days: [], time_from: '08:00', time_to: '12:00' }])).toEqual([])
  })

  // USE: a missing time must fall back to the documented default rather than
  // render "undefined–undefined" to a buyer.
  it('fills in default times when they are missing', () => {
    expect(normalizePickupSlots([{ days: ['Tuesday'] }]))
      .toEqual([{ days: ['Tuesday'], time_from: PICKUP_DEFAULT_FROM, time_to: PICKUP_DEFAULT_TO }])
  })

  // USE: this value comes straight out of a JSON column that nothing validates.
  // Null, a string, a number or a stray primitive inside the array must all
  // yield an empty schedule instead of crashing the farmer's public page.
  it('returns an empty list for null or junk instead of throwing', () => {
    expect(normalizePickupSlots(null)).toEqual([])
    expect(normalizePickupSlots(undefined)).toEqual([])
    expect(normalizePickupSlots(['nonsense', 42, null])).toEqual([])
  })
})

describe('normalizePickupSchedule', () => {
  // USE: today's shape — each pickup point carries its own windows, because a
  // farmer is at the bus stand on weekday mornings and the market road on
  // Sunday evenings.
  it('keeps a per-location schedule keyed by location', () => {
    const raw = {
      'Bus stand': [{ days: ['Monday'], time_from: '08:00', time_to: '12:00' }],
      'Market road': [{ days: ['Sunday'], time_from: '17:00', time_to: '19:00' }],
    }
    const out = normalizePickupSchedule(raw, ['Bus stand', 'Market road'])
    expect(Object.keys(out)).toEqual(['Bus stand', 'Market road'])
    expect(out['Market road'][0].days).toEqual(['Sunday'])
  })

  // USE: the older flat-array shape was one global schedule with no location
  // attached. Attaching it to the farmer's first location preserves the data
  // instead of silently binning it on their next profile save.
  it('attaches a legacy global schedule to the first location', () => {
    const out = normalizePickupSchedule(
      [{ days: ['Wednesday'], time_from: '07:00', time_to: '09:00' }],
      ['Farm gate', 'Bus stand'],
    )
    expect(out).toEqual({ 'Farm gate': [{ days: ['Wednesday'], time_from: '07:00', time_to: '09:00' }] })
  })

  // USE: when a farmer deletes a pickup point, its old windows must not linger
  // in the JSON and reappear if that name is ever reused. Scoping to the
  // current locations is what garbage-collects them.
  it('drops the schedule of a location the farmer has removed', () => {
    const raw = {
      'Bus stand': [{ days: ['Monday'], time_from: '08:00', time_to: '12:00' }],
      'Old shed': [{ days: ['Friday'], time_from: '08:00', time_to: '12:00' }],
    }
    expect(Object.keys(normalizePickupSchedule(raw, ['Bus stand']))).toEqual(['Bus stand'])
  })

  // USE: a location whose windows are all empty is omitted entirely, so the
  // public page shows a clean "no pickup times set" rather than a named
  // location with nothing under it.
  it('omits a location whose windows are all empty', () => {
    expect(normalizePickupSchedule({ 'Bus stand': [{ days: [] }] }, ['Bus stand'])).toEqual({})
  })

  // USE: same JSON-column defensiveness as above.
  it('returns an empty schedule for null or junk', () => {
    expect(normalizePickupSchedule(null, ['Bus stand'])).toEqual({})
    expect(normalizePickupSchedule('nope', ['Bus stand'])).toEqual({})
  })
})

describe('normalizePickupPhones', () => {
  // USE: a pickup point is often a shop, so the buyer needs THAT number. Keying
  // by location name (not index) is what stops a deletion from shifting a phone
  // number onto the wrong pickup point — a buyer calling a stranger.
  it('keeps a valid number against its own location', () => {
    expect(normalizePickupPhones({ 'Bus stand': '9876543210' }, ['Bus stand']))
      .toEqual({ 'Bus stand': '9876543210' })
  })

  // USE: people type numbers with +91, spaces and dashes. Storing the bare ten
  // digits is what makes the tel: link dial correctly.
  it('strips formatting and the country code down to ten digits', () => {
    expect(normalizePickupPhones({ Shop: '+91 98765-43210' }, ['Shop']))
      .toEqual({ Shop: '9876543210' })
  })

  // USE: a half-typed number must be dropped, never shown as something to dial.
  // A buyer ringing a dead number blames the farmer, not the form.
  it('drops anything that is not a usable ten-digit number', () => {
    expect(normalizePickupPhones({ Shop: '98765' }, ['Shop'])).toEqual({})
    expect(normalizePickupPhones({ Shop: '' }, ['Shop'])).toEqual({})
    expect(normalizePickupPhones({ Shop: null }, ['Shop'])).toEqual({})
  })

  // USE: numbers for deleted locations are garbage-collected the same way the
  // schedules are.
  it('drops numbers for locations that no longer exist', () => {
    expect(normalizePickupPhones({ 'Old shed': '9876543210' }, ['Bus stand'])).toEqual({})
  })

  // USE: an array or null in this column must not throw on a public page.
  it('returns an empty map for a non-object value', () => {
    expect(normalizePickupPhones(['9876543210'], ['Bus stand'])).toEqual({})
    expect(normalizePickupPhones(null)).toEqual({})
  })
})

describe('formatPickupSlots', () => {
  // USE: the exact line a buyer reads on the farmer's page. Days are shortened
  // to fit a 390px screen and 24h times become AM/PM, which is how times are
  // read locally.
  it('renders short days and 12-hour times', () => {
    expect(formatPickupSlots([{ days: ['Monday', 'Wednesday', 'Friday'], time_from: '08:00', time_to: '12:00' }]))
      .toEqual(['Mon, Wed, Fri · 8:00 AM–12:00 PM'])
  })

  // USE: midnight and noon are where 12-hour conversion classically breaks —
  // "0:00 AM" and "0:00 PM" are both wrong.
  it('gets midnight and noon right', () => {
    expect(formatPickupSlots([{ days: ['Sunday'], time_from: '00:00', time_to: '12:00' }]))
      .toEqual(['Sun · 12:00 AM–12:00 PM'])
  })

  // USE: an empty window contributes no line at all, rather than a stray "·".
  it('skips windows with no days', () => {
    expect(formatPickupSlots([{ days: [], time_from: '08:00', time_to: '12:00' }])).toEqual([])
    expect(formatPickupSlots(undefined)).toEqual([])
  })
})

describe('emptyPickupSlot', () => {
  // USE: the "+ Add" button in the farmer form. It must start with no days
  // selected so the row is dropped if the farmer changes their mind, and with
  // sensible default times so most farmers only pick days.
  it('starts with no days and the default times', () => {
    expect(emptyPickupSlot()).toEqual({ days: [], time_from: PICKUP_DEFAULT_FROM, time_to: PICKUP_DEFAULT_TO })
  })
})

import { describe, it, expect } from 'vitest'
import { haversineKm, nearestTown, formatDistance, townByName, farmerCoords, AP_TOWNS } from '@/lib/location'

// Distance decides which farmers a buyer is even shown. A farmer this module
// cannot place is a farmer with no customers — which is precisely what happened
// when profiles saved without GPS were dropped from every 5km search.

describe('haversineKm', () => {
  // USE: a known real pair. Tadepalligudem to Bhimavaram is about 30km on the
  // ground; anything wildly off means the formula has been broken.
  it('measures a known distance between two AP towns', () => {
    const d = haversineKm(16.8142, 81.5288, 16.5444, 81.5216)
    expect(d).toBeGreaterThan(28)
    expect(d).toBeLessThan(32)
  })

  // USE: a farmer standing at the buyer's own pin is 0km away, not a rounding
  // artefact that pushes them outside a "same village" filter.
  it('is zero for the same point', () => {
    expect(haversineKm(16.8142, 81.5288, 16.8142, 81.5288)).toBe(0)
  })

  // USE: distance has no direction — A to B must equal B to A, or the same two
  // people see different distances from each other.
  it('is symmetric', () => {
    const ab = haversineKm(16.8142, 81.5288, 17.6868, 83.2185)
    const ba = haversineKm(17.6868, 83.2185, 16.8142, 81.5288)
    expect(ab).toBeCloseTo(ba, 9)
  })
})

describe('nearestTown', () => {
  // USE: a buyer's raw GPS pin is turned into a town name they recognise. The
  // pin is never exactly on the town centre, so "closest" must be robust.
  it('names the closest town to a nearby pin', () => {
    expect(nearestTown(16.82, 81.53)).toBe('Tadepalligudem')
    expect(nearestTown(16.55, 81.52)).toBe('Bhimavaram')
  })

  // USE: even a pin far outside the served area must resolve to SOMETHING, so
  // the UI never renders an empty location label.
  it('always returns a town, even for a far-away pin', () => {
    expect(AP_TOWNS.map((t) => t.name)).toContain(nearestTown(28.6, 77.2))
  })
})

describe('formatDistance', () => {
  // USE: under a kilometre reads in metres — "800 m away" is a walk, "0.8 km"
  // makes the buyer do the conversion.
  it('shows metres below one kilometre', () => {
    expect(formatDistance(0.8)).toBe('800 m')
    expect(formatDistance(0.05)).toBe('50 m')
  })

  // USE: one decimal in the near range, where the difference between 2.3km and
  // 2.8km actually changes a buyer's mind; whole numbers beyond, where it does
  // not and the precision just adds noise on a small screen.
  it('keeps one decimal nearby and rounds off further out', () => {
    expect(formatDistance(2.34)).toBe('2.3 km')
    expect(formatDistance(9.9)).toBe('9.9 km')
    expect(formatDistance(23.6)).toBe('24 km')
  })

  // USE: the unit is part of what a buyer reads, so it follows the app
  // language. Telugu is the default, so an English "km" here is visible on the
  // very first screen.
  it('translates the unit', () => {
    const te = (_en: string, t: string) => t
    expect(formatDistance(0.4, te)).toBe('400 మీ')
    expect(formatDistance(12, te)).toBe('12 కి.మీ')
  })
})

describe('townByName', () => {
  // USE: names are typed by hand in any case, with any spacing.
  it('matches a town name regardless of case or padding', () => {
    expect(townByName('  tadepalligudem ')?.name).toBe('Tadepalligudem')
  })

  // USE: farmers write "Tadepalligudem Rural" or "near Bhimavaram". A strict
  // equality check would fail to place them and drop them from search.
  it('matches when the typed name merely contains a known town', () => {
    expect(townByName('Tadepalligudem Rural')?.name).toBe('Tadepalligudem')
  })

  // USE: an unknown village must return null so the caller can fall through to
  // its next strategy, rather than being silently placed in the wrong town.
  it('returns null for an unknown or empty name', () => {
    expect(townByName('Springfield')).toBeNull()
    expect(townByName('')).toBeNull()
    expect(townByName(null)).toBeNull()
  })
})

describe('farmerCoords', () => {
  // USE: real GPS wins, and is flagged exact so the UI can show a precise
  // distance rather than an "approx" hedge.
  it('prefers the farmer\'s own GPS and marks it exact', () => {
    expect(farmerCoords({ lat: 16.8142, lng: 81.5288, location_name: 'Eluru' }))
      .toEqual({ lat: 16.8142, lng: 81.5288, approximate: false })
  })

  // USE: Supabase serialises numeric(10,7) as a STRING. Without the Number
  // cast, every GPS-tagged farmer silently fails the finite check and falls
  // back to an approximate town pin.
  it('accepts coordinates that arrive as strings from the database', () => {
    const res = farmerCoords({ lat: '16.8142', lng: '81.5288' })
    expect(res).toEqual({ lat: 16.8142, lng: 81.5288, approximate: false })
  })

  // USE: THE bug this function exists for. Most farmers register without ever
  // granting GPS — they just type the village. With no fallback, a 5km search
  // returns zero results even for farmers in the buyer's own town.
  it('falls back to the town named in the profile, flagged approximate', () => {
    const res = farmerCoords({ lat: null, lng: null, location_name: 'Bhimavaram' })
    expect(res).toMatchObject({ approximate: true })
    expect(res?.lat).toBeCloseTo(16.5444, 3)
  })

  // USE: the village field is the second chance — many profiles fill that and
  // not location_name.
  it('falls back to the village when there is no location name', () => {
    expect(farmerCoords({ location_name: null, village: 'Tanuku' })).toMatchObject({ approximate: true })
  })

  // USE: 0,0 is the Atlantic Ocean and is what a failed GPS read writes. Trusting
  // it would put a West Godavari farmer 2,000km offshore and hide them from
  // every distance filter.
  it('rejects a 0,0 GPS reading and uses the town instead', () => {
    expect(farmerCoords({ lat: 0, lng: 0, location_name: 'Eluru' })).toMatchObject({ approximate: true })
  })

  // USE: when nothing places the farmer, null lets the caller show them without
  // a distance rather than guessing one.
  it('returns null when the farmer cannot be placed at all', () => {
    expect(farmerCoords({ lat: null, lng: null, location_name: 'Nowhere', village: null })).toBeNull()
    expect(farmerCoords({})).toBeNull()
  })
})

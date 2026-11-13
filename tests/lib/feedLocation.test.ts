import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_FEED_LOCATION_FILTER, loadFeedLocationFilter, parseFeedLocationFilter, passesLocationFilter, saveFeedLocationFilter } from '@/lib/feedLocation'
import { reachFor } from '@/lib/retailReach'

// Client 2026-11-13: the buyer feed filters by Local · Far Away · All (default
// Local), replacing "Delivers to me" / 5 / 10 / 25 km.

const BHIMAVARAM_FARM = { lat: 16.5449, lng: 81.5212 }
const TADEPALLIGUDEM_BUYER = { lat: 16.8142, lng: 81.5288, state: 'AP' as const } // ~30 km away
const BHIMAVARAM_BUYER = { lat: 16.55, lng: 81.53, state: 'AP' as const } // ~1 km away

const pickupOnly = { courier_type: null, delivery_radius_km: null }
const cargo = { courier_type: 'cargo', delivery_radius_km: null }
const wideLocal = { courier_type: 'local', delivery_radius_km: 50 }

const keep = (listing: object, buyer: typeof BHIMAVARAM_BUYER | null, f: 'local' | 'far' | 'all') =>
  passesLocationFilter(reachFor(listing, BHIMAVARAM_FARM, buyer), f)

describe('feed location filter', () => {
  it('defaults to Local', () => {
    expect(DEFAULT_FEED_LOCATION_FILTER).toBe('local')
  })

  it('Local = inside the farmer radius (25 km when not set)', () => {
    expect(keep(pickupOnly, BHIMAVARAM_BUYER, 'local')).toBe(true)
    expect(keep(pickupOnly, TADEPALLIGUDEM_BUYER, 'local')).toBe(false)
    // The farmer set 50 km — a 30 km buyer is local.
    expect(keep(wideLocal, TADEPALLIGUDEM_BUYER, 'local')).toBe(true)
  })

  it('Far Away = beyond the radius but the farmer still sends it (cargo)', () => {
    expect(keep(cargo, TADEPALLIGUDEM_BUYER, 'far')).toBe(true)
    expect(keep(cargo, TADEPALLIGUDEM_BUYER, 'local')).toBe(false)
    // Nearby cargo produce is Local, not Far Away.
    expect(keep(cargo, BHIMAVARAM_BUYER, 'far')).toBe(false)
    expect(keep(cargo, BHIMAVARAM_BUYER, 'local')).toBe(true)
    // Far, pickup only: no way to get it — not under Far Away.
    expect(keep(pickupOnly, TADEPALLIGUDEM_BUYER, 'far')).toBe(false)
  })

  it('All hides nothing, even produce that cannot reach the buyer', () => {
    expect(keep(pickupOnly, TADEPALLIGUDEM_BUYER, 'all')).toBe(true)
  })

  it('no buyer location: nothing is hidden under any filter', () => {
    for (const f of ['local', 'far', 'all'] as const) {
      expect(keep(pickupOnly, null, f)).toBe(true)
      expect(keep(cargo, null, f)).toBe(true)
    }
  })

  it('the feed has the three buttons, not the old km chips', () => {
    const page = readFileSync(join(__dirname, '../../src/app/consumer/page.tsx'), 'utf8')
    expect(page).toContain('FEED_LOCATION_FILTERS')
    expect(page).not.toContain("'reach', 5, 10, 25")
    expect(page).not.toContain("L('🚚 Delivers to me'")
  })
})

// Client 2026-11-13: the buyer's pick stays until they close the app.
describe('the pick sticks for the session', () => {
  const store = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  }
  it('saved, then read back on the next open of the page', () => {
    const s = store()
    expect(loadFeedLocationFilter(s)).toBe('local')
    saveFeedLocationFilter(s, 'all')
    expect(loadFeedLocationFilter(s)).toBe('all')
    saveFeedLocationFilter(s, 'far')
    expect(loadFeedLocationFilter(s)).toBe('far')
  })
  it('junk, nothing, or blocked storage → Local, never a crash', () => {
    expect(parseFeedLocationFilter('25')).toBe('local')
    expect(parseFeedLocationFilter(null)).toBe('local')
    expect(loadFeedLocationFilter(null)).toBe('local')
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(loadFeedLocationFilter(blocked)).toBe('local')
    expect(() => saveFeedLocationFilter(blocked, 'all')).not.toThrow()
  })
  it('kept in sessionStorage (cleared when the app closes), not localStorage', () => {
    const page = readFileSync(join(__dirname, '../../src/app/consumer/page.tsx'), 'utf8')
    expect(page).toMatch(/loadFeedLocationFilter\(sessionStore\(\)\)/)
    expect(page).toMatch(/saveFeedLocationFilter\(sessionStore\(\), f\)/)
    expect(page).not.toMatch(/localStorage[^\n]*yff_feed_location_filter/)
  })
})

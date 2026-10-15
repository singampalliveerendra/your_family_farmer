import { describe, it, expect } from 'vitest'
import { rankFarmers, type FarmerCard } from '@/lib/farmersTab'

const f = (id: string, extra: Partial<FarmerCard> = {}): FarmerCard => ({
  id, slug: id, name: id, village: null, district: null, photo_url: null,
  account_type: 'farmer', rating_avg: null, follower_count: 0, listing_count: 0, ...extra,
})

describe('rankFarmers', () => {
  it('puts followed farmers in their own list', () => {
    const r = rankFarmers([f('a'), f('b'), f('c')], ['b'], null)
    expect(r.following.map((x) => x.id)).toEqual(['b'])
    expect(r.others.map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('without a location, most-followed first', () => {
    const r = rankFarmers([f('a', { follower_count: 1 }), f('b', { follower_count: 5 }), f('c', { follower_count: 1, listing_count: 3 })], [], null)
    expect(r.others.map((x) => x.id)).toEqual(['b', 'c', 'a'])
    expect(r.others[0].distanceKm).toBeNull()
  })

  it('with a location, nearest first and unknown places last', () => {
    const origin = { lat: 16.8, lng: 81.5 }
    const r = rankFarmers([
      f('far', { lat: 17.7, lng: 83.3 }),
      f('nowhere', { follower_count: 99 }),
      f('near', { lat: 16.81, lng: 81.51 }),
    ], [], origin)
    expect(r.others.map((x) => x.id)).toEqual(['near', 'far', 'nowhere'])
    expect(r.others[0].distanceKm).toBeLessThan(2)
  })
})

import { haversineKm, farmerCoords } from '@/lib/location'

/* The buyer's Farmers tab: the farmers they follow first, then everyone else —
 * nearest first once the buyer has set a location, otherwise most-followed. */

export type FarmerCard = {
  id: string
  slug: string
  name: string
  village: string | null
  district: string | null
  photo_url: string | null
  account_type: string | null
  rating_avg: number | null
  lat?: number | string | null
  lng?: number | string | null
  location_name?: string | null
  follower_count: number
  listing_count: number
  grow_text?: string | null
  grow_source?: GrowSource | null
}

export type RankedFarmer = FarmerCard & { distanceKm: number | null }

export function rankFarmers(
  farmers: FarmerCard[],
  followingIds: string[],
  origin: { lat: number; lng: number } | null,
): { following: RankedFarmer[]; others: RankedFarmer[] } {
  const followed = new Set(followingIds)
  const withDistance: RankedFarmer[] = farmers.map((f) => {
    const c = origin ? farmerCoords(f) : null
    return { ...f, distanceKm: origin && c ? haversineKm(origin.lat, origin.lng, c.lat, c.lng) : null }
  })
  const byPopularity = (a: RankedFarmer, b: RankedFarmer) =>
    b.follower_count - a.follower_count || b.listing_count - a.listing_count || a.name.localeCompare(b.name)
  const byDistance = (a: RankedFarmer, b: RankedFarmer) => {
    // Farmers with no known place go last rather than pretending to be near.
    if (a.distanceKm == null && b.distanceKm == null) return byPopularity(a, b)
    if (a.distanceKm == null) return 1
    if (b.distanceKm == null) return -1
    return a.distanceKm - b.distanceKm || byPopularity(a, b)
  }
  const sort = origin ? byDistance : byPopularity
  return {
    following: withDistance.filter((f) => followed.has(f.id)).sort(sort),
    others: withDistance.filter((f) => !followed.has(f.id)).sort(sort),
  }
}

/* The line under each farmer's name: how they grow. Farmers write "How we
 * grow" on each produce, so the newest one is used; a farmer who never filled
 * it in still has their farm story, and an aggregator their "How we aggregate". */
export type GrowSource = 'produce' | 'story' | 'aggregate'

export function pickGrowText(src: {
  produce?: string | null
  story?: string | null
  aggregate?: string | null
  isAggregator: boolean
}): { grow_text: string | null; grow_source: GrowSource | null } {
  const clean = (v?: string | null) => v?.replace(/\s+/g, ' ').trim() || null
  const produce = clean(src.produce)
  if (produce) return { grow_text: produce, grow_source: 'produce' }
  const aggregate = src.isAggregator ? clean(src.aggregate) : null
  if (aggregate) return { grow_text: aggregate, grow_source: 'aggregate' }
  const story = clean(src.story)
  if (story) return { grow_text: story, grow_source: 'story' }
  return { grow_text: null, grow_source: null }
}

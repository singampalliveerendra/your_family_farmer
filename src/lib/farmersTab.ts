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

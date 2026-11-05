import { nearestPlace } from '@/lib/location'
import type { Buyer } from '@/lib/retailReach'

/* The buyer's location as the home page saved it (localStorage, set when they
 * allow location or pick a town), for the detail pages' "delivers to you?"
 * (2026-11-05). Browser only; null when none is saved. */
export function readSavedBuyer(): Buyer {
  try {
    const lat = Number(localStorage.getItem('yff_consumer_lat'))
    const lng = Number(localStorage.getItem('yff_consumer_lng'))
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0) || !localStorage.getItem('yff_consumer_lat')) return null
    return { lat, lng, state: nearestPlace(lat, lng).state }
  } catch {
    return null
  }
}

import { useMemo, useSyncExternalStore } from 'react'
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

// ── As a React hook ──────────────────────────────────────────────────
// Reads the same saved location without setState-in-effect, and follows a
// change made in another tab (the 'storage' event).

const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}
const snapshot = () => {
  try { return `${localStorage.getItem('yff_consumer_lat') ?? ''}|${localStorage.getItem('yff_consumer_lng') ?? ''}` } catch { return '|' }
}

/** The buyer's saved location (null on the server and when none is saved). */
export function useSavedBuyer(): Buyer {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '|')
  return useMemo(() => (raw === '|' ? null : readSavedBuyer()), [raw])
}

'use client'

import { useEffect, useState } from 'react'

export type RiderContact = { name: string | null; phone: string }
/** Rider contact keyed by order id. */
export type RiderMap = Record<string, RiderContact>

// The orders list renders one card per order and each card wants its rider, so a
// naive fetch-per-card would fire a request per home delivery. /api/farmer/orders/riders
// already returns every rider in one shot, so we fetch it once and share the
// in-flight promise between all callers. Short TTL: rider contact barely changes,
// but a newly assigned rider should appear without a hard reload.
const TTL_MS = 30_000
let cache: { at: number; promise: Promise<RiderMap> } | null = null

function load(): Promise<RiderMap> {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) return cache.promise

  const promise = fetch('/api/farmer/orders/riders', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => ((j as { riders?: RiderMap } | null)?.riders ?? {}))
    .catch(() => {
      // Don't let a transient failure freeze an empty map in place for the whole
      // TTL — drop the cache so the next mount retries.
      cache = null
      return {} as RiderMap
    })

  cache = { at: now, promise }
  return promise
}

/** Force the next read to re-fetch (e.g. after an order's rider changes). */
export function invalidateFarmerRiders(): void {
  cache = null
}

/**
 * Rider contacts for the logged-in farmer's own orders, keyed by order id.
 * Empty until the fetch resolves, and empty for orders with no rider assigned.
 */
export function useFarmerRiders(): RiderMap {
  const [riders, setRiders] = useState<RiderMap>({})

  useEffect(() => {
    let cancelled = false
    void load().then((m) => { if (!cancelled) setRiders(m) })
    return () => { cancelled = true }
  }, [])

  return riders
}

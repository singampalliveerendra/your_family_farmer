/* The buyer's "orders needing attention" count, shared by everything that shows
 * it. The home page has two badges (the My orders chip and the bottom bar's
 * Orders tab) that each fetched /api/consumer/orders/count on mount — two server
 * runs for one number. Calls within a short window share one request. */

const SHARE_MS = 15_000

let last: { at: number; promise: Promise<number> } | null = null

export function fetchPendingOrderCount(
  fetcher: () => Promise<number> = defaultFetcher,
  now: number = Date.now(),
): Promise<number> {
  if (last && now - last.at < SHARE_MS) return last.promise
  const promise = fetcher().catch(() => 0)
  last = { at: now, promise }
  return promise
}

/** After sign-in / sign-out the count belongs to someone else. */
export function forgetPendingOrderCount(): void {
  last = null
}

async function defaultFetcher(): Promise<number> {
  const r = await fetch('/api/consumer/orders/count', { credentials: 'same-origin' })
  const j = await r.json().catch(() => ({}))
  return typeof j?.pending === 'number' ? j.pending : 0
}

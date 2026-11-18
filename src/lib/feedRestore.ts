// Coming back to the home feed where you left it (2026-11-18).
//
// Before: scroll to the 33rd card, open it, press Back → the feed remounted
// empty, showed the skeleton, refetched, drew 15 cards and sat at the top.
//
// Now the feed keeps a snapshot — its data, the filters, how many cards were
// drawn, and which card was at the top of the screen — and a remount within the
// same app session starts from it: no skeleton, same cards, same spot.
//
// Kept in memory (a module variable), NOT sessionStorage, on purpose: it lives
// exactly as long as the app's JavaScript does. Client-side navigation (open a
// product, Back) keeps it; a refresh or pull-to-refresh clears it, which is the
// "start again" the buyer asked for.

export type FeedFilters = {
  search: string
  method: string
  category: string
  sortBy: 'fresh' | 'rating' | 'purchases'
  farmerFilter: string
}

// The card at the top of the screen, and how far from the top of the viewport
// its top edge was. Restoring by card (not by raw scrollY) survives the
// boxes above the grid loading at a different speed the second time.
export type FeedAnchor = { key: string; top: number }

export type FeedSnapshot<D> = {
  data: D
  fetchedAt: number
  filters: FeedFilters
  consumerLat: number | null
  consumerLng: number | null
  consumerLocationName: string
  visibleCount: number
  anchor: FeedAnchor | null
  scrollY: number
}

let snapshot: FeedSnapshot<unknown> | null = null

export function saveFeedSnapshot<D>(s: FeedSnapshot<D>): void {
  snapshot = s as FeedSnapshot<unknown>
}

export function readFeedSnapshot<D>(): FeedSnapshot<D> | null {
  return snapshot as FeedSnapshot<D> | null
}

export function clearFeedSnapshot(): void {
  snapshot = null
}

// Only patches a snapshot that exists (the position while scrolling).
export function updateFeedSnapshot<D>(patch: Partial<FeedSnapshot<D>>): void {
  if (snapshot) snapshot = { ...snapshot, ...(patch as Partial<FeedSnapshot<unknown>>) }
}

// The card the buyer is looking at: the first one whose bottom edge is below
// `offset` px from the top of the viewport (cards scrolled past don't count).
// `cards` are in grid order with viewport-relative tops/bottoms.
export function pickAnchor(
  cards: { key: string; top: number; bottom: number }[],
  offset = 0,
): FeedAnchor | null {
  for (const c of cards) {
    if (c.bottom > offset) return { key: c.key, top: c.top }
  }
  return null
}

// How far to scroll so the anchor card's top is back where it was.
// `nowTop` is its current viewport-relative top.
export function scrollDeltaFor(anchor: FeedAnchor, nowTop: number): number {
  return nowTop - anchor.top
}

// The restored feed is refreshed in the background once it is this old —
// the same 30 s rule the feed uses when the tab comes back into view.
export const FEED_SNAPSHOT_FRESH_MS = 30_000

export function snapshotIsStale(fetchedAt: number, now: number, maxAge = FEED_SNAPSHOT_FRESH_MS): boolean {
  return !(now - fetchedAt < maxAge)
}

// The "what am I looking at" key. Drawn cards go back to the first batch only
// when this changes — not on a remount that restores the same view.
export function feedViewKey(v: {
  search: string; method: string; category: string; farmerFilter: string
  distanceFilter: string; sortBy: string; consumerLat: number | null; consumerLng: number | null
}): string {
  return JSON.stringify([v.search, v.method, v.category, v.farmerFilter, v.distanceFilter, v.sortBy, v.consumerLat, v.consumerLng])
}

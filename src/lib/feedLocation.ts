import type { Reachability } from '@/lib/retailReach'

/* The buyer feed's location filter (client 2026-11-13): Local · Far Away · All,
 * replacing "Delivers to me" / 5 / 10 / 25 km.
 *
 *   local — the buyer is inside the farmer's local radius (the radius set on
 *           the produce, 25 km when not set): pick up or get it delivered nearby
 *   far   — beyond that radius, but the farmer still sends it (cargo anywhere
 *           in India, or the older AP / TG transport)
 *   all   — no location filter, nothing hidden
 *
 * Without a buyer location neither Local nor Far Away can be decided, so the
 * feed shows everything (reach kind 'unknown') and the page asks for a location.
 * Pure — the feed and the tests use it. */

export type FeedLocationFilter = 'local' | 'far' | 'all'
export const FEED_LOCATION_FILTERS: FeedLocationFilter[] = ['local', 'far', 'all']
export const DEFAULT_FEED_LOCATION_FILTER: FeedLocationFilter = 'local'

export const FEED_LOCATION_LABELS: Record<FeedLocationFilter, { en: string; te: string }> = {
  local: { en: 'Local', te: 'స్థానిక' },
  far: { en: 'Far Away', te: 'దూరం' },
  all: { en: 'All', te: 'అన్నీ' },
}

/** Does a card with this reach stay in the feed under this filter? */
export function passesLocationFilter(reach: Pick<Reachability, 'kind'>, filter: FeedLocationFilter): boolean {
  if (filter === 'all' || reach.kind === 'unknown') return true
  if (filter === 'local') return reach.kind === 'local'
  return reach.kind === 'transport'
}

/* The buyer's choice sticks until they close the app (client 2026-11-13):
 * kept in sessionStorage, which the browser clears when the tab / installed
 * app is closed — so a fresh open starts on Local again. Storage can be
 * blocked (private mode, previews), so every read and write is guarded. */
export const FEED_LOCATION_STORAGE_KEY = 'yff_feed_location_filter'

/** A stored value (or junk / nothing) → a valid filter; anything else is the default. */
export function parseFeedLocationFilter(raw: unknown): FeedLocationFilter {
  return raw === 'local' || raw === 'far' || raw === 'all' ? raw : DEFAULT_FEED_LOCATION_FILTER
}

export function loadFeedLocationFilter(storage: Pick<Storage, 'getItem'> | null | undefined): FeedLocationFilter {
  try {
    return parseFeedLocationFilter(storage?.getItem(FEED_LOCATION_STORAGE_KEY))
  } catch {
    return DEFAULT_FEED_LOCATION_FILTER
  }
}

export function saveFeedLocationFilter(storage: Pick<Storage, 'setItem'> | null | undefined, f: FeedLocationFilter): void {
  try {
    storage?.setItem(FEED_LOCATION_STORAGE_KEY, f)
  } catch {
    /* storage blocked — the choice just lasts for this page */
  }
}

/** The browser's sessionStorage, or null where it is missing or blocked (the getter itself can throw). */
export function sessionStore(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

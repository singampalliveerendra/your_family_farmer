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

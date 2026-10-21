// Incremental rendering for the consumer home grid. The whole feed is still
// fetched in one request (sort, distance, search and the per-harvest split all
// run client-side over the full list), but only FEED_PAGE_SIZE cards are drawn
// at first and the next batch is added as the buyer scrolls towards the end.

export const FEED_PAGE_SIZE = 15

// How far below the viewport the "load more" sentinel starts firing. Large on
// purpose: the next batch is drawn while the buyer is still ~2 screens away, so
// on a slow phone the new cards are already there when they scroll to them.
export const FEED_PREFETCH_MARGIN = '0px 0px 1200px 0px'

// Cards drawn after one more batch, never past the end of the list.
export function nextVisibleCount(current: number, total: number, step = FEED_PAGE_SIZE): number {
  return Math.min(total, Math.max(0, current) + step)
}

// The cover photo of each card in the NEXT batch (the one not yet drawn).
// Warmed into the browser cache in idle time so those cards show their image
// immediately instead of popping in. Only the cover: the rest of a card's swipe
// gallery is off-screen until swiped. images.unoptimized means <Image> requests
// exactly this URL, so the warm copy is a cache hit.
export function nextBatchCoverUrls(
  items: { image_urls?: string[] | null; image_url?: string | null }[],
  visible: number,
  step = FEED_PAGE_SIZE,
): string[] {
  const urls = new Set<string>()
  for (const it of items.slice(visible, visible + step)) {
    const cover = it.image_urls?.length ? it.image_urls[0] : it.image_url
    if (cover) urls.add(cover)
  }
  return [...urls]
}

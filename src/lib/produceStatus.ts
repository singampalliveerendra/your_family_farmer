// Which produce statuses a buyer may SEE, and which count as sold out.
//
// A listing whose stock hits 0 is auto-flipped to 'sold_out' by
// /api/farmer/update-listing. We used to filter every consumer query down to
// 'available', so the moment a farmer sold out of something the produce
// disappeared from the feed, their profile, search and the region page — the
// farmer's public catalogue silently shrank and buyers had no way to know the
// crop even existed. Show it instead, greyed out with a disabled CTA, so the
// buyer can see what this farmer grows and come back for it.
//
// Seeing is not buying: 'paused', 'suspended', 'rejected' and 'coming_soon'
// stay out of these queries, and /api/orders/place still rejects anything the
// farmer or a moderator has taken down.
export const CONSUMER_VISIBLE_STATUSES = ['available', 'sold_out'] as const

// Statuses a stale cart line may still be checked out under. 'sold_out' is a
// stock state, not a takedown — the stock RPC is the authority on quantity, and
// a harvest carries its own stock independent of the template's.
export const ORDERABLE_STATUSES: readonly string[] = CONSUMER_VISIBLE_STATUSES

/**
 * Is this produce template out of stock?
 *
 * Both signals matter: `status` is what the auto-flip writes, `stock_qty` is
 * the live number, and older rows can carry one without the other.
 *
 * Note this is about the TEMPLATE. A harvest carries its own stock_qty, so a
 * harvest card must judge itself by that number — a farmer can be out of the
 * template's loose stock while a freshly logged harvest still has kilos left.
 */
export function isSoldOutListing(item: {
  status?: string | null
  stock_qty?: number | null
}): boolean {
  if (item.status === 'sold_out') return true
  return item.stock_qty != null && item.stock_qty <= 0
}

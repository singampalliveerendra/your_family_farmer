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

/**
 * Is this produce sold out, once its logged harvests are taken into account?
 *
 * An order placed against a harvest decrements THAT row, never the template's,
 * so a listing happily sits at `stock_qty: 10, status: 'available'` long after
 * its last kilo went. Wherever a produce is shown as one row rather than one
 * card per pick, the template's number is therefore the wrong thing to read:
 * a farmer would zero a harvest and the buyer would still be offered "10 kg
 * left". Whenever a produce has unpaused harvests, they are the authority on
 * whether anything is left; the template's own number only speaks for a produce
 * with no logged pick at all.
 *
 * A harvest's `stock_qty: null` means quantity not tracked, not zero — such a
 * pick keeps the produce buyable.
 */
export function isSoldOutWithHarvests(
  item: { status?: string | null; stock_qty?: number | null },
  harvests: ReadonlyArray<{ stock_qty?: number | null }>,
): boolean {
  if (!harvests.length) return isSoldOutListing(item)
  return harvests.every((h) => h.stock_qty != null && h.stock_qty <= 0)
}

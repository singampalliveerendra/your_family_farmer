/**
 * Cart-line identity and the wholesale quantity rule, kept out of
 * src/components/consumer/Cart.tsx so they can be unit-tested.
 *
 * The cart is keyed per harvest (two harvests of one produce are two lines;
 * legacy produce-card lines key by listingId). A wholesale line gets its own
 * key, so it never merges with the retail line of the same harvest — the two
 * are priced, stepped and fulfilled differently.
 */

import { snapWholesaleQty, wholesaleCartKey, wholesaleQtyRules, type WholesaleLine } from '@/lib/wholesaleOrder'

export type CartLineIdentity = { listingId: string; harvestId?: string; wholesale?: WholesaleLine }

export const cartKeyOf = (item: CartLineIdentity): string =>
  item.wholesale ? wholesaleCartKey(item.harvestId ?? item.listingId) : (item.harvestId ?? item.listingId)

/** A wholesale line's quantity grid (minimum + pack/step). */
export const wsRules = (it: { wholesale?: WholesaleLine; saleStep?: number; unit?: string }) =>
  wholesaleQtyRules(it.wholesale!, it.saleStep, it.unit)

/**
 * The quantity a wholesale line ends up with after "add" (existing + added,
 * the minimum by default) — 0 means it can't be added (stock below minimum).
 */
export function wholesaleAddQty(
  it: { wholesale: WholesaleLine; saleStep?: number; unit?: string; stockQty?: number },
  existingQty: number | undefined,
  added?: number,
): number {
  const rules = wsRules(it)
  return snapWholesaleQty((existingQty ?? 0) + (added ?? rules.min), rules, it.stockQty ?? null)
}

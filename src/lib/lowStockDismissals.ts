/**
 * Dismissing the farmer's "Wholesale hidden" low-stock alert.
 *
 * A farmer may be happy to leave a produce as it is (wholesale hidden, the
 * stock sold off over time), so the home-screen card can be dismissed. The
 * dismissal is remembered per produce together with the wholesale minimum it
 * was dismissed at, and it stays dismissed while the stock remains low — sales
 * that lower the stock further do not bring it back.
 *
 * The card comes back when the situation is new:
 *  - the farmer changes the wholesale minimum, or
 *  - the stock recovers above the minimum (the dismissal is forgotten) and later
 *    drops below it again.
 *
 * Stored in the browser (per device) — no database change needed.
 */

/** listingId → wholesale minimum the alert was dismissed at. */
export type LowStockDismissals = Record<string, number>

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const dismissalsStorageKey = (farmerId: string) => `yff_lowstock_dismissed_${farmerId}`

/** Reads saved dismissals; anything corrupt or unreadable counts as none. */
export function readDismissals(storage: KeyValueStorage | null | undefined, farmerId: string): LowStockDismissals {
  try {
    const raw = storage?.getItem(dismissalsStorageKey(farmerId))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: LowStockDismissals = {}
    for (const [id, min] of Object.entries(parsed)) {
      if (typeof min === 'number' && Number.isFinite(min)) out[id] = min
    }
    return out
  } catch {
    return {}
  }
}

/** Saves dismissals; failures (private mode, storage full) are ignored — the alert just shows again. */
export function writeDismissals(
  storage: KeyValueStorage | null | undefined,
  farmerId: string,
  dismissals: LowStockDismissals,
): void {
  try {
    const key = dismissalsStorageKey(farmerId)
    if (Object.keys(dismissals).length === 0) storage?.removeItem(key)
    else storage?.setItem(key, JSON.stringify(dismissals))
  } catch {
    // Not worth bothering the farmer about.
  }
}

/** Remembers that the alert for this produce was dismissed at this minimum. */
export function dismiss(dismissals: LowStockDismissals, listingId: string, minQty: number): LowStockDismissals {
  return { ...dismissals, [listingId]: minQty }
}

/** Is the alert for this produce dismissed at its current minimum? */
export function isDismissed(dismissals: LowStockDismissals, listingId: string, minQty: number): boolean {
  return dismissals[listingId] === minQty
}

/**
 * Forgets dismissals for produce that is no longer low on stock (or no longer
 * wholesale), so a later drop below the minimum alerts the farmer again.
 * Returns the same object when nothing changed.
 */
export function pruneDismissals(dismissals: LowStockDismissals, lowListingIds: Iterable<string>): LowStockDismissals {
  const low = new Set(lowListingIds)
  const kept = Object.entries(dismissals).filter(([id]) => low.has(id))
  return kept.length === Object.keys(dismissals).length ? dismissals : Object.fromEntries(kept)
}

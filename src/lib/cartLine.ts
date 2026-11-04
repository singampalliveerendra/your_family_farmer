/**
 * Cart clean-up kept out of src/components/consumer/Cart.tsx so it can be
 * unit-tested.
 *
 * Staging briefly had a "Buy wholesale" toggle for household buyers
 * (2026-11-03). Bulk is now for subscribed aggregators only (2026-11-04), so a
 * bulk line saved in a buyer's cart back then is dropped when the cart is read:
 * the buyer never sees it at checkout and the server would refuse it anyway.
 * Those lines were keyed `<harvest or produce id>:wholesale` and carried a
 * `wholesale` object.
 */

export function withoutBulkLines<T extends object>(cart: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [key, line] of Object.entries(cart ?? {})) {
    if (!line || typeof line !== 'object') continue
    if (key.endsWith(':wholesale') || 'wholesale' in line) continue
    out[key] = line
  }
  return out
}

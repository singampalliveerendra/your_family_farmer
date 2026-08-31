import { verifyGuestOrderToken } from '@/lib/guest-order-token'

/**
 * Authorises a guest to act on `orderIds`, accepting either shape of proof.
 *
 * A guest has no account and no session cookie: their only proof is the
 * short-lived token /api/orders/place hands back, bound to exactly the ids that
 * placement created.
 *
 * `singleToken` is the original form and covers the common case — one farmer,
 * one placement, one token.
 *
 * `batches` exists because a multi-farmer checkout calls /api/orders/place once
 * per farmer, so it ends up holding several tokens, each covering only its own
 * farmer's ids. No single token can cover the combined batch that Razorpay is
 * then asked to charge. We verify each token against the ids it claims and
 * require the union to be EXACTLY `orderIds` — no gaps (an id nobody proved)
 * and no extras (an id from some other checkout smuggled in).
 */
export function authorizeGuestBatches(
  orderIds: string[],
  singleToken: unknown,
  batches: unknown,
): boolean {
  if (orderIds.length === 0) return false

  // One token covering the whole batch.
  if (typeof singleToken === 'string' && verifyGuestOrderToken(singleToken, orderIds)) {
    return true
  }

  if (!Array.isArray(batches) || batches.length === 0) return false
  if (batches.length > 20) return false

  const proven = new Set<string>()
  for (const entry of batches) {
    if (!entry || typeof entry !== 'object') return false
    const { orderIds: ids, token } = entry as { orderIds?: unknown; token?: unknown }
    if (!Array.isArray(ids) || ids.length === 0) return false
    if (typeof token !== 'string') return false
    const batchIds = ids.map((v) => String(v))
    // Each token must be valid for its own id set. A token proves nothing about
    // ids it was not issued for, so this is checked per batch, never in bulk.
    if (!verifyGuestOrderToken(token, batchIds)) return false
    for (const id of batchIds) proven.add(id.toLowerCase())
  }

  const wanted = new Set(orderIds.map((id) => id.toLowerCase()))
  if (proven.size !== wanted.size) return false
  for (const id of wanted) if (!proven.has(id)) return false
  return true
}

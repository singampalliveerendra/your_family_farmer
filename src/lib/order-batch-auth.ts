import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { verifyGuestOrderToken } from '@/lib/guest-order-token'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type BatchAuthResult =
  | { ok: true; orderIds: string[] }
  | { ok: false; error: string; status: number }

/**
 * Authorises a caller to act on a specific batch of order ids — the shared
 * check behind the checkout's post-payment routes.
 *
 * Two callers are legitimate and they authenticate differently:
 *   - a signed-in buyer, via the consumer session cookie; every row must carry
 *     their consumer_id.
 *   - a guest, who has no account at all, via the short-lived guestToken minted
 *     by /api/orders/place and bound to exactly these order ids. Every row must
 *     be a guest row (consumer_id IS NULL).
 *
 * This mirrors what /api/orders/razorpay/create and /verify already do; it is
 * factored out here because the UPI-claim and switch-to-COD routes need the
 * identical check, and a checkout authorisation rule that exists in four
 * slightly different copies is one edit away from diverging.
 */
export async function authorizeOrderBatch(
  req: NextRequest,
  supabase: SupabaseClient,
  rawOrderIds: unknown,
  guestToken: unknown,
): Promise<BatchAuthResult> {
  if (!Array.isArray(rawOrderIds) || rawOrderIds.length === 0) {
    return { ok: false, error: 'No orders given.', status: 400 }
  }
  if (rawOrderIds.length > 50) {
    return { ok: false, error: 'Too many orders.', status: 400 }
  }
  const orderIds = rawOrderIds.map((v) => String(v))
  if (!orderIds.every((v) => UUID_RE.test(v))) {
    return { ok: false, error: 'Invalid order id.', status: 400 }
  }

  const { data: rows, error } = await supabase
    .from('orders')
    .select('id, consumer_id')
    .in('id', orderIds)

  if (error) {
    console.error('[YFF order-batch-auth] load failed:', error.message)
    return { ok: false, error: 'Could not load the orders.', status: 500 }
  }
  // Every id must resolve. A partial match means the caller mixed in an id that
  // isn't theirs (or doesn't exist), and we must not act on the rest.
  if (!rows || rows.length !== orderIds.length) {
    return { ok: false, error: 'Order not found.', status: 404 }
  }

  const session = getConsumerSessionFromRequest(req)
  if (session) {
    if (rows.some((r) => r.consumer_id !== session.consumerId)) {
      return { ok: false, error: 'Not your order.', status: 403 }
    }
    return { ok: true, orderIds }
  }

  if (rows.some((r) => r.consumer_id !== null)) {
    return { ok: false, error: 'Not your order.', status: 403 }
  }
  if (!verifyGuestOrderToken(typeof guestToken === 'string' ? guestToken : null, orderIds)) {
    return { ok: false, error: 'Please log in.', status: 401 }
  }
  return { ok: true, orderIds }
}

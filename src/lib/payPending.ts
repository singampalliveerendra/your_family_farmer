/* "Pay Now" on an order whose online payment is still pending or failed
 * (client 2026-11-13). The buyer taps it on the order list or the order page,
 * the same Cashfree checkout opens, and the order shows Paid once Cashfree
 * confirms it (the existing /verify, webhook and reconcile cron record it).
 *
 * Decisions (user, 2026-11-13):
 *  - only orders that are still open (pending or confirmed). An order the app
 *    already cancelled because payment wasn't finished stays cancelled — its
 *    stock went back and someone else may have bought it;
 *  - one payment covers the whole checkout: an order placed with others (one
 *    Cashfree payment for several farmers) is paid together with the others
 *    that are still open and unpaid, as it was placed;
 *  - never charge twice: before a new Cashfree order is made, the old one is
 *    asked — paid → recorded, a payment still processing → wait, still open
 *    for the same amount → reused. See /api/consumer/orders/[id]/pay.
 *
 * Pure — the order card, the order page, the route and the tests use it. */

/** Payment states that can still be paid. Anything else has money in, or is being checked. */
const PAYABLE_PAYMENT_STATUSES = new Set(['pending', 'failed'])
/** Order states still open for payment. */
const PAYABLE_ORDER_STATUSES = new Set(['pending', 'approved'])

export type PayableOrder = {
  status?: string | null
  payment_method?: string | null
  payment_status?: string | null
}

/** Does this order get a Pay Now button? Online (Cashfree) orders only, still open, not paid. */
export function canPayNow(o: PayableOrder | null | undefined): boolean {
  if (!o) return false
  if (o.payment_method !== 'cashfree') return false
  if (!PAYABLE_ORDER_STATUSES.has(o.status ?? '')) return false
  return o.payment_status == null || PAYABLE_PAYMENT_STATUSES.has(o.payment_status)
}

export type BatchRow = PayableOrder & {
  id: string
  consumer_id?: string | null
  checkout_id?: string | null
  cashfree_order_id?: string | null
}

/**
 * The rows one Pay Now charges: the tapped order plus the others from the same
 * checkout (same checkout_id, else same Cashfree order) that belong to the
 * same buyer and are still payable. Empty when the tapped order itself can't
 * be paid.
 */
export function payBatchOf<R extends BatchRow>(target: R, rows: readonly R[]): R[] {
  if (!canPayNow(target)) return []
  const sameCheckout = (r: R) =>
    r.id === target.id
    || (!!target.checkout_id && r.checkout_id === target.checkout_id)
    || (!target.checkout_id && !!target.cashfree_order_id && r.cashfree_order_id === target.cashfree_order_id)
  const batch = rows.filter((r) => sameCheckout(r) && r.consumer_id === target.consumer_id && canPayNow(r))
  return batch.some((r) => r.id === target.id) ? batch : [target, ...batch]
}

/** What the buyer pays for these rows: produce + platform fee + delivery charge, in rupees (to the paisa). */
export function payBatchTotal(rows: ReadonlyArray<{ total_price?: number | string | null; platform_fee?: number | string | null; delivery_fee?: number | string | null }>): number {
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  const sum = rows.reduce((s, r) => s + n(r.total_price) + n(r.platform_fee) + n(r.delivery_fee), 0)
  return Math.round(sum * 100) / 100
}

/** What Cashfree says about the order's earlier payment attempt (src/lib/cashfree.ts Settlement). */
export type EarlierPayment =
  | { paid: true }
  | { paid: false; orderStatus: string; inFlight: boolean }

/**
 * What to do with an earlier Cashfree order before taking a new payment:
 *  paid       — it was paid after all: record it, charge nothing
 *  processing — a payment is still being confirmed by the bank: wait, no new one
 *  reuse      — still open for exactly this amount: open the same checkout again
 *  close      — still open but for a different amount / batch: terminate it first
 *  new        — expired / terminated / failed: safe to start a new payment
 */
export function earlierPaymentStep(s: EarlierPayment, sameAmountAndBatch: boolean): 'paid' | 'processing' | 'reuse' | 'close' | 'new' {
  if (s.paid) return 'paid'
  if (s.inFlight) return 'processing'
  if (s.orderStatus === 'ACTIVE') return sameAmountAndBatch ? 'reuse' : 'close'
  // A termination still going through can't be paid any more, but wait for it.
  if (s.orderStatus === 'TERMINATION_REQUESTED') return 'processing'
  return 'new'
}

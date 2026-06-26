// Single source of truth for "is this order's money in?".
//
// Historically two different sentinels mean the same thing:
//   - 'paid'      — written by the Razorpay flows (verify / webhook / reconcile cron)
//   - 'completed' — written when a farmer manually confirms a COD / UPI payment
// Both mean the order is fully paid. Treating only one of them as paid was the
// cause of farmer screens showing "Pending" on orders that consumers already
// saw as "✓ Paid". Always go through these helpers instead of inline checks.

const PAID_STATUSES = new Set(['paid', 'completed'])

// The buyer has claimed to have paid (UPI) but it isn't confirmed yet — needs
// the farmer to verify before it counts as paid.
const CLAIMED_STATUSES = new Set(['payment_claimed', 'pending_confirmation'])

export function isOrderPaid(paymentStatus: string | null | undefined): boolean {
  return !!paymentStatus && PAID_STATUSES.has(paymentStatus)
}

export function isPaymentClaimed(paymentStatus: string | null | undefined): boolean {
  return !!paymentStatus && CLAIMED_STATUSES.has(paymentStatus)
}

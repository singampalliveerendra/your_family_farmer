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

// Part-paid COD: the deposit is in, the cash balance is still owed at handover.
// This is a THIRD state — neither paid nor unpaid — and it is deliberately not
// in PAID_STATUSES. Counting it as paid would tell the farmer the money is in
// while the buyer still owes most of it; counting it as unpaid would hide the
// deposit we actually took. Ask isOrderPaid() / isDepositPaid(), never compare
// the raw string.
const DEPOSIT_STATUS = 'deposit_paid'

export function isOrderPaid(paymentStatus: string | null | undefined): boolean {
  return !!paymentStatus && PAID_STATUSES.has(paymentStatus)
}

export function isPaymentClaimed(paymentStatus: string | null | undefined): boolean {
  return !!paymentStatus && CLAIMED_STATUSES.has(paymentStatus)
}

// Deposit taken, cash balance still outstanding.
export function isDepositPaid(paymentStatus: string | null | undefined): boolean {
  return paymentStatus === DEPOSIT_STATUS
}

// Some money is in, whether or not all of it is. Use this for "has the buyer
// actually committed?" — e.g. whether to restock on cancel, or whether there is
// anything to refund at all.
export function hasMoneyIn(paymentStatus: string | null | undefined): boolean {
  return isOrderPaid(paymentStatus) || isDepositPaid(paymentStatus)
}

// Rupees still owed in cash at the door. 0 once collected, or on any order that
// was fully prepaid.
export function cashDue(order: {
  payment_status?: string | null
  cod_balance_due?: number | null
}): number {
  if (!isDepositPaid(order.payment_status)) return 0
  const due = Number(order.cod_balance_due)
  return Number.isFinite(due) && due > 0 ? due : 0
}

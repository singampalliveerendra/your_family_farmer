// Single source of truth for "is this order's money in?".
//
// Historically two different sentinels mean the same thing:
//   - 'paid'      — written by the gateway flows (verify / webhook / reconcile cron)
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

// Paid through the online gateway. 'cashfree' is the live gateway; 'razorpay'
// rows are orders paid before the switch (2026-09-18) and still display as
// online payments. Legacy 'upi' is NOT in here — callers that want it add it.
export function isGatewayMethod(method: string | null | undefined): boolean {
  return method === 'cashfree' || method === 'razorpay'
}

/* ── The payment badge on a farmer's order card ──
 * Orders can be placed without paying first, so the farmer must see at a glance
 * which ones have no money in yet — without opening each order. Every order
 * gets exactly one badge, and anything not paid says "Payment pending" in red,
 * whatever the method. Before this, cash orders only said "COD" and an unpaid
 * online order showed no payment badge at all. */

export type PaymentBadgeTone = 'paid' | 'deposit' | 'verify' | 'failed' | 'pending'

export type PaymentBadge = {
  tone: PaymentBadgeTone
  en: string
  te: string
}

export function farmerPaymentBadge(order: {
  payment_method?: string | null
  payment_status?: string | null
  cod_balance_due?: number | null
}): PaymentBadge {
  const status = order.payment_status
  if (isOrderPaid(status)) return { tone: 'paid', en: '✓ Paid', te: '✓ చెల్లించారు' }
  if (isDepositPaid(status)) {
    const due = cashDue(order)
    return due > 0
      ? { tone: 'deposit', en: `🔒 Deposit paid · ₹${due} due`, te: `🔒 డిపాజిట్ చెల్లించారు · ₹${due} బాకీ` }
      : { tone: 'deposit', en: '🔒 Deposit paid', te: '🔒 డిపాజిట్ చెల్లించారు' }
  }
  if (isPaymentClaimed(status)) return { tone: 'verify', en: '⏳ Buyer says paid — verify', te: '⏳ చెల్లించామన్నారు — చూడండి' }
  if (status === 'failed') return { tone: 'failed', en: '⚠️ Payment failed', te: '⚠️ చెల్లింపు విఫలమైంది' }

  // Not paid. Say how the money is expected, so "pending" on a cash order
  // doesn't read like a problem the farmer must chase today.
  const method = order.payment_method
  const how = isGatewayMethod(method)
    ? { en: 'Online', te: 'ఆన్‌లైన్' }
    : method === 'upi'
      ? { en: 'UPI', te: 'UPI' }
      : { en: 'Cash', te: 'నగదు' }
  return { tone: 'pending', en: `⏳ Payment pending · ${how.en}`, te: `⏳ చెల్లింపు బాకీ · ${how.te}` }
}

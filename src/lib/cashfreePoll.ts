// What the browser does after the Cashfree checkout closes and /verify says
// "not paid yet". Kept pure so it can be tested.
//
// Why it exists: with a UPI app (PhonePe, GPay…) the checkout can close the
// moment the phone switches apps, BEFORE the bank confirms. Asking once and
// abandoning on "not paid" cancelled YFF-20261029-0383 while its ₹135 went
// through. So:
//   - a payment attempt still PENDING at Cashfree → keep asking, for up to
//     IN_FLIGHT_WAIT_MS; if it is still pending after that, give up asking but
//     do NOT abandon — the webhook / reconcile cron settles it.
//   - Cashfree order still ACTIVE with no attempt → wait a short grace period
//     (the attempt may not be registered yet), then abandon. Abandon itself
//     terminates the Cashfree order and re-checks before cancelling anything.
//   - anything else (EXPIRED, TERMINATED…) → abandon now.

export const POLL_INTERVAL_MS = 3_000
export const ACTIVE_GRACE_MS = 9_000
export const IN_FLIGHT_WAIT_MS = 120_000

export type VerifyPending = { inFlight: boolean; orderStatus: string | null }

export type PollStep = 'wait' | 'unpaid' | 'processing'

export function nextPollStep(v: VerifyPending, elapsedMs: number): PollStep {
  if (v.inFlight) return elapsedMs < IN_FLIGHT_WAIT_MS ? 'wait' : 'processing'
  if (v.orderStatus === 'ACTIVE' && elapsedMs < ACTIVE_GRACE_MS) return 'wait'
  return 'unpaid'
}

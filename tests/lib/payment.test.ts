import { describe, it, expect } from 'vitest'
import { isOrderPaid, isPaymentClaimed, isDepositPaid, hasMoneyIn, cashDue } from '@/lib/payment'

// "Is this order's money in?" is asked on the farmer's card, the consumer's
// timeline, the moderator's payout sheet and every refund path. Two different
// strings have always meant paid ('paid' from Razorpay, 'completed' from a
// farmer confirming cash/UPI by hand), which is exactly how a consumer once saw
// "Paid" on an order the farmer's screen still called "Pending". These helpers
// are the single place that decides; the tests pin the vocabulary down so a new
// status string can never quietly re-open that split.

describe('isOrderPaid', () => {
  // USE: proves the two historic sentinels are treated as one. If someone
  // "tidies up" by dropping 'completed', every COD/UPI order a farmer confirmed
  // by hand instantly reads as unpaid — the farmer chases money already
  // received and the payout report under-counts.
  it('treats both paid and completed as fully paid', () => {
    expect(isOrderPaid('paid')).toBe(true)
    expect(isOrderPaid('completed')).toBe(true)
  })

  // USE: nothing else counts. 'payment_claimed' is a buyer's word, not a
  // confirmation; letting it through would release produce against a UPI
  // payment nobody has checked.
  it('rejects every other status, including a claim the farmer has not verified', () => {
    expect(isOrderPaid('pending')).toBe(false)
    expect(isOrderPaid('payment_claimed')).toBe(false)
    expect(isOrderPaid('pending_confirmation')).toBe(false)
    expect(isOrderPaid('failed')).toBe(false)
    expect(isOrderPaid('deposit_paid')).toBe(false)
  })

  // USE: an order row written before the column existed, or a failed write,
  // arrives as null/undefined. It must read as unpaid, never crash.
  it('handles a missing status as unpaid', () => {
    expect(isOrderPaid(null)).toBe(false)
    expect(isOrderPaid(undefined)).toBe(false)
    expect(isOrderPaid('')).toBe(false)
  })
})

describe('isPaymentClaimed', () => {
  // USE: the buyer has typed a UTR and said "I've paid". This is the state the
  // farmer's "Verify payment" button exists for. It must be distinguishable
  // from paid, or the button never appears and the money is never checked.
  it('recognises a buyer claim that still needs the farmer to verify it', () => {
    expect(isPaymentClaimed('payment_claimed')).toBe(true)
    expect(isPaymentClaimed('pending_confirmation')).toBe(true)
    expect(isPaymentClaimed('paid')).toBe(false)
    expect(isPaymentClaimed(null)).toBe(false)
  })
})

describe('isDepositPaid', () => {
  // USE: part-paid COD is a THIRD state — the online deposit is in, the cash
  // balance is not. Counting it as paid tells the farmer money is in that
  // isn't; counting it as unpaid hides a deposit we actually took and would
  // skip the refund on a cancel. This test keeps it distinct from both.
  it('is its own state, neither paid nor unpaid', () => {
    expect(isDepositPaid('deposit_paid')).toBe(true)
    expect(isOrderPaid('deposit_paid')).toBe(false)
    expect(isPaymentClaimed('deposit_paid')).toBe(false)
  })
})

describe('hasMoneyIn', () => {
  // USE: the question every refund and restock path asks — "did the buyer
  // actually part with money?". It must say yes for a part-paid COD deposit,
  // otherwise cancelling such an order silently keeps the deposit.
  it('is true whenever any money has been taken, in full or as a deposit', () => {
    expect(hasMoneyIn('paid')).toBe(true)
    expect(hasMoneyIn('completed')).toBe(true)
    expect(hasMoneyIn('deposit_paid')).toBe(true)
  })

  // USE: no money in means there is nothing to refund. A false positive here
  // would fire a Razorpay refund against a payment id that never existed.
  it('is false when nothing has been collected yet', () => {
    expect(hasMoneyIn('pending')).toBe(false)
    expect(hasMoneyIn('payment_claimed')).toBe(false)
    expect(hasMoneyIn(null)).toBe(false)
  })
})

describe('cashDue', () => {
  // USE: this is the number the farmer reads off the screen and asks for at the
  // door. It has to be the balance, never the whole total.
  it('returns the outstanding cash on a part-paid COD order', () => {
    expect(cashDue({ payment_status: 'deposit_paid', cod_balance_due: 380 })).toBe(380)
  })

  // USE: a fully prepaid order must show zero, or the farmer collects the money
  // twice. This is the single most expensive mistake this helper can make.
  it('is 0 on a fully prepaid order, so nothing is collected twice', () => {
    expect(cashDue({ payment_status: 'paid', cod_balance_due: 380 })).toBe(0)
    expect(cashDue({ payment_status: 'completed', cod_balance_due: 380 })).toBe(0)
  })

  // USE: an unpaid order has no deposit and therefore no "balance" — the whole
  // amount is still due through the normal payment flow, not as a doorstep
  // collection. Showing a cash figure here would invite the farmer to hand over
  // produce for cash on an order that was never committed to.
  it('is 0 when no deposit was taken at all', () => {
    expect(cashDue({ payment_status: 'pending', cod_balance_due: 380 })).toBe(0)
    expect(cashDue({ payment_status: null, cod_balance_due: 380 })).toBe(0)
  })

  // USE: a missing, zero, negative or non-numeric balance must read as 0, not
  // as "NaN" or "-₹50" on the farmer's screen.
  it('never shows a negative or nonsense amount to collect', () => {
    expect(cashDue({ payment_status: 'deposit_paid', cod_balance_due: null })).toBe(0)
    expect(cashDue({ payment_status: 'deposit_paid', cod_balance_due: 0 })).toBe(0)
    expect(cashDue({ payment_status: 'deposit_paid', cod_balance_due: -50 })).toBe(0)
    expect(cashDue({ payment_status: 'deposit_paid' })).toBe(0)
  })
})

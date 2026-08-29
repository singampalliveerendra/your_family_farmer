import { describe, it, expect } from 'vitest'
import {
  computeDeliveryTotal,
  resolveBatchDeliveryFee,
  planDeliveryRefund,
  DEFAULT_DELIVERY_BASE_FEE,
  DEFAULT_DELIVERY_EXTRA_FEE,
  type RefundOrderRow,
  type DeliveryCharges,
} from '@/lib/delivery-fee'

const CHARGES: DeliveryCharges = { base: 30, extra: 15 }

describe('computeDeliveryTotal', () => {
  it('charges base for the first farmer and extra for each additional one', () => {
    expect(computeDeliveryTotal(1, CHARGES)).toBe(30)
    expect(computeDeliveryTotal(2, CHARGES)).toBe(45)
    expect(computeDeliveryTotal(3, CHARGES)).toBe(60)
  })

  it('is 0 for an empty or nonsensical farmer count', () => {
    expect(computeDeliveryTotal(0, CHARGES)).toBe(0)
    expect(computeDeliveryTotal(-1, CHARGES)).toBe(0)
    expect(computeDeliveryTotal(NaN, CHARGES)).toBe(0)
    expect(computeDeliveryTotal(Infinity, CHARGES)).toBe(0)
  })

  it('rounds to whole rupees and never goes negative', () => {
    expect(computeDeliveryTotal(2, { base: 30.4, extra: 15.6 })).toBe(46)
    expect(computeDeliveryTotal(2, { base: -30, extra: -15 })).toBe(0)
  })

  it('ships with the launch defaults', () => {
    expect(DEFAULT_DELIVERY_BASE_FEE).toBe(30)
    expect(DEFAULT_DELIVERY_EXTRA_FEE).toBe(15)
  })
})

// The rule these tests exist to protect: the CLIENT'S flag may only turn the
// delivery charge ON. Before this was fixed, posting deliveryChargeApplies:false
// alongside home-delivery items bought free delivery.
describe('resolveBatchDeliveryFee', () => {
  const inputs = (over: Partial<Parameters<typeof resolveBatchDeliveryFee>[0]> = {}) =>
    resolveBatchDeliveryFee({
      charges: CHARGES,
      batchHomeDelivery: false,
      siblingHomeDelivery: false,
      siblingCount: 0,
      hasCheckoutId: false,
      clientChargeApplies: false,
      ...over,
    })

  it('charges nothing for a pure self-pickup checkout', () => {
    expect(inputs()).toBe(0)
  })

  it('charges the base on the opening batch of a home delivery', () => {
    expect(inputs({ batchHomeDelivery: true })).toBe(30)
  })

  it('charges the extra on every later batch of the same checkout', () => {
    expect(inputs({ batchHomeDelivery: true, hasCheckoutId: true, siblingCount: 1 })).toBe(15)
    expect(inputs({ batchHomeDelivery: true, hasCheckoutId: true, siblingCount: 2 })).toBe(15)
  })

  it('IGNORES a client claiming no delivery charge when our own rows say otherwise', () => {
    // The exact attack: home-delivery lines + deliveryChargeApplies:false.
    expect(inputs({ batchHomeDelivery: true, clientChargeApplies: false })).toBe(30)
    // And via a sibling batch, when THIS batch is all self-pickup.
    expect(
      inputs({ siblingHomeDelivery: true, hasCheckoutId: true, siblingCount: 1, clientChargeApplies: false }),
    ).toBe(15)
  })

  it('lets the client flag turn the charge ON — paying more is not an attack', () => {
    // The first batch of a multi-farmer cart cannot see the other farmers'
    // lines yet, so an honest client hint is the only signal available.
    expect(inputs({ clientChargeApplies: true })).toBe(30)
  })

  it('cannot be downgraded to the cheap "extra" rate without real siblings', () => {
    // The old bug: a forged deliveryFarmerIndex:1 on a single-farmer order
    // bought 15 instead of 30. There is no such input any more, and with no
    // checkout_id the batch is by definition the first.
    expect(inputs({ batchHomeDelivery: true, hasCheckoutId: false, siblingCount: 99 })).toBe(30)
  })

  it('stamps fees that sum to the whole-checkout formula', () => {
    // Three farmers, three POSTs. What they stamp must equal
    // computeDeliveryTotal(3) or the buyer is over- or under-charged.
    const stamped = [0, 1, 2].map((siblingCount) =>
      inputs({ batchHomeDelivery: true, hasCheckoutId: true, siblingCount }),
    )
    expect(stamped).toEqual([30, 15, 15])
    expect(stamped.reduce((a, b) => a + b, 0)).toBe(computeDeliveryTotal(3, CHARGES))
  })
})

// ── Refund planning ──────────────────────────────────────────────────────

let seq = 0
function row(over: Partial<RefundOrderRow> = {}): RefundOrderRow {
  seq += 1
  return {
    id: `o${seq}`,
    farmer_id: 'f1',
    status: 'confirmed',
    delivery_fee: 0,
    delivery_fee_refunded: 0,
    payment_status: 'paid',
    razorpay_payment_id: `pay_${seq}`,
    ...over,
  }
}

describe('planDeliveryRefund', () => {
  it('refunds one extra unit when a non-last farmer leaves', () => {
    const a = row({ id: 'a', farmer_id: 'f1', delivery_fee: 30 })
    const b = row({ id: 'b', farmer_id: 'f2', delivery_fee: 15 })
    const plan = planDeliveryRefund([a, b], 'b', CHARGES)
    expect(plan.owed).toBe(15)
    expect(plan.allocations).toEqual([
      { orderId: 'b', amount: 15, newRefundedTotal: 15, razorpayPaymentId: b.razorpay_payment_id, viaRazorpay: true },
    ])
  })

  it('refunds everything still held when the LAST farmer leaves', () => {
    const a = row({ id: 'a', farmer_id: 'f1', delivery_fee: 30 })
    const b = row({ id: 'b', farmer_id: 'f2', delivery_fee: 15, status: 'cancelled', delivery_fee_refunded: 15 })
    const plan = planDeliveryRefund([a, b], 'a', CHARGES)
    expect(plan.owed).toBe(30)
    expect(plan.allocations).toEqual([
      { orderId: 'a', amount: 30, newRefundedTotal: 30, razorpayPaymentId: a.razorpay_payment_id, viaRazorpay: true },
    ])
  })

  it('sweeps the residual base off an already-cancelled row when the last farmer leaves', () => {
    // Farmer 1 (who carried the 30 base) cancels first and gets back only the
    // 15 drop, leaving 15 of base still held on their row. When farmer 2 then
    // leaves, the buyer must end up with the full 45 back — including that
    // residual sitting on the already-cancelled order.
    const a = row({ id: 'a', farmer_id: 'f1', delivery_fee: 30 })
    const b = row({ id: 'b', farmer_id: 'f2', delivery_fee: 15 })

    const first = planDeliveryRefund([a, b], 'a', CHARGES)
    expect(first.owed).toBe(15)
    expect(first.allocations.map((x) => x.orderId)).toEqual(['a'])

    const aAfter = { ...a, status: 'cancelled', delivery_fee_refunded: 15 }
    const second = planDeliveryRefund([aAfter, b], 'b', CHARGES)
    expect(second.owed).toBe(30)
    expect(first.owed + second.owed).toBe(computeDeliveryTotal(2, CHARGES))
    expect(second.allocations.map((x) => [x.orderId, x.amount])).toEqual([['b', 15], ['a', 15]])
  })

  it('refunds nothing while the farmer still has another live order', () => {
    const a1 = row({ id: 'a1', farmer_id: 'f1', delivery_fee: 30 })
    const a2 = row({ id: 'a2', farmer_id: 'f1', delivery_fee: 0 })
    const b = row({ id: 'b', farmer_id: 'f2', delivery_fee: 15 })
    const plan = planDeliveryRefund([a1, a2, b], 'a2', CHARGES)
    expect(plan).toEqual({ owed: 0, allocations: [] })
  })

  it('never plans to give back money that was never captured', () => {
    const a = row({ id: 'a', farmer_id: 'f1', delivery_fee: 30, payment_status: 'pending', razorpay_payment_id: null })
    const b = row({ id: 'b', farmer_id: 'f2', delivery_fee: 15, payment_status: 'pending', razorpay_payment_id: null })
    expect(planDeliveryRefund([a, b], 'b', CHARGES)).toEqual({ owed: 0, allocations: [] })
  })

  it('pulls from a captured sibling when the cancelled row itself is unrefundable', () => {
    // "paid" with no payment id is not a capture we can refund against, but the
    // buyer still overpaid by one extra unit — so it comes off the row that did
    // capture. The refund follows the money, not the cancellation.
    const a = row({ id: 'a', farmer_id: 'f1', delivery_fee: 30 })
    const b = row({ id: 'b', farmer_id: 'f2', delivery_fee: 15, razorpay_payment_id: null })
    const plan = planDeliveryRefund([a, b], 'b', CHARGES)
    expect(plan.owed).toBe(15)
    expect(plan.allocations.map((x) => x.orderId)).toEqual(['a'])
  })

  it('flags a non-Razorpay capture for manual settlement instead of a gateway refund', () => {
    const a = row({ id: 'a', farmer_id: 'f1', delivery_fee: 30 })
    const b = row({
      id: 'b', farmer_id: 'f2', delivery_fee: 15,
      payment_status: 'completed', razorpay_payment_id: null,
    })
    const plan = planDeliveryRefund([a, b], 'b', CHARGES)
    expect(plan.owed).toBe(15)
    expect(plan.allocations[0].viaRazorpay).toBe(false)
    expect(plan.allocations[0].razorpayPaymentId).toBeNull()
  })

  it('refunds a deposit-paid COD order through Razorpay', () => {
    const a = row({ id: 'a', farmer_id: 'f1', delivery_fee: 30 })
    const b = row({ id: 'b', farmer_id: 'f2', delivery_fee: 15, payment_status: 'deposit_paid' })
    expect(planDeliveryRefund([a, b], 'b', CHARGES).allocations[0].viaRazorpay).toBe(true)
  })

  it('spills over to a sibling when the cancelled row alone cannot cover it', () => {
    // The extra was stamped on the cancelled row but already refunded, so the
    // 15 has to come off the sibling that still holds base.
    const a = row({ id: 'a', farmer_id: 'f1', delivery_fee: 30 })
    const b = row({ id: 'b', farmer_id: 'f2', delivery_fee: 15, delivery_fee_refunded: 15 })
    const plan = planDeliveryRefund([a, b], 'b', CHARGES)
    expect(plan.owed).toBe(15)
    expect(plan.allocations).toEqual([
      { orderId: 'a', amount: 15, newRefundedTotal: 15, razorpayPaymentId: a.razorpay_payment_id, viaRazorpay: true },
    ])
  })

  it('is a no-op when the cancelled order is not in the checkout', () => {
    const a = row({ id: 'a', delivery_fee: 30 })
    expect(planDeliveryRefund([a], 'nope', CHARGES)).toEqual({ owed: 0, allocations: [] })
    expect(planDeliveryRefund([], 'a', CHARGES)).toEqual({ owed: 0, allocations: [] })
  })

  it('never refunds more than was stamped, across a full three-farmer teardown', () => {
    let rows: RefundOrderRow[] = [
      row({ id: 'a', farmer_id: 'f1', delivery_fee: 30 }),
      row({ id: 'b', farmer_id: 'f2', delivery_fee: 15 }),
      row({ id: 'c', farmer_id: 'f3', delivery_fee: 15 }),
    ]
    let refunded = 0
    for (const id of ['b', 'c', 'a']) {
      const plan = planDeliveryRefund(rows, id, CHARGES)
      refunded += plan.owed
      const byId = new Map(plan.allocations.map((x) => [x.orderId, x.newRefundedTotal]))
      rows = rows.map((r) => ({
        ...r,
        delivery_fee_refunded: byId.get(r.id) ?? r.delivery_fee_refunded,
        status: r.id === id ? 'cancelled' : r.status,
      }))
    }
    // Everyone gone, so the buyer is made whole exactly once.
    expect(refunded).toBe(computeDeliveryTotal(3, CHARGES))
    expect(rows.every((r) => (r.delivery_fee_refunded ?? 0) <= (r.delivery_fee ?? 0))).toBe(true)
  })
})

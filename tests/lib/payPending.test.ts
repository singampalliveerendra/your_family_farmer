import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canPayNow, earlierPaymentStep, payBatchOf, payBatchTotal } from '@/lib/payPending'

// Client 2026-11-13: "Pay Now" on orders whose online payment is pending or
// failed, on the order list and the order page, with no double payment.

const order = (x: Record<string, unknown> = {}) => ({
  id: 'o1', consumer_id: 'c1', status: 'pending', payment_method: 'cashfree', payment_status: 'pending',
  checkout_id: null as string | null, cashfree_order_id: null as string | null,
  total_price: 100, platform_fee: 5, delivery_fee: 30, ...x,
})

describe('who gets Pay Now', () => {
  it('open online orders with payment pending or failed', () => {
    expect(canPayNow(order())).toBe(true)
    expect(canPayNow(order({ payment_status: 'failed' }))).toBe(true)
    expect(canPayNow(order({ payment_status: null }))).toBe(true)
    expect(canPayNow(order({ status: 'approved' }))).toBe(true)
  })
  it('never paid, being checked, cash, or closed orders', () => {
    for (const payment_status of ['paid', 'completed', 'deposit_paid', 'payment_claimed', 'pending_confirmation']) {
      expect(canPayNow(order({ payment_status }))).toBe(false)
    }
    expect(canPayNow(order({ payment_method: 'cod' }))).toBe(false)
    expect(canPayNow(order({ payment_method: 'razorpay' }))).toBe(false)
    // Already cancelled because payment wasn't finished: stays cancelled.
    expect(canPayNow(order({ status: 'cancelled' }))).toBe(false)
    expect(canPayNow(order({ status: 'declined' }))).toBe(false)
    expect(canPayNow(null)).toBe(false)
  })
})

describe('one payment covers the checkout', () => {
  it('the tapped order plus its still-open, unpaid siblings from the same checkout', () => {
    const a = order({ id: 'a', checkout_id: 'k1' })
    const b = order({ id: 'b', checkout_id: 'k1', payment_status: 'failed' })
    const cancelled = order({ id: 'c', checkout_id: 'k1', status: 'cancelled' })
    const otherCheckout = order({ id: 'd', checkout_id: 'k2' })
    const someoneElse = order({ id: 'e', checkout_id: 'k1', consumer_id: 'c2' })
    expect(payBatchOf(a, [a, b, cancelled, otherCheckout, someoneElse]).map((r) => r.id)).toEqual(['a', 'b'])
  })
  it('falls back to the Cashfree order when there is no checkout id', () => {
    const a = order({ id: 'a', cashfree_order_id: 'cf1' })
    const b = order({ id: 'b', cashfree_order_id: 'cf1' })
    expect(payBatchOf(a, [a, b]).map((r) => r.id)).toEqual(['a', 'b'])
  })
  it('a single order on its own; nothing when it cannot be paid', () => {
    expect(payBatchOf(order(), []).map((r) => r.id)).toEqual(['o1'])
    expect(payBatchOf(order({ payment_status: 'paid' }), [order({ payment_status: 'paid' })])).toEqual([])
  })
  it('total = produce + platform fee + delivery, to the paisa', () => {
    expect(payBatchTotal([order(), order({ total_price: '49.995', platform_fee: null, delivery_fee: 0 })])).toBe(185)
  })
})

describe('never pay twice', () => {
  it('asks about the earlier Cashfree order first', () => {
    expect(earlierPaymentStep({ paid: true }, false)).toBe('paid')
    expect(earlierPaymentStep({ paid: false, orderStatus: 'ACTIVE', inFlight: true }, true)).toBe('processing')
    expect(earlierPaymentStep({ paid: false, orderStatus: 'ACTIVE', inFlight: false }, true)).toBe('reuse')
    expect(earlierPaymentStep({ paid: false, orderStatus: 'ACTIVE', inFlight: false }, false)).toBe('close')
    expect(earlierPaymentStep({ paid: false, orderStatus: 'TERMINATION_REQUESTED', inFlight: false }, false)).toBe('processing')
    expect(earlierPaymentStep({ paid: false, orderStatus: 'EXPIRED', inFlight: false }, false)).toBe('new')
    expect(earlierPaymentStep({ paid: false, orderStatus: 'TERMINATED', inFlight: false }, true)).toBe('new')
  })
  it('the route: logged in, own orders, amount from the DB, compare-and-swap stamp', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/consumer/orders/[id]/pay/route.ts'), 'utf8')
    expect(route).toMatch(/if \(!session\) return fail\('Please log in\.', 401\)/)
    expect(route).toMatch(/target\.consumer_id !== session\.consumerId/)
    expect(route).toMatch(/payBatchTotal\(batch\)/)
    expect(route).toMatch(/q\.eq\('cashfree_order_id', old\)/)
    expect(route).toMatch(/stamped !== ids\.length[\s\S]{0,80}terminateCashfreeOrder\(cashfreeOrderId\)/)
    expect(route).not.toMatch(/body\.amount|amountRupees: body/)
  })
  it('the button is on the order list card and the order page', () => {
    for (const p of ['src/components/consumer/OrderCard.tsx', 'src/app/consumer/orders/[id]/page.tsx']) {
      const s = readFileSync(join(process.cwd(), p), 'utf8')
      expect(s).toMatch(/canPayNow\(order\) && \(/)
      expect(s).toMatch(/<PayNowButton orderId=\{order\.id\}/)
    }
  })
})

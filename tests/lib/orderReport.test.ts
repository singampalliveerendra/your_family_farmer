import { describe, it, expect } from 'vitest'
import type { FarmerOrder } from '@/components/farmer/OrderCard'
import {
  statusLabel,
  deliveryLabel,
  declineServiceFee,
  isPaidOrder,
  amountPaid,
  refundAmount,
  amountReceived,
  filterOrders,
  computeReportData,
  ordersInReportWindow,
  REPORT_WINDOW_DAYS,
} from '@/lib/orderReport'

// The farmer's downloadable orders report is the document they use to work out
// what they earned and to argue about it. Every number in it is a claim about
// money, so each is pinned here — a wrong figure is not a display bug, it is a
// farmer being told they earned something they did not.

const order = (o: Partial<FarmerOrder> = {}): FarmerOrder =>
  ({
    id: 'o1',
    farmer_id: 'f1',
    produce_listing_id: null,
    produce_name: 'Papaya',
    quantity: 2,
    unit: 'kg',
    total_price: 200,
    buyer_name: 'Ravi',
    buyer_phone: '9876543210',
    pickup_location: 'Bus stand',
    status: 'approved',
    payment_status: 'paid',
    decline_reason: null,
    created_at: new Date().toISOString(),
    ...o,
  }) as FarmerOrder

describe('statusLabel', () => {
  // USE: the chip in the report has to match the chip on the orders page, or
  // the farmer reconciles two documents that disagree about the same order.
  it('mirrors the farmer-facing status chips', () => {
    expect(statusLabel(order({ status: 'pending' }))).toBe('Pending')
    expect(statusLabel(order({ status: 'declined' }))).toBe('Declined')
    expect(statusLabel(order({ status: 'approved' }))).toBe('Approved')
  })

  // USE: "Completed" means the produce actually changed hands. A self-pickup is
  // only complete once the farmer has entered the buyer's handover code, which
  // is what stamps collected_at.
  it('only calls a self-pickup complete once the handover code was entered', () => {
    const base = { status: 'approved' as const, delivery_type: 'self_pickup' as const }
    expect(statusLabel(order(base))).toBe('Approved')
    expect(statusLabel(order({ ...base, collected_at: new Date().toISOString() }))).toBe('Completed')
  })

  // USE: a home delivery completes on the RIDER's delivered status, not on
  // anything the farmer stamps — the farmer's shipped_at/received_at stay null
  // on a rider order, so reading those would leave every delivery "Approved"
  // forever.
  it('completes a home delivery on the rider\'s delivered status', () => {
    const base = { status: 'approved' as const, delivery_type: 'home_delivery' as const }
    expect(statusLabel(order(base))).toBe('Approved')
    expect(statusLabel(order({ ...base, delivery_status: 'delivered' }))).toBe('Completed')
  })

  // USE: a buyer-cancelled order stays visible until the farmer acknowledges
  // it, so a cancellation cannot silently drop out of their active list.
  it('keeps a cancellation labelled Cancelled either way', () => {
    expect(statusLabel(order({ status: 'cancelled' }))).toBe('Cancelled')
    expect(statusLabel(order({ status: 'cancelled', acknowledged_at: new Date().toISOString() }))).toBe('Cancelled')
  })
})

describe('deliveryLabel', () => {
  // USE: self-pickup is the DEFAULT, including for older rows where the column
  // is null. Mislabelling those as a delivery would have a farmer waiting for a
  // rider who is never coming.
  it('names each delivery mode and defaults a null to self pickup', () => {
    expect(deliveryLabel(order({ delivery_type: 'home_delivery' }))).toBe('Home delivery')
    expect(deliveryLabel(order({ delivery_type: 'courier' }))).toBe('Courier')
    expect(deliveryLabel(order({ delivery_type: 'self_pickup' }))).toBe('Self pickup')
    expect(deliveryLabel(order({ delivery_type: null }))).toBe('Self pickup')
  })
})

describe('declineServiceFee', () => {
  // USE: the penalty a farmer bears for declining an order they accepted. It is
  // rounded per order to match the moderator's payout deduction exactly — if
  // the two round differently the totals disagree by rupees and the farmer is
  // right to dispute it.
  it('charges the commission percentage on a declined order, rounded per order', () => {
    expect(declineServiceFee(order({ status: 'declined', total_price: 200 }), 5)).toBe(10)
    expect(declineServiceFee(order({ status: 'declined', total_price: 250 }), 5)).toBe(13)
  })

  // USE: only a DECLINE is penalised. Charging this on a completed or
  // buyer-cancelled order would be taking money the farmer never agreed to.
  it('charges nothing on an order the farmer did not decline', () => {
    expect(declineServiceFee(order({ status: 'approved', total_price: 200 }), 5)).toBe(0)
    expect(declineServiceFee(order({ status: 'cancelled', total_price: 200 }), 5)).toBe(0)
  })

  // USE: with no commission configured the penalty must be zero, not NaN — an
  // unmigrated settings table must never turn the report's totals into "NaN".
  it('is 0 when no commission is set, and never NaN', () => {
    expect(declineServiceFee(order({ status: 'declined' }), 0)).toBe(0)
    expect(declineServiceFee(order({ status: 'declined' }), -5)).toBe(0)
    expect(Number.isFinite(declineServiceFee(order({ status: 'declined', total_price: null }), 5))).toBe(true)
  })
})

describe('isPaidOrder / amountPaid', () => {
  // USE: what the BUYER paid — produce plus this row's share of the delivery
  // and platform fees. Those fees are stamped on the cart's first row only, so
  // summing the column over a multi-line order must not double-count them.
  it('adds the fees stamped on this row to the produce price', () => {
    expect(amountPaid(order({ total_price: 200, delivery_fee: 30, platform_fee: 10 }))).toBe(240)
    expect(amountPaid(order({ total_price: 150, delivery_fee: 0, platform_fee: 0 }))).toBe(150)
  })

  // USE: a farmer who has manually confirmed a UPI payment, and a buyer who has
  // merely claimed one, both count as money in for the report — the farmer
  // needs to see the claim they are about to verify.
  it('counts a gateway payment, a manual confirmation and a buyer claim', () => {
    expect(isPaidOrder(order({ payment_status: 'paid' }))).toBe(true)
    expect(isPaidOrder(order({ payment_status: 'completed' }))).toBe(true)
    expect(isPaidOrder(order({ payment_status: 'payment_claimed' }))).toBe(true)
  })

  // USE: an unpaid order must show a dash, not a figure. Printing ₹200 against
  // an order nobody paid for is the report's worst possible error.
  it('is 0 on an order nobody has paid for', () => {
    expect(amountPaid(order({ payment_status: 'pending', total_price: 200 }))).toBe(0)
    expect(amountPaid(order({ payment_status: null }))).toBe(0)
  })
})

describe('refundAmount', () => {
  // USE: refunds are shown to explain a gap between what the buyer paid and
  // what the farmer received.
  it('reports the refund raised on the order', () => {
    expect(refundAmount(order({ refund_amount: 240 }))).toBe(240)
  })

  // USE: a missing or negative refund must read as 0, never as "-₹50 refunded".
  it('never reports a negative or missing refund', () => {
    expect(refundAmount(order({ refund_amount: null }))).toBe(0)
    expect(refundAmount(order({ refund_amount: -50 }))).toBe(0)
    expect(refundAmount(order({}))).toBe(0)
  })
})

describe('amountReceived', () => {
  // USE: the bottom-line column — what the farmer actually keeps.
  it('is the produce price on a live order', () => {
    expect(amountReceived(order({ status: 'approved', total_price: 200 }), 5)).toBe(200)
  })

  // USE: a decline is a LOSS, shown as a negative. Reporting 0 would hide the
  // penalty; reporting the produce price would claim income from an order the
  // farmer refused.
  it('is a negative penalty on a decline', () => {
    expect(amountReceived(order({ status: 'declined', total_price: 200 }), 5)).toBe(-10)
  })

  // USE: on a buyer cancellation the produce money goes back, so the farmer
  // receives nothing — and bears no penalty either, since they did nothing wrong.
  it('is 0 on a buyer cancellation, with no penalty', () => {
    expect(amountReceived(order({ status: 'cancelled', total_price: 200 }), 5)).toBe(0)
  })
})

describe('filterOrders and computeReportData', () => {
  const jan = (day: number) => new Date(2026, 0, day).toISOString()
  const filter = { from: new Date(2026, 0, 1), to: new Date(2026, 0, 31), statuses: [] }

  // USE: the farmer picks a date range to reconcile against a bank statement.
  // An order outside the window appearing in the totals is a number they cannot
  // account for.
  it('keeps only orders created inside the chosen date range', () => {
    const orders = [
      order({ id: 'in', created_at: jan(10) }),
      order({ id: 'before', created_at: new Date(2025, 11, 20).toISOString() }),
      order({ id: 'after', created_at: new Date(2026, 1, 5).toISOString() }),
    ]
    expect(filterOrders(orders, filter).map((o) => o.id)).toEqual(['in'])
  })

  // USE: an empty status list means "all statuses", which is what the report
  // opens on. Reading it as "none" would produce a permanently empty report.
  it('treats an empty status list as all statuses', () => {
    const orders = [order({ id: 'a', created_at: jan(5) }), order({ id: 'b', status: 'declined', created_at: jan(6) })]
    expect(filterOrders(orders, filter)).toHaveLength(2)
    expect(filterOrders(orders, { ...filter, statuses: ['Declined'] }).map((o) => o.id)).toEqual(['b'])
  })

  // USE: the summary block at the top of the report. Revenue counts approved
  // orders, and the service fee deducted is the sum of the decline penalties —
  // the two figures the farmer checks first.
  it('summarises counts, approved revenue and the fee deducted', () => {
    const orders = [
      order({ id: 'a', status: 'approved', total_price: 200, created_at: jan(3) }),
      order({ id: 'b', status: 'approved', total_price: 300, created_at: jan(4) }),
      order({ id: 'c', status: 'declined', total_price: 200, created_at: jan(5) }),
      order({ id: 'd', status: 'pending', total_price: 100, created_at: jan(6) }),
    ]
    const data = computeReportData(orders, filter, 5)
    expect(data.revenue).toBe(500)
    expect(data.serviceFeeDeducted).toBe(10)
    expect(data.counts.Approved).toBe(2)
    expect(data.counts.Declined).toBe(1)
    expect(data.counts.Pending).toBe(1)
  })

  // USE: with no commission configured the report must still add up, showing 0
  // deducted rather than NaN across every total.
  it('produces real numbers when no commission is configured', () => {
    const data = computeReportData([order({ status: 'declined', created_at: jan(5) })], filter)
    expect(data.serviceFeeDeducted).toBe(0)
    expect(Number.isFinite(data.revenue)).toBe(true)
  })
})

describe('ordersInReportWindow', () => {
  // USE: the default one-month view, newest first. An order just outside the
  // window must drop out, or the "last 30 days" heading is a lie.
  it('keeps the last 30 days and sorts newest first', () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
    const rows = ordersInReportWindow([
      order({ id: 'old', created_at: daysAgo(REPORT_WINDOW_DAYS + 2) }),
      order({ id: 'mid', created_at: daysAgo(10) }),
      order({ id: 'new', created_at: daysAgo(1) }),
    ])
    expect(rows.map((o) => o.id)).toEqual(['new', 'mid'])
  })
})

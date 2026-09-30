import { describe, it, expect } from 'vitest'
import {
  waParam,
  formatRupees,
  orderCodeLabel,
  itemsSummary,
  buyerTotal,
  produceTotal,
  paymentLabel,
  deliveryLabel,
  isOrderLive,
  groupByFarmer,
  batchKey,
  placedBuyerParams,
  farmerNewOrderParams,
  cancelledParams,
  cancelReason,
  type NotifyOrderRow,
} from '@/lib/orderNotify'

// The WhatsApp order messages. Meta checks only the COUNT of values against the
// approved template, so a wrong value in the right slot sails through and lands
// on a real buyer's phone. These pin what goes in each {{n}}.

function row(over: Partial<NotifyOrderRow> = {}): NotifyOrderRow {
  return {
    id: 'a0000000-0000-0000-0000-000000000001',
    farmer_id: 'f1',
    order_code: 'YFF-20260929-0012',
    produce_name: 'Tomato',
    quantity: 2,
    unit: 'kg',
    total_price: 200,
    delivery_fee: 30,
    platform_fee: 10,
    buyer_name: 'Ravi',
    buyer_phone: '9876543210',
    payment_method: 'cashfree',
    payment_status: 'paid',
    cod_deposit: 0,
    delivery_type: 'home_delivery',
    delivery_address: '12-4 Main Road',
    delivery_city: 'Tadepalligudem',
    delivery_pincode: '534101',
    pickup_location: null,
    created_at: '2026-09-29T10:00:00Z',
    ...over,
  }
}

describe('waParam', () => {
  // USE: Meta rejects a param with a newline/tab or 5+ spaces (132018), and a
  // buyer-typed multi-line address has both — the whole message would be lost.
  it('flattens newlines, tabs and runs of spaces', () => {
    expect(waParam('12-4 Main Road\nNear   temple\t\tTPG')).toBe('12-4 Main Road Near temple TPG')
  })

  // USE: an empty param is also rejected — a guest with no name must not kill the send.
  it('never returns an empty string', () => {
    expect(waParam('')).toBe('-')
    expect(waParam(null)).toBe('-')
    expect(waParam('   ')).toBe('-')
  })

  it('truncates long values', () => {
    const s = waParam('x'.repeat(500), 50)
    expect(s.length).toBe(50)
    expect(s.endsWith('…')).toBe(true)
  })
})

describe('amounts', () => {
  // USE: the buyer is told what they paid (produce + delivery + platform fee);
  // the farmer is told what their produce sold for. Swapping them was a real risk.
  it('buyer total includes fees, farmer total does not', () => {
    const rows = [row(), row({ id: 'b', total_price: 50, delivery_fee: 0, platform_fee: 0 })]
    expect(buyerTotal(rows)).toBe(290)
    expect(produceTotal(rows)).toBe(250)
  })

  it('formats rupees Indian-style without a trailing .00', () => {
    expect(formatRupees(240)).toBe('240')
    expect(formatRupees(124050.5)).toBe('1,24,050.5')
  })

  it('treats missing numbers as 0, never NaN', () => {
    expect(buyerTotal([row({ delivery_fee: null, platform_fee: null })])).toBe(200)
  })
})

describe('labels', () => {
  it('shows one order code, or the first plus a count', () => {
    expect(orderCodeLabel([row()])).toBe('YFF-20260929-0012')
    expect(orderCodeLabel([row(), row({ order_code: 'YFF-20260929-0013' })])).toBe('YFF-20260929-0012 (+1 more)')
    expect(orderCodeLabel([row({ order_code: null })])).toBe('-')
  })

  it('lists items with trimmed quantities', () => {
    expect(itemsSummary([row(), row({ produce_name: 'Okra', quantity: 0.5 })])).toBe('Tomato 2 kg, Okra 0.5 kg')
  })

  // USE: the farmer must know if cash is still to be collected.
  it('describes payment from the farmer’s side', () => {
    expect(paymentLabel([row()])).toBe('Paid online')
    expect(paymentLabel([row({ payment_method: 'cod' })])).toBe('Cash on delivery')
    expect(paymentLabel([row({ payment_method: 'cod', cod_deposit: 40 })])).toBe('Cash on delivery (₹40 advance paid online)')
  })

  it('describes delivery, including a mixed batch', () => {
    expect(deliveryLabel([row()])).toBe('Home delivery - 12-4 Main Road, Tadepalligudem, 534101')
    expect(deliveryLabel([row({ delivery_type: 'self_pickup', pickup_location: 'Village hall' })]))
      .toBe('Customer pickup at Village hall')
    expect(deliveryLabel([row(), row({ delivery_type: 'self_pickup', pickup_location: null })]))
      .toBe('Home delivery - 12-4 Main Road, Tadepalligudem, 534101; Customer pickup')
  })
})

describe('isOrderLive', () => {
  // USE: an online checkout the buyer walks away from must never produce an
  // "order placed" or "order cancelled" WhatsApp.
  it('online orders are live only once paid', () => {
    expect(isOrderLive(row({ payment_status: 'pending' }))).toBe(false)
    expect(isOrderLive(row({ payment_status: 'failed' }))).toBe(false)
    expect(isOrderLive(row({ payment_status: 'paid' }))).toBe(true)
  })

  it('cash-only COD is live at once; deposit COD once the deposit is in', () => {
    expect(isOrderLive(row({ payment_method: 'cod', payment_status: 'pending', cod_deposit: 0 }))).toBe(true)
    expect(isOrderLive(row({ payment_method: 'cod', payment_status: 'pending', cod_deposit: 40 }))).toBe(false)
    expect(isOrderLive(row({ payment_method: 'cod', payment_status: 'deposit_paid', cod_deposit: 40 }))).toBe(true)
  })

  it('legacy UPI is live at once', () => {
    expect(isOrderLive(row({ payment_method: 'upi', payment_status: 'pending' }))).toBe(true)
  })
})

describe('batching', () => {
  // USE: one Cashfree payment can cover several farmers — each farmer gets
  // their own message about only their own items.
  it('groups rows per farmer', () => {
    const groups = groupByFarmer([row(), row({ id: 'b', farmer_id: 'f2' }), row({ id: 'c' })])
    expect(groups.map((g) => g.map((r) => r.id))).toEqual([[row().id, 'c'], ['b']])
  })

  // USE: verify, webhook and cron all settle the same payment — the dedupe key
  // must come out identical whatever order the rows arrive in.
  it('batch key does not depend on row order', () => {
    const a = row({ id: 'b-2' })
    const b = row({ id: 'a-1' })
    expect(batchKey([a, b])).toBe(batchKey([b, a]))
  })
})

describe('template params', () => {
  // USE: these arrays must match the approved templates slot for slot.
  it('yff_order_placed: name, order no., amount, farmer', () => {
    expect(placedBuyerParams([row()], 'Lakshmi Farms')).toEqual(['Ravi', 'YFF-20260929-0012', '240', 'Lakshmi Farms'])
  })

  it('yff_farmer_new_order: 7 values in order', () => {
    expect(farmerNewOrderParams([row()])).toEqual([
      'YFF-20260929-0012',
      'Ravi',
      '9876543210',
      'Tomato 2 kg',
      '200',
      'Paid online',
      'Home delivery - 12-4 Main Road, Tadepalligudem, 534101',
    ])
  })

  it('yff_order_cancelled: name, order no., farmer, reason', () => {
    expect(cancelledParams([row()], 'Lakshmi Farms', 'buyer', 'changed mind'))
      .toEqual(['Ravi', 'YFF-20260929-0012', 'Lakshmi Farms', 'Cancelled at your request'])
  })

  it('farmer decline carries the farmer’s reason when given', () => {
    expect(cancelReason('farmer', 'Rain damaged the crop')).toBe('The farmer could not complete this order (Rain damaged the crop)')
    expect(cancelReason('farmer', '')).toBe('The farmer could not complete this order')
  })
})

import { describe, it, expect } from 'vitest'
import {
  buildOrderReceipt,
  receiptDate,
  receiptFileName,
  receiptNumber,
  rowText,
  rupees,
  type ReceiptOrder,
} from '@/lib/orderReceipt'

const ORDER = (extra: Partial<ReceiptOrder> = {}): ReceiptOrder => ({
  id: '3f2a9c10-1111-4222-8333-444455556666',
  order_code: 'YFF-20261104-0042',
  produce_name: 'Tomato',
  quantity: 3,
  unit: 'kg',
  total_price: 120,
  platform_fee: 6,
  buyer_name: 'Lakshmi',
  buyer_phone: '9876543210',
  status: 'approved',
  payment_method: 'cashfree',
  payment_status: 'paid',
  paid_at: '2026-11-04T05:05:00Z',
  created_at: '2026-11-04T05:00:00Z',
  delivery_type: 'self_pickup',
  pickup_location: 'Farm gate, Pentapadu',
  ...extra,
})
const FARMER = { name: 'Ravi', village: 'Pentapadu', phone: '9000000001', account_type: 'farmer' }

const row = (rows: { label: { en: string }; value: unknown }[], en: string) =>
  rows.find((r) => r.label.en === en)
const text = (rows: Parameters<typeof row>[0], en: string, lang: 'en' | 'te' = 'en') => {
  const r = row(rows, en)
  return r ? rowText(r.value as never, lang) : undefined
}

describe('rupees', () => {
  it('whole rupees with Indian grouping', () => {
    expect(rupees(120)).toBe('₹120')
    expect(rupees(125000)).toBe('₹1,25,000')
  })
  it('paise only when there are any', () => {
    expect(rupees(40.5)).toBe('₹40.50')
    expect(rupees('33.333')).toBe('₹33.33')
  })
  it('junk reads as ₹0', () => {
    expect(rupees(null)).toBe('₹0')
    expect(rupees('abc')).toBe('₹0')
    expect(rupees(undefined)).toBe('₹0')
  })
})

describe('receiptDate', () => {
  it('is India time, whatever the server zone', () => {
    // 05:00 UTC = 10:30 am IST
    expect(receiptDate('2026-11-04T05:00:00Z')).toMatch(/4 Nov 2026/)
    expect(receiptDate('2026-11-04T05:00:00Z')).toMatch(/10:30/)
    expect(receiptDate('2026-11-04T05:00:00Z').toLowerCase()).toMatch(/am/)
  })
  it('the IST date can differ from the UTC date', () => {
    expect(receiptDate('2026-11-04T20:00:00Z')).toMatch(/5 Nov 2026/) // 1:30 am IST next day
  })
  it('empty or broken dates are blank, never "Invalid Date"', () => {
    expect(receiptDate(null)).toBe('')
    expect(receiptDate('nope')).toBe('')
  })
})

describe('receiptNumber / receiptFileName', () => {
  it('uses the order code', () => {
    expect(receiptNumber(ORDER())).toBe('YFF-20261104-0042')
  })
  it('falls back to a short id when there is no code', () => {
    expect(receiptNumber(ORDER({ order_code: null }))).toBe('#3F2A9C10')
    expect(receiptNumber(ORDER({ order_code: '  ' }))).toBe('#3F2A9C10')
  })
  it('file name is safe for any phone', () => {
    expect(receiptFileName('YFF-20261104-0042')).toBe('GoGrameen-Receipt-YFF-20261104-0042')
    expect(receiptFileName('#3F2A9C10')).toBe('GoGrameen-Receipt-3F2A9C10')
    expect(receiptFileName('a/b\\c:d')).toBe('GoGrameen-Receipt-abcd')
  })
})

describe('buildOrderReceipt — money', () => {
  it('matches the order screen: seller price + platform fee = buyer pays', () => {
    const r = buildOrderReceipt(ORDER(), FARMER)
    expect(text(r.money, 'Seller price')).toBe('₹120')
    expect(text(r.money, 'Platform fee')).toBe('₹6')
    expect(r.total).toBe('₹126')
  })
  it('no fee → ₹0 fee, total = price', () => {
    const r = buildOrderReceipt(ORDER({ platform_fee: null }), FARMER)
    expect(text(r.money, 'Platform fee')).toBe('₹0')
    expect(r.total).toBe('₹120')
  })
  it('numeric strings from the database are read', () => {
    const r = buildOrderReceipt(ORDER({ total_price: '99.50', platform_fee: '0.50', quantity: '0.5' }), FARMER)
    expect(r.total).toBe('₹100')
    expect(r.item.qty).toBe('0.5 kg')
    expect(r.item.rate).toBe('₹199/kg')
  })
  it('rate is the line total ÷ quantity (tier prices included)', () => {
    expect(buildOrderReceipt(ORDER({ total_price: 100, quantity: 3 }), FARMER).item.rate).toBe('₹33.33/kg')
  })
  it('zero quantity never divides by zero', () => {
    expect(buildOrderReceipt(ORDER({ quantity: 0 }), FARMER).item.rate).toBe('—')
  })
  it('no delivery charge on the receipt (it is per checkout, not this sale)', () => {
    const r = buildOrderReceipt({ ...ORDER(), delivery_fee: 30 } as ReceiptOrder, FARMER)
    expect(r.money.map((m) => m.label.en)).toEqual(['Seller price', 'Platform fee'])
    expect(r.total).toBe('₹126')
  })
})

describe('buildOrderReceipt — bulk order with transport', () => {
  it('produce and transport on their own lines; the total is unchanged', () => {
    const r = buildOrderReceipt(ORDER({ total_price: 6500, transport_charge: 500, quantity: 200, platform_fee: 0, order_type: 'wholesale' }), FARMER)
    expect(r.money.map((m) => [m.label.en, rowText(m.value, 'en')])).toEqual([['Produce price', '₹6,000'], ['Transport', '₹500'], ['Platform fee', '₹0']])
    expect(r.total).toBe('₹6,500')
    expect(r.item).toMatchObject({ rate: '₹30/kg', amount: '₹6,000' })
    expect(r.tags.map((t) => t.en)).toContain('Wholesale order')
  })
  it('no transport → the usual single seller-price line', () => {
    expect(buildOrderReceipt(ORDER({ transport_charge: 0 }), FARMER).money.map((m) => m.label.en)).toEqual(['Seller price', 'Platform fee'])
  })
  it('a transport figure larger than the price is capped (never a negative produce price)', () => {
    const r = buildOrderReceipt(ORDER({ total_price: 100, transport_charge: 900 }), FARMER)
    expect(rowText(r.money[0].value, 'en')).toBe('₹0')
  })
})

describe('buildOrderReceipt — item, people, unit', () => {
  it('item line', () => {
    expect(buildOrderReceipt(ORDER(), FARMER).item).toEqual({ name: 'Tomato', qty: '3 kg', rate: '₹40/kg', amount: '₹120' })
  })
  it('a missing unit reads as kg; other units are kept', () => {
    expect(buildOrderReceipt(ORDER({ unit: null }), FARMER).item.qty).toBe('3 kg')
    expect(buildOrderReceipt(ORDER({ unit: 'dozen', quantity: 2, total_price: 100 }), FARMER).item).toMatchObject({ qty: '2 dozen', rate: '₹50/dozen' })
  })
  it('seller is a farmer or an aggregator', () => {
    expect(buildOrderReceipt(ORDER(), FARMER).seller).toEqual({ role: { en: 'Farmer', te: 'రైతు' }, name: 'Ravi', place: 'Pentapadu', phone: '9000000001' })
    expect(buildOrderReceipt(ORDER(), { ...FARMER, account_type: 'aggregator' }).seller.role.en).toBe('Aggregator')
  })
  it('missing seller or buyer details show a dash, never "null"', () => {
    const r = buildOrderReceipt(ORDER({ buyer_name: null, buyer_phone: null, produce_name: '' }), null)
    expect(r.seller.name).toBe('—')
    expect(r.seller.phone).toBe('')
    expect(r.buyer).toEqual({ name: '—', phone: '' })
    expect(r.item.name).toBe('—')
    expect(JSON.stringify(r)).not.toMatch(/null|undefined|NaN/)
  })
  it('tags: wholesale and own orders', () => {
    expect(buildOrderReceipt(ORDER(), FARMER).tags).toEqual([])
    expect(buildOrderReceipt(ORDER({ order_type: 'wholesale', is_self_order: true }), FARMER).tags.map((t) => t.en))
      .toEqual(['Wholesale order', 'Own order'])
  })
})

describe('buildOrderReceipt — status', () => {
  it.each([
    [{ status: 'pending' }, 'Pending', false],
    [{ status: 'approved' }, 'Approved', false],
    [{ status: 'approved', collected_at: '2026-11-04T08:00:00Z' }, 'Collected by buyer', false],
    [{ status: 'approved', delivery_type: 'home_delivery', delivery_status: 'delivered' }, 'Delivered', false],
    [{ status: 'approved', delivery_type: 'courier', received_at: '2026-11-05T08:00:00Z' }, 'Delivered', false],
    [{ status: 'declined' }, 'Declined', true],
    [{ status: 'cancelled' }, 'Cancelled', true],
  ])('%o → %s', (extra, en, isVoid) => {
    const r = buildOrderReceipt(ORDER(extra as Partial<ReceiptOrder>), FARMER)
    expect(r.status.en).toBe(en)
    expect(r.status.te).toMatch(/[ఀ-౿]/)
    expect(r.void).toBe(isVoid)
  })
})

describe('buildOrderReceipt — payment', () => {
  it('paid online: method, status, paid date', () => {
    const r = buildOrderReceipt(ORDER(), FARMER)
    expect(text(r.payment, 'Method')).toBe('Online (UPI / card)')
    expect(text(r.payment, 'Status')).toBe('Paid')
    expect(text(r.payment, 'Paid on')).toMatch(/4 Nov 2026/)
  })
  it('both languages', () => {
    const r = buildOrderReceipt(ORDER(), FARMER)
    expect(text(r.payment, 'Method', 'te')).toMatch(/ఆన్‌లైన్/)
    expect(text(r.payment, 'Status', 'te')).toBe('చెల్లించారు')
  })
  it('"completed" counts as paid too', () => {
    expect(text(buildOrderReceipt(ORDER({ payment_method: 'cod', payment_status: 'completed' }), FARMER).payment, 'Status')).toBe('Paid')
  })
  it('cash not yet paid', () => {
    const r = buildOrderReceipt(ORDER({ payment_method: 'cod', payment_status: 'pending', paid_at: null }), FARMER)
    expect(text(r.payment, 'Method')).toBe('Cash')
    expect(text(r.payment, 'Status')).toBe('Not paid yet')
    expect(row(r.payment, 'Paid on')).toBeUndefined()
  })
  it('a collected cash order is paid in cash even if the status was never flipped', () => {
    const r = buildOrderReceipt(ORDER({ payment_method: 'cod', payment_status: 'pending', collected_at: '2026-11-04T08:00:00Z' }), FARMER)
    expect(text(r.payment, 'Status')).toBe('Paid in cash')
  })
  it('a missing method is cash', () => {
    expect(text(buildOrderReceipt(ORDER({ payment_method: null, payment_status: null }), FARMER).payment, 'Method')).toBe('Cash')
  })
  it.each([
    ['deposit_paid', 'Deposit paid, balance in cash'],
    ['payment_claimed', 'Buyer says paid — not verified'],
    ['failed', 'Payment failed'],
  ])('%s → %s', (payment_status, en) => {
    expect(text(buildOrderReceipt(ORDER({ payment_status, paid_at: null }), FARMER).payment, 'Status')).toBe(en)
  })
  it('a paid date is not shown unless it is actually paid', () => {
    expect(row(buildOrderReceipt(ORDER({ payment_status: 'failed' }), FARMER).payment, 'Paid on')).toBeUndefined()
  })
  it('UTR / reference when there is one', () => {
    expect(text(buildOrderReceipt(ORDER({ utr_number: ' 412345678901 ' }), FARMER).payment, 'Reference')).toBe('412345678901')
    expect(row(buildOrderReceipt(ORDER(), FARMER).payment, 'Reference')).toBeUndefined()
  })
  it('refunds: processed, started, failed (not shown)', () => {
    expect(text(buildOrderReceipt(ORDER({ status: 'declined', refund_status: 'processed', refund_amount: 126 }), FARMER).payment, 'Refunded to buyer')).toBe('₹126')
    expect(text(buildOrderReceipt(ORDER({ status: 'declined', refund_status: 'pending' }), FARMER).payment, 'Refund started')).toBe('₹120')
    const failed = buildOrderReceipt(ORDER({ refund_status: 'failed' }), FARMER).payment
    expect(failed.some((r) => /Refund/.test(r.label.en))).toBe(false)
  })
})

describe('buildOrderReceipt — pickup / delivery', () => {
  it('pickup with the pickup point', () => {
    const r = buildOrderReceipt(ORDER(), FARMER)
    expect(text(r.fulfilment, 'Delivery')).toBe('Pickup from seller')
    expect(text(r.fulfilment, 'Pickup point')).toBe('Farm gate, Pentapadu')
    expect(row(r.fulfilment, 'Address')).toBeUndefined()
  })
  it('home delivery with the full address', () => {
    const r = buildOrderReceipt(ORDER({
      delivery_type: 'home_delivery', delivery_address: '12-3 Main Road', delivery_landmark: 'Near temple',
      delivery_city: 'Tadepalligudem', delivery_pincode: '534101', pickup_location: null,
    }), FARMER)
    expect(text(r.fulfilment, 'Delivery')).toBe('Home delivery')
    expect(text(r.fulfilment, 'Address')).toBe('12-3 Main Road, Near temple, Tadepalligudem, 534101')
  })
  it('courier', () => {
    const r = buildOrderReceipt(ORDER({ delivery_type: 'courier', delivery_address: 'Door 4, Main street' }), FARMER)
    expect(text(r.fulfilment, 'Delivery')).toBe('Courier / seller delivery')
    expect(text(r.fulfilment, 'Address')).toBe('Door 4, Main street')
  })
  it('delivery without an address on file → no empty address line', () => {
    const r = buildOrderReceipt(ORDER({ delivery_type: 'home_delivery' }), FARMER)
    expect(row(r.fulfilment, 'Address')).toBeUndefined()
  })
  it('no delivery type = pickup', () => {
    expect(text(buildOrderReceipt(ORDER({ delivery_type: null, pickup_location: null }), FARMER).fulfilment, 'Delivery')).toBe('Pickup from seller')
  })
  it('every label has Telugu', () => {
    const r = buildOrderReceipt(ORDER({ refund_status: 'processed', utr_number: 'x' }), FARMER)
    for (const x of [...r.money, ...r.payment, ...r.fulfilment]) expect(x.label.te).toMatch(/[ఀ-౿]/)
  })
})

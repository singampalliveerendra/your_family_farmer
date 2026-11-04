import { describe, it, expect } from 'vitest'
import { buildSubscriptionReceipt, hasReceipt, type ReceiptSub } from '@/lib/subscriptionReceipt'

const SUB = (x: Partial<ReceiptSub> = {}): ReceiptSub => ({
  id: '3f2a9c10-1111-4222-8333-444455556666', kind: 'buying', source: 'payment', status: 'active',
  starts_at: '2026-11-04T05:00:00Z', ends_at: '2026-12-04T05:00:00Z', amount_paid: 599, price_actual: 999,
  plan_name: 'Bulk Buyer Monthly', duration_days: 30, paid_at: '2026-11-04T05:00:00Z',
  payment_ref: '5114917039', payment_label: 'UPI · PhonePe', receipt_no: 'GGS-20261104-3F2A9C', ...x,
})
const val = (v: unknown) => (typeof v === 'string' ? v : (v as { en: string }).en)

describe('hasReceipt', () => {
  it('paid and active, or a ₹0 plan', () => {
    expect(hasReceipt(SUB())).toBe(true)
    expect(hasReceipt(SUB({ source: 'free_plan', amount_paid: 0 }))).toBe(true)
  })
  it('never for pending / cancelled / moderator grants / no number', () => {
    expect(hasReceipt(SUB({ status: 'pending' }))).toBe(false)
    expect(hasReceipt(SUB({ status: 'cancelled' }))).toBe(false)
    expect(hasReceipt(SUB({ source: 'manual' }))).toBe(false)
    expect(hasReceipt(SUB({ source: 'free_forever' }))).toBe(false)
    expect(hasReceipt(SUB({ receipt_no: null }))).toBe(false)
  })
})

describe('buildSubscriptionReceipt', () => {
  it('a paid plan on offer: price, discount, total, how it was paid', () => {
    const r = buildSubscriptionReceipt(SUB())!
    expect(r.number).toBe('GGS-20261104-3F2A9C')
    expect(r.fileName).toBe('GoGrameen-Receipt-GGS-20261104-3F2A9C')
    expect(r.planName).toBe('Bulk Buyer Monthly')
    expect(r.kind.en).toBe('Buying')
    expect(r.duration?.en).toBe('1 month')
    expect(r.lines.map((l) => [l.label.en, l.value])).toEqual([['Plan price', '₹999'], ['Offer discount', '− ₹400']])
    expect(r.total).toBe('₹599')
    expect(r.payment.map((p) => [p.label.en, val(p.value)])).toEqual([
      ['Paid by', 'UPI · PhonePe'], ['Paid on', '4 Nov 2026, 10:30 am'], ['Reference', '5114917039'],
    ])
    expect(r.period.from).toMatch(/4 Nov 2026/)
    expect(r.period.to).toMatch(/4 Dec 2026/)
  })
  it('no offer → no discount line', () => {
    expect(buildSubscriptionReceipt(SUB({ price_actual: 599 }))!.lines).toHaveLength(1)
  })
  it('a missing actual price never shows a negative discount', () => {
    const r = buildSubscriptionReceipt(SUB({ price_actual: null }))!
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].value).toBe('₹599')
  })
  it('₹0 plan: "Free plan — no payment"', () => {
    const r = buildSubscriptionReceipt(SUB({ source: 'free_plan', amount_paid: 0, price_actual: 0, paid_at: null, payment_ref: null, payment_label: null }))!
    expect(r.total).toBe('₹0')
    expect(r.payment).toHaveLength(1)
    expect(val(r.payment[0].value)).toBe('Free plan — no payment')
  })
  it('no payment label → "Online (Cashfree)"', () => {
    expect(val(buildSubscriptionReceipt(SUB({ payment_label: ' ' }))!.payment[0].value)).toBe('Online (Cashfree)')
  })
  it('rows without a receipt → null', () => {
    expect(buildSubscriptionReceipt(SUB({ status: 'pending' }))).toBeNull()
  })
  it('both languages on every label', () => {
    const r = buildSubscriptionReceipt(SUB())!
    for (const l of [...r.lines.map((x) => x.label), ...r.payment.map((x) => x.label), r.kind]) expect(l.te).toMatch(/[ఀ-౿]/)
  })
})

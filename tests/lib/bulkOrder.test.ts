import { describe, it, expect } from 'vitest'
import { bulkOrderStage, checkBulkAddress, checkBulkOrder, deliveryOptions, pickHarvest, rateText, transportCharge, type BulkListing } from '@/lib/bulkOrder'

const L = (x: Partial<BulkListing> = {}): BulkListing => ({
  name: 'Tomato', unit: 'kg', sale_mode: 'wholesale', sale_step: 1, wholesale_price: 30, wholesale_min_qty: 100, wholesale_pack_size: 25,
  wholesale_transport_states: ['AP', 'TG'],
  wholesale_transport_rates: { AP: { mode: 'per_order', amount: 500, free_above: 1000 }, TG: { mode: 'per_unit', amount: 2, free_above: null } },
  ...x,
})
const en = (e: string) => e

describe('transportCharge', () => {
  it('per order: one charge', () => {
    expect(transportCharge({ mode: 'per_order', amount: 500, free_above: null }, 100)).toBe(500)
  })
  it('per kg: amount × quantity, whole rupees', () => {
    expect(transportCharge({ mode: 'per_unit', amount: 1.5, free_above: null }, 125)).toBe(188)
  })
  it('free from the "free above" quantity (inclusive)', () => {
    const r = { mode: 'per_order' as const, amount: 500, free_above: 1000 }
    expect(transportCharge(r, 999)).toBe(500)
    expect(transportCharge(r, 1000)).toBe(0)
  })
  it('₹0 rate = free', () => {
    expect(transportCharge({ mode: 'per_unit', amount: 0, free_above: null }, 500)).toBe(0)
  })
})

describe('deliveryOptions', () => {
  it('pickup + every state with a charge', () => {
    expect(deliveryOptions(L()).map((o) => o.delivery)).toEqual(['pickup', 'AP', 'TG'])
  })
  it('a state without a charge is NOT offered (never read as free)', () => {
    expect(deliveryOptions(L({ wholesale_transport_rates: { AP: { mode: 'per_order', amount: 500 } } })).map((o) => o.delivery)).toEqual(['pickup', 'AP'])
    expect(deliveryOptions(L({ wholesale_transport_rates: {} })).map((o) => o.delivery)).toEqual(['pickup'])
    expect(deliveryOptions(L({ wholesale_transport_rates: undefined })).map((o) => o.delivery)).toEqual(['pickup'])
  })
  it('a rate for a state they no longer deliver to is ignored', () => {
    expect(deliveryOptions(L({ wholesale_transport_states: ['TG'] })).map((o) => o.delivery)).toEqual(['pickup', 'TG'])
  })
})

describe('rateText', () => {
  it.each([
    [{ mode: 'per_order', amount: 500, free_above: 1000 }, '₹500 per order · free above 1000 kg'],
    [{ mode: 'per_unit', amount: 2, free_above: null }, '₹2/kg'],
    [{ mode: 'per_order', amount: 0, free_above: null }, 'Free delivery'],
  ] as const)('%o → %s', (r, text) => {
    expect(rateText(r, 'kg', en)).toBe(text)
  })
})

describe('checkBulkOrder', () => {
  it('pickup: goods only, 0% fee', () => {
    expect(checkBulkOrder(L(), 150, 'pickup', 0)).toEqual({
      ok: true, unitPrice: 30, qty: 150, goods: 4500, transport: 0, fee: 0, total: 4500, linePrice: 4500,
      deliveryType: 'self_pickup', transportState: null,
    })
  })
  it('delivery to AP per order; total_price includes transport (the seller’s)', () => {
    expect(checkBulkOrder(L(), 200, 'AP', 0)).toMatchObject({ ok: true, goods: 6000, transport: 500, total: 6500, linePrice: 6500, deliveryType: 'courier', transportState: 'AP' })
  })
  it('delivery to TG per kg', () => {
    expect(checkBulkOrder(L(), 200, 'TG', 0)).toMatchObject({ ok: true, transport: 400, total: 6400 })
  })
  it('free above the threshold', () => {
    expect(checkBulkOrder(L(), 1000, 'AP', 0)).toMatchObject({ ok: true, transport: 0, total: 30000 })
  })
  it('a moderator fee is charged on the produce only, not on transport', () => {
    expect(checkBulkOrder(L(), 200, 'AP', 2)).toMatchObject({ ok: true, goods: 6000, transport: 500, fee: 120, total: 6620, linePrice: 6500 })
  })
  it('Both is sold in bulk too', () => {
    expect(checkBulkOrder(L({ sale_mode: 'both' }), 100, 'pickup', 0).ok).toBe(true)
  })
  it.each([
    ['below the minimum', L(), 75, 'pickup', /at least 100 kg/],
    ['not whole packs', L(), 110, 'pickup', /packs of 25 kg/],
    ['retail produce', L({ sale_mode: 'retail' }), 100, 'pickup', /not sold in bulk/],
    ['no price', L({ wholesale_price: null }), 100, 'pickup', /not sold in bulk/],
    ['a state with no charge', L({ wholesale_transport_rates: {} }), 100, 'AP', /does not deliver .* Choose pickup/],
    ['a state they do not deliver to', L({ wholesale_transport_states: ['TG'] }), 100, 'AP', /does not deliver/],
    ['junk quantity', L(), Number.NaN, 'pickup', /at least/],
  ] as const)('refused: %s', (_n, l, qty, d, msg) => {
    const r = checkBulkOrder(l, qty, d, 0)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(msg)
  })
  it('no pack: steps of the sale step', () => {
    const l = L({ wholesale_pack_size: null, wholesale_min_qty: 10, sale_step: 0.5 })
    expect(checkBulkOrder(l, 10.25, 'pickup', 0)).toMatchObject({ ok: false })
    expect(checkBulkOrder(l, 10.5, 'pickup', 0)).toMatchObject({ ok: true, goods: 315 })
  })
  it('piece units must be whole', () => {
    expect(checkBulkOrder(L({ unit: 'piece', wholesale_pack_size: null, wholesale_min_qty: 10, sale_step: 1 }), 10.5, 'pickup', 0).ok).toBe(false)
  })
})

describe('pickHarvest (one order = one harvest)', () => {
  const H = [
    { id: 'old', stock_qty: 900, paused: false, harvested_at: '2026-11-01T00:00:00Z' },
    { id: 'new', stock_qty: 150, paused: false, harvested_at: '2026-11-04T00:00:00Z' },
    { id: 'paused', stock_qty: 5000, paused: true, harvested_at: '2026-11-05T00:00:00Z' },
  ]
  it('the newest pick that holds the whole order', () => {
    expect(pickHarvest(H, 100)?.id).toBe('new')
    expect(pickHarvest(H, 500)?.id).toBe('old')
  })
  it('no single pick holds it → null (never split across picks)', () => {
    expect(pickHarvest(H, 1000)).toBeNull()
  })
  it('paused picks never count; untracked stock always can', () => {
    expect(pickHarvest([{ id: 'p', stock_qty: 9999, paused: true }], 10)).toBeNull()
    expect(pickHarvest([{ id: 'u', stock_qty: null }], 10)?.id).toBe('u')
  })
})

describe('checkBulkAddress', () => {
  it('cleans a good address', () => {
    expect(checkBulkAddress({ line: '  12-3 Main Road, Near Temple ', city: 'Tadepalligudem', pincode: '534 101', landmark: '' }))
      .toEqual({ ok: true, line: '12-3 Main Road, Near Temple', city: 'Tadepalligudem', pincode: '534101', landmark: null })
  })
  it.each([
    [{ line: 'short', city: 'X', pincode: '534101' }, /full delivery address/],
    [{ line: '12-3 Main Road, Near Temple', city: '', pincode: '534101' }, /city/],
    [{ line: '12-3 Main Road, Near Temple', city: 'X', pincode: '0123' }, /pincode/],
    [{}, /full delivery address/],
  ])('refuses %o', (a, msg) => {
    const r = checkBulkAddress(a)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(msg)
  })
})

describe('bulkOrderStage (My bulk orders)', () => {
  it.each([
    [{ status: 'pending', payment_status: 'pending' }, 'unpaid', 'Waiting for payment'],
    [{ status: 'cancelled', payment_status: 'pending' }, 'unpaid', 'Payment not completed'],
    [{ status: 'pending', payment_status: 'paid' }, 'waiting', 'Paid — waiting for the seller to confirm'],
    [{ status: 'approved', payment_status: 'paid', delivery_type: 'self_pickup' }, 'approved', 'Ready — collect from the seller'],
    [{ status: 'approved', payment_status: 'paid', delivery_type: 'courier' }, 'approved', 'Confirmed — seller will deliver'],
    [{ status: 'approved', payment_status: 'paid', delivery_type: 'courier', shipped_at: 'x' }, 'shipped', 'On the way'],
    [{ status: 'approved', payment_status: 'paid', delivery_type: 'courier', received_at: 'x' }, 'done', 'Delivered'],
    [{ status: 'approved', payment_status: 'paid', delivery_type: 'self_pickup', collected_at: 'x' }, 'done', 'Collected'],
    [{ status: 'declined', payment_status: 'paid', refund_status: 'processed' }, 'declined', 'Declined — refunded'],
    [{ status: 'declined', payment_status: 'paid', refund_status: 'pending' }, 'declined', 'Declined — refund on the way'],
    [{ status: 'cancelled', payment_status: 'paid' }, 'cancelled', 'Cancelled'],
  ] as const)('%o → %s', (o, key, en) => {
    const s = bulkOrderStage(o)
    expect(s.key).toBe(key)
    expect(s.en).toBe(en)
    expect(s.te).toMatch(/[ఀ-౿]/)
  })
  it('"completed" counts as paid', () => {
    expect(bulkOrderStage({ status: 'pending', payment_status: 'completed' }).key).toBe('waiting')
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { billView, canBill, cargoBillPath, parseTransportBill, type BillOrder } from '@/lib/transportBill'
import { isBilledAfterDelivery, normalizeRates, resolveWholesale, EMPTY_WHOLESALE_FORM, OFFERED_TRANSPORT_MODES } from '@/lib/wholesale'
import { checkBulkOrder, rateText, transportCharge, type BulkListing } from '@/lib/bulkOrder'
import { planHighlight, needsSubscribeNudge } from '@/lib/planHighlight'
import type { PlanRow } from '@/lib/subscriptionPlans'

// Client decisions 2026-11-05: transport per order (online), per km or by
// cargo bill (billed after delivery, paid to the seller directly; "per kg" no
// longer offered); subscription highlighted for aggregators without a plan.

const OID = '33333333-3333-4333-8333-333333333333'
const L = (en: string) => en
const order = (x: Partial<BillOrder> = {}): BillOrder => ({ id: OID, order_type: 'wholesale', status: 'approved', shipped_at: '2026-11-05T05:00:00Z', transport_mode: 'per_km', transport_rate: 5, transport_paid_at: null, ...x })

describe('transport bill', () => {
  it('per km: 20 km × ₹5 = ₹100 (the rate fixed at ordering)', () => {
    const r = parseTransportBill(order(), { km: '20' }, new Date('2026-11-06T00:00:00Z'))
    expect(r).toEqual({ ok: true, fields: { transport_km: 20, transport_bill_amount: 100, transport_bill_path: null, transport_billed_at: '2026-11-06T00:00:00.000Z' } })
  })
  it('per km: the bill file is optional; a bad distance is refused', () => {
    expect(parseTransportBill(order(), { km: 12.5, billPath: `${OID}/bill-1-a.pdf` }).ok).toBe(true)
    for (const km of [0, -3, 'abc', 5001, '']) expect(parseTransportBill(order(), { km }).ok).toBe(false)
  })
  it('cargo bill: needs the amount AND the bill', () => {
    const o = order({ transport_mode: 'cargo_bill', transport_rate: null })
    expect(parseTransportBill(o, { amount: 1200 }).ok).toBe(false)
    expect(parseTransportBill(o, { billPath: `${OID}/bill-1-a.jpg` }).ok).toBe(false)
    const ok = parseTransportBill(o, { amount: '1200.5', billPath: `${OID}/bill-1-a.jpg` })
    expect(ok.ok && ok.fields.transport_bill_amount).toBe(1200.5)
  })
  it("a bill file must be in this order's own folder", () => {
    expect(parseTransportBill(order(), { km: 5, billPath: 'other-order/bill.pdf' }).ok).toBe(false)
  })
  it('only an approved, shipped, unpaid bulk order billed after delivery', () => {
    expect(canBill(order({ order_type: 'retail' })).ok).toBe(false)
    expect(canBill(order({ transport_mode: null })).ok).toBe(false) // per order: paid online
    expect(canBill(order({ status: 'pending' })).ok).toBe(false)
    expect(canBill(order({ shipped_at: null })).ok).toBe(false)
    expect(canBill(order({ transport_paid_at: '2026-11-06T00:00:00Z' })).ok).toBe(false)
    expect(canBill(order()).ok).toBe(true)
  })
  it('bill files: photo or PDF, in the order folder', () => {
    expect(cargoBillPath(OID, 'PDF', 1, 'x')).toEqual({ ok: true, path: `${OID}/bill-1-x.pdf`, contentType: 'application/pdf' })
    expect(cargoBillPath(OID, 'jpeg', 1, 'x')).toMatchObject({ ok: true, contentType: 'image/jpeg' })
    for (const e of ['exe', 'html', 'svg', '']) expect(cargoBillPath(OID, e).ok).toBe(false)
    expect(cargoBillPath('../x', 'pdf').ok).toBe(false)
  })
  it('what both sides see', () => {
    expect(billView({ ...order(), transport_mode: null })).toEqual({ state: 'online' })
    expect(billView(order())).toEqual({ state: 'awaiting', mode: 'per_km', rate: 5 })
    const billed = billView({ ...order(), transport_km: 20, transport_bill_amount: 100, transport_billed_at: 'x', transport_bill_path: 'p' })
    expect(billed).toMatchObject({ state: 'billed', amount: 100, km: 20, hasFile: true })
    expect(billView({ ...order(), transport_bill_amount: 100, transport_billed_at: 'x', transport_paid_at: 'y' }).state).toBe('paid')
  })
})

describe('transport rates on the lot', () => {
  // The form no longer sends rates (2026-11-13); the save rules still apply
  // to an older client that does.
  const form = (rates: Record<string, unknown>) => resolveWholesale({ ...EMPTY_WHOLESALE_FORM, saleMode: 'wholesale', price: '30', minQty: '100', transport: true, states: ['AP'], rates: rates as never, unit: 'kg' })
  it('the form offers per order, per km and cargo bill (not per kg)', () => {
    expect([...OFFERED_TRANSPORT_MODES]).toEqual(['per_order', 'per_km', 'cargo_bill'])
  })
  it('per km needs a rate above 0; cargo bill needs nothing now', () => {
    expect(form({ AP: { mode: 'per_km', amount: '0' } }).ok).toBe(false)
    const km = form({ AP: { mode: 'per_km', amount: '5', freeAbove: '999' } })
    expect(km.ok && km.columns.sale_mode !== 'retail' && km.columns.wholesale_transport_rates).toEqual({ AP: { mode: 'per_km', amount: 5, free_above: null } })
    const cb = form({ AP: { mode: 'cargo_bill', amount: '' } })
    expect(cb.ok && cb.columns.sale_mode !== 'retail' && cb.columns.wholesale_transport_rates).toEqual({ AP: { mode: 'cargo_bill', amount: 0, free_above: null } })
  })
  it('a lot still saved with per kg keeps working', () => {
    expect(normalizeRates({ AP: { mode: 'per_unit', amount: 2 } })).toEqual({ AP: { mode: 'per_unit', amount: 2, free_above: null } })
    expect(transportCharge({ mode: 'per_unit', amount: 2, free_above: null }, 100)).toBe(200)
  })
  it('per km and cargo bill add nothing to the online payment', () => {
    expect(isBilledAfterDelivery('per_km')).toBe(true)
    expect(isBilledAfterDelivery('per_order')).toBe(false)
    expect(transportCharge({ mode: 'per_km', amount: 5, free_above: null }, 100)).toBe(0)
    expect(transportCharge({ mode: 'cargo_bill', amount: 0, free_above: null }, 100)).toBe(0)
    expect(rateText({ mode: 'per_km', amount: 5, free_above: null }, 'kg', L)).toBe('₹5 per km · billed after delivery')
    expect(rateText({ mode: 'cargo_bill', amount: 0, free_above: null }, 'kg', L)).toBe('As per the actual cargo bill · after delivery')
  })
  it('checkout: produce only, and the order remembers how transport is billed', () => {
    const lot: BulkListing = { id: 'l', farmer_id: 'f', name: 'Tomato', unit: 'kg', sale_mode: 'wholesale', wholesale_price: 30, wholesale_min_qty: 100, wholesale_pack_size: null, wholesale_transport_states: ['AP'], wholesale_transport_rates: { AP: { mode: 'per_km', amount: 5 } } } as BulkListing
    const c = checkBulkOrder(lot, 100, 'AP', 0)
    expect(c).toMatchObject({ ok: true, goods: 3000, transport: 0, total: 3000, transportMode: 'per_km', transportRate: 5 })
    const pickup = checkBulkOrder(lot, 100, 'pickup', 0)
    expect(pickup).toMatchObject({ ok: true, transportMode: null, transportRate: null })
  })
})

describe('subscribe highlight', () => {
  const plan = (x: Partial<PlanRow>): PlanRow => ({ id: Math.random().toString(), kind: 'buying', name_en: 'P', duration_days: 30, actual_price: 999, active: true, ...x })
  it('lowest price now, and the best running offer', () => {
    const now = new Date('2026-11-05T00:00:00Z')
    const h = planHighlight([
      plan({ actual_price: 2999, duration_days: 365, kind: 'combined' }),
      plan({ actual_price: 999, offer_enabled: true, offer_price: 499, offer_ends_at: '2026-11-30T00:00:00Z' }),
    ], now)
    expect(h).toMatchObject({ fromPrice: 499, bestOfferPct: 50, allFree: false })
    expect(h?.fromPeriod.en).toBe('1 month')
  })
  it('no plans → nothing to show', () => {
    expect(planHighlight([], new Date())).toBeNull()
  })
  it('the big box is for no plan / ending / ended only', () => {
    expect(['none', 'ending', 'expired'].every(needsSubscribeNudge)).toBe(true)
    expect(['forever', 'active'].some(needsSubscribeNudge)).toBe(false)
  })
})

describe('wired in', () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it('the migration and the schema snapshot agree', () => {
    const sql = (f: string) => src(`scripts/${f}`).replace(/--.*$/gm, '')
    for (const f of ['transport-bill-migration.sql', 'staging-schema.sql']) {
      const s = sql(f)
      for (const c of ['transport_mode', 'transport_rate', 'transport_km', 'transport_bill_amount', 'transport_bill_path', 'transport_billed_at', 'transport_paid_at']) expect(s).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\b`))
      expect(s).toMatch(/transport_mode IN \('per_km', 'cargo_bill'\)/)
    }
    expect(sql('transport-bill-migration.sql')).toMatch(/'cargo-bills', 'cargo-bills', false/)
    expect(sql('storage-buckets-all.sql')).toMatch(/'cargo-bills', 'cargo-bills', false/)
    expect(sql('transport-bill-migration.sql')).not.toMatch(/CREATE POLICY/)
  })
  it('seller and buyer pages show the bill card; dashboard + intro show the subscribe box', () => {
    expect(src('src/app/farmer/dashboard/orders/[id]/page.tsx')).toMatch(/<TransportBillCard[\s\S]{0,200}role="seller"/)
    expect(src('src/app/aggregator/purchases/page.tsx')).toMatch(/<TransportBillCard[^>]*role="buyer"/)
    expect(src('src/components/farmer/SubscriptionStatusCard.tsx')).toMatch(/<SubscribeHighlight[^>]*where="dashboard"/)
    expect(src('src/app/home/aggregator/page.tsx')).toMatch(/<SubscribeHighlight[^>]*where="intro"/)
  })
})

// The wholesale transport question (2026-11-05, widened 2026-11-11) left the
// form on 2026-11-13: bulk delivery follows the produce's Courier setting.
// Old lots saved with per km / cargo bill keep billing after delivery until edited.
describe('no wholesale transport question (client 2026-11-13)', () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it('the component is gone from the codebase', () => {
    expect(() => src('src/components/WholesaleFields.tsx')).toThrow()
  })
})

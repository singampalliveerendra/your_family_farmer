import { describe, it, expect } from 'vitest'
import { markSelfOrder, withoutSelfOrderFlag, produceQuantitySummary } from '@/lib/selfOrder'

// A farmer may order their own produce. The order runs like any other; it is
// only flagged, so the farmer can tell their own orders from buyers' while the
// quantity totals still count both.

describe('markSelfOrder', () => {
  // USE: the farmer's "Your own order" badge and the By-you column read this.
  it('flags every row of a self-order batch', () => {
    const rows = [{ quantity: 1 }, { quantity: 2 }]
    markSelfOrder(rows, true)
    expect(rows.every((r) => (r as Record<string, unknown>).is_self_order === true)).toBe(true)
  })

  // USE: an ordinary checkout must never name the column, or it would fail on
  // a database that hasn't run scripts/self-order-migration.sql.
  it('leaves an ordinary batch untouched', () => {
    const rows: Array<Record<string, unknown>> = [{ quantity: 1 }]
    markSelfOrder(rows, false)
    expect(rows[0]).not.toHaveProperty('is_self_order')
  })
})

describe('withoutSelfOrderFlag', () => {
  it('drops only the flag, and leaves the originals alone', () => {
    const rows: Array<Record<string, unknown>> = [{ quantity: 1, is_self_order: true }]
    const stripped = withoutSelfOrderFlag(rows)
    expect(stripped).toEqual([{ quantity: 1 }])
    expect(rows[0].is_self_order).toBe(true)
  })
})

describe('produceQuantitySummary', () => {
  const o = (produce: string, qty: number, extra: Record<string, unknown> = {}) => ({
    produce_name: produce, unit: 'kg', quantity: qty, status: 'approved', ...extra,
  })

  // USE: the requirement — the farmer sees the full quantity ordered, their
  // own orders included, and can still tell the two apart.
  it('totals buyers and the farmer\'s own orders per produce', () => {
    const summary = produceQuantitySummary([
      o('Tomato', 2),
      o('Tomato', 1.5, { is_self_order: true }),
      o('Tomato', 3, { status: 'pending' }),
      o('Mirchi', 0.25, { is_self_order: true }),
    ])
    expect(summary).toEqual([
      { produce: 'Tomato', unit: 'kg', total: 6.5, buyers: 5, self: 1.5, selfOrders: 1 },
      { produce: 'Mirchi', unit: 'kg', total: 0.25, buyers: 0, self: 0.25, selfOrders: 1 },
    ])
  })

  // USE: declined / cancelled stock went back to the shelf — counting it would
  // overstate what left the farm.
  it('leaves out declined and cancelled orders', () => {
    const summary = produceQuantitySummary([
      o('Tomato', 2),
      o('Tomato', 5, { status: 'declined' }),
      o('Tomato', 4, { status: 'cancelled', is_self_order: true }),
    ])
    expect(summary).toEqual([{ produce: 'Tomato', unit: 'kg', total: 2, buyers: 2, self: 0, selfOrders: 0 }])
  })

  // USE: 0.1 + 0.2 must read 0.3 kg on a farmer's report, not 0.30000000000000004.
  it('adds part-units without float drift', () => {
    const summary = produceQuantitySummary([o('Mirchi', 0.1), o('Mirchi', 0.2, { is_self_order: true })])
    expect(summary[0].total).toBe(0.3)
  })

  it('never adds kilos to bunches', () => {
    const summary = produceQuantitySummary([o('Coriander', 2), o('Coriander', 3, { unit: 'bunch' })])
    expect(summary.map((s) => `${s.total} ${s.unit}`).sort()).toEqual(['2 kg', '3 bunch'])
  })

  it('treats a missing flag (pre-migration rows) as a buyer order', () => {
    const summary = produceQuantitySummary([o('Tomato', 2, { is_self_order: null })])
    expect(summary[0]).toMatchObject({ buyers: 2, self: 0 })
  })

  it('ignores rows with no usable quantity', () => {
    expect(produceQuantitySummary([o('Tomato', 0), o('Tomato', NaN), { ...o('Tomato', 1), quantity: null }])).toEqual([])
  })
})

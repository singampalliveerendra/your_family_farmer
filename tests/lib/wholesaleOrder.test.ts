import { describe, it, expect } from 'vitest'
import {
  BULK_FOR_AGGREGATORS_ONLY,
  WHOLESALE_PICKUP_NOTE,
  WHOLESALE_TRANSPORT_CHARGE_NOTE,
  WHOLESALE_TRANSPORT_NOTE,
  canBuyWholesale,
  checkWholesaleLine,
  offersWholesaleToBuyers,
  snapWholesaleQty,
  wholesaleCartKey,
  wholesaleLineOf,
  wholesaleQtyRules,
  wholesaleStepDown,
  wholesaleStepUp,
} from '@/lib/wholesaleOrder'

const BOTH = (extra: Record<string, unknown> = {}) => ({
  name: 'Tomato', unit: 'kg', sale_step: 1, sale_mode: 'both', wholesale_price: 30,
  wholesale_min_qty: 100, wholesale_pack_size: 25, wholesale_transport_states: ['TG', 'AP'], ...extra,
})

describe('offersWholesaleToBuyers / wholesaleLineOf', () => {
  it('a complete "both" produce is offered', () => {
    expect(offersWholesaleToBuyers(BOTH())).toBe(true)
    expect(wholesaleLineOf(BOTH())).toEqual({ price: 30, minQty: 100, packSize: 25, transportStates: ['AP', 'TG'] })
  })
  it('wholesale-only stays hidden from buyers (decision 2026-11-03)', () => {
    expect(offersWholesaleToBuyers(BOTH({ sale_mode: 'wholesale' }))).toBe(false)
    expect(wholesaleLineOf(BOTH({ sale_mode: 'wholesale' }))).toBeNull()
  })
  it('retail, pre-migration and missing rows are not offered', () => {
    expect(offersWholesaleToBuyers(BOTH({ sale_mode: 'retail' }))).toBe(false)
    expect(offersWholesaleToBuyers({ name: 'x' } as never)).toBe(false)
    expect(offersWholesaleToBuyers(null)).toBe(false)
    expect(offersWholesaleToBuyers(undefined)).toBe(false)
  })
  it('missing or zero price / minimum is not offered', () => {
    expect(offersWholesaleToBuyers(BOTH({ wholesale_price: null }))).toBe(false)
    expect(offersWholesaleToBuyers(BOTH({ wholesale_price: 0 }))).toBe(false)
    expect(offersWholesaleToBuyers(BOTH({ wholesale_min_qty: null }))).toBe(false)
  })
  it('numeric strings from PostgREST are read', () => {
    expect(wholesaleLineOf(BOTH({ wholesale_price: '30.50', wholesale_min_qty: '100.000', wholesale_pack_size: null })))
      .toEqual({ price: 30.5, minQty: 100, packSize: null, transportStates: ['AP', 'TG'] })
  })
  it('a zero pack size reads as no pack', () => {
    expect(wholesaleLineOf(BOTH({ wholesale_pack_size: 0 }))!.packSize).toBeNull()
  })
})

describe('wholesaleQtyRules', () => {
  it('with a pack: step = pack, min = the minimum', () => {
    expect(wholesaleQtyRules({ minQty: 100, packSize: 25 })).toEqual({ min: 100, step: 25 })
  })
  it('without a pack: step = the sale step', () => {
    expect(wholesaleQtyRules({ minQty: 30, packSize: null }, 0.5, 'kg')).toEqual({ min: 30, step: 0.5 })
    expect(wholesaleQtyRules({ minQty: 30, packSize: null })).toEqual({ min: 30, step: 1 })
  })
  it('a minimum off the grid is rounded UP onto it', () => {
    expect(wholesaleQtyRules({ minQty: 2.5, packSize: null }, 1, 'kg')).toEqual({ min: 3, step: 1 })
    expect(wholesaleQtyRules({ minQty: 0.3, packSize: 0.25 })).toEqual({ min: 0.5, step: 0.25 })
  })
  it('float noise does not push the minimum up a step', () => {
    expect(wholesaleQtyRules({ minQty: 0.3, packSize: 0.1 })).toEqual({ min: 0.3, step: 0.1 })
  })
  it('the minimum is never below one step', () => {
    expect(wholesaleQtyRules({ minQty: 0.1, packSize: 25 })).toEqual({ min: 25, step: 25 })
  })
  it('piece units keep whole steps', () => {
    expect(wholesaleQtyRules({ minQty: 10, packSize: null }, 0.5, 'piece')).toEqual({ min: 10, step: 1 })
  })
})

describe('snapWholesaleQty', () => {
  const R = { min: 100, step: 25 }
  it('below the minimum → the minimum', () => {
    expect(snapWholesaleQty(10, R)).toBe(100)
    expect(snapWholesaleQty(0, R)).toBe(100)
    expect(snapWholesaleQty(NaN, R)).toBe(100)
  })
  it('onto the pack grid', () => {
    expect(snapWholesaleQty(110, R)).toBe(100)
    expect(snapWholesaleQty(115, R)).toBe(125)
    expect(snapWholesaleQty(150, R)).toBe(150)
  })
  it('never above stock (whole packs that fit)', () => {
    expect(snapWholesaleQty(500, R, 160)).toBe(150)
  })
  it('stock below the minimum → 0 (cannot buy wholesale)', () => {
    expect(snapWholesaleQty(100, R, 99)).toBe(0)
  })
  it('untracked stock (null) is no limit', () => {
    expect(snapWholesaleQty(1000, R, null)).toBe(1000)
  })
})

describe('wholesaleStepUp / wholesaleStepDown', () => {
  const R = { min: 100, step: 25 }
  it('+ adds a pack, stops at stock', () => {
    expect(wholesaleStepUp(100, R)).toBe(125)
    expect(wholesaleStepUp(150, R, 160)).toBe(150)
    expect(wholesaleStepUp(150, R, 175)).toBe(175)
  })
  it('− removes a pack, and the line below the minimum', () => {
    expect(wholesaleStepDown(150, R)).toBe(125)
    expect(wholesaleStepDown(100, R)).toBe(0)
  })
  it('part-unit steps without float tails', () => {
    expect(wholesaleStepUp(0.3, { min: 0.3, step: 0.1 })).toBe(0.4)
    expect(wholesaleStepDown(0.4, { min: 0.3, step: 0.1 })).toBe(0.3)
  })
})

describe('canBuyWholesale (one harvest\'s stock)', () => {
  it('enough stock → yes', () => {
    expect(canBuyWholesale(BOTH(), 100)).toBe(true)
  })
  it('less than the minimum → no (the low-stock hide)', () => {
    expect(canBuyWholesale(BOTH(), 99)).toBe(false)
    expect(canBuyWholesale(BOTH(), 0)).toBe(false)
  })
  it('untracked stock → yes', () => {
    expect(canBuyWholesale(BOTH(), null)).toBe(true)
    expect(canBuyWholesale(BOTH(), undefined)).toBe(true)
  })
  it('not offered → no, whatever the stock', () => {
    expect(canBuyWholesale(BOTH({ sale_mode: 'retail' }), 10000)).toBe(false)
    expect(canBuyWholesale(BOTH({ sale_mode: 'wholesale' }), 10000)).toBe(false)
  })
  it('uses the rounded-up minimum', () => {
    expect(canBuyWholesale(BOTH({ wholesale_min_qty: 2.5, wholesale_pack_size: null }), 2.5)).toBe(false) // needs 3
    expect(canBuyWholesale(BOTH({ wholesale_min_qty: 2.5, wholesale_pack_size: null }), 3)).toBe(true)
  })
})

describe('wholesaleCartKey', () => {
  it('never the same key as the retail line', () => {
    expect(wholesaleCartKey('h1')).not.toBe('h1')
    expect(wholesaleCartKey('h1')).toBe('h1:wholesale')
  })
})

describe('checkWholesaleLine (server)', () => {
  it('a valid pickup line: wholesale price × qty', () => {
    expect(checkWholesaleLine(BOTH(), 150, 'self_pickup')).toEqual({ ok: true, unitPrice: 30, linePrice: 4500, deliveryType: 'self_pickup' })
  })
  it('delivery asked + farmer transports → farmer delivery (courier), no rider', () => {
    expect(checkWholesaleLine(BOTH(), 100, 'home_delivery')).toMatchObject({ ok: true, deliveryType: 'courier' })
    expect(checkWholesaleLine(BOTH(), 100, 'courier')).toMatchObject({ ok: true, deliveryType: 'courier' })
  })
  it('delivery asked but the farmer does not transport → refused', () => {
    const r = checkWholesaleLine(BOTH({ wholesale_transport_states: [] }), 100, 'home_delivery')
    expect(r).toEqual({ ok: false, error: 'Tomato wholesale is pickup only — the farmer does not transport.' })
  })
  it('below the minimum → refused', () => {
    expect(checkWholesaleLine(BOTH(), 75, 'self_pickup')).toEqual({ ok: false, error: 'Tomato wholesale: order at least 100 kg.' })
  })
  it('not whole packs → refused', () => {
    expect(checkWholesaleLine(BOTH(), 110, 'self_pickup')).toEqual({ ok: false, error: 'Tomato wholesale is sold in packs of 25 kg.' })
  })
  it('no pack: off the sale-step grid → refused', () => {
    const l = BOTH({ wholesale_pack_size: null, wholesale_min_qty: 10, sale_step: 0.5 })
    expect(checkWholesaleLine(l, 10.25, 'self_pickup')).toEqual({ ok: false, error: 'Tomato wholesale is sold in multiples of 0.5 kg.' })
    expect(checkWholesaleLine(l, 10.5, 'self_pickup')).toMatchObject({ ok: true, linePrice: 315 })
  })
  it('wholesale-only, retail or a changed listing → refused', () => {
    expect(checkWholesaleLine(BOTH({ sale_mode: 'wholesale' }), 100, 'self_pickup')).toEqual({ ok: false, error: 'Tomato is not sold wholesale any more.' })
    expect(checkWholesaleLine(BOTH({ sale_mode: 'retail' }), 100, 'self_pickup').ok).toBe(false)
    expect(checkWholesaleLine(BOTH({ wholesale_price: null }), 100, 'self_pickup').ok).toBe(false)
  })
  it('junk quantities → refused', () => {
    for (const q of [NaN, Infinity, -100, 0]) expect(checkWholesaleLine(BOTH(), q, 'self_pickup').ok).toBe(false)
  })
  it('prices round to whole rupees like retail lines', () => {
    expect(checkWholesaleLine(BOTH({ wholesale_price: 30.33, wholesale_pack_size: null, wholesale_min_qty: 1 }), 3, 'self_pickup'))
      .toMatchObject({ ok: true, linePrice: 91 })
  })
  it('the price comes from the produce row, never the cart', () => {
    // There is no price argument at all — checkWholesaleLine only reads the row.
    expect(checkWholesaleLine.length).toBe(3)
  })
})

describe('BULK_FOR_AGGREGATORS_ONLY', () => {
  it('says who bulk is for and what to do', () => {
    expect(BULK_FOR_AGGREGATORS_ONLY.en).toMatch(/only for aggregators/)
    expect(BULK_FOR_AGGREGATORS_ONLY.en).toMatch(/remove/)
  })
})

describe('notes', () => {
  it('both languages', () => {
    for (const m of [BULK_FOR_AGGREGATORS_ONLY, WHOLESALE_TRANSPORT_NOTE, WHOLESALE_TRANSPORT_CHARGE_NOTE, WHOLESALE_PICKUP_NOTE]) {
      expect(m.en).toBeTruthy()
      expect(m.te).toMatch(/[ఀ-౿]/)
    }
  })
})

import { describe, it, expect } from 'vitest'
import { cartKeyOf, wholesaleAddQty, wsRules } from '@/lib/cartLine'

const WS = { price: 30, minQty: 100, packSize: 25, transportStates: ['AP' as const] }

describe('cartKeyOf', () => {
  it('harvest lines key by harvest, legacy lines by produce (unchanged)', () => {
    expect(cartKeyOf({ listingId: 'L1', harvestId: 'H1' })).toBe('H1')
    expect(cartKeyOf({ listingId: 'L1' })).toBe('L1')
  })
  it('a wholesale line never shares the retail line\'s key', () => {
    expect(cartKeyOf({ listingId: 'L1', harvestId: 'H1', wholesale: WS })).toBe('H1:wholesale')
    expect(cartKeyOf({ listingId: 'L1', wholesale: WS })).toBe('L1:wholesale')
    expect(cartKeyOf({ listingId: 'L1', harvestId: 'H1', wholesale: WS })).not.toBe(cartKeyOf({ listingId: 'L1', harvestId: 'H1' }))
  })
  it('two harvests stay two wholesale lines', () => {
    expect(cartKeyOf({ listingId: 'L1', harvestId: 'H1', wholesale: WS })).not.toBe(cartKeyOf({ listingId: 'L1', harvestId: 'H2', wholesale: WS }))
  })
})

describe('wsRules', () => {
  it('pack size is the step', () => {
    expect(wsRules({ wholesale: WS })).toEqual({ min: 100, step: 25 })
  })
  it('no pack → the produce\'s sale step', () => {
    expect(wsRules({ wholesale: { ...WS, packSize: null, minQty: 10 }, saleStep: 0.5, unit: 'kg' })).toEqual({ min: 10, step: 0.5 })
  })
})

describe('wholesaleAddQty (the cart\'s "add")', () => {
  it('first add puts in the minimum', () => {
    expect(wholesaleAddQty({ wholesale: WS }, undefined)).toBe(100)
  })
  it('adding again adds another minimum (the page button), snapped to packs', () => {
    expect(wholesaleAddQty({ wholesale: WS }, 100)).toBe(200)
  })
  it('an explicit amount is snapped onto the pack grid', () => {
    expect(wholesaleAddQty({ wholesale: WS }, 100, 30)).toBe(125)
  })
  it('capped at stock, in whole packs', () => {
    expect(wholesaleAddQty({ wholesale: WS, stockQty: 160 }, 100)).toBe(150)
  })
  it('stock below the minimum → 0 (not added)', () => {
    expect(wholesaleAddQty({ wholesale: WS, stockQty: 99 }, undefined)).toBe(0)
  })
  it('untracked stock is no limit', () => {
    expect(wholesaleAddQty({ wholesale: WS }, 1000, 25)).toBe(1025)
  })
})

import { describe, it, expect } from 'vitest'
import { withoutBulkLines } from '@/lib/cartLine'

// A household cart never keeps a bulk line (decision 2026-11-04).

const RETAIL = { listingId: 'L1', harvestId: 'H1', qty: 2 }
const WS = { price: 30, minQty: 100, packSize: 25, transportStates: ['AP'] }

describe('withoutBulkLines', () => {
  it('keeps ordinary retail lines untouched', () => {
    const cart = { H1: RETAIL, L2: { listingId: 'L2', qty: 1 } }
    expect(withoutBulkLines(cart)).toEqual(cart)
  })
  it('drops a saved "Buy wholesale" line, keeps the retail line of the same harvest', () => {
    const cart = { H1: RETAIL, 'H1:wholesale': { ...RETAIL, qty: 100, wholesale: WS } }
    expect(withoutBulkLines(cart)).toEqual({ H1: RETAIL })
  })
  it('drops by key alone and by the wholesale field alone', () => {
    expect(withoutBulkLines({ 'L1:wholesale': { listingId: 'L1', qty: 100 } })).toEqual({})
    expect(withoutBulkLines({ odd: { listingId: 'L1', qty: 100, wholesale: WS } })).toEqual({})
  })
  it('an empty or junk cart reads as empty, never throws', () => {
    expect(withoutBulkLines({})).toEqual({})
    expect(withoutBulkLines(null as never)).toEqual({})
    expect(withoutBulkLines({ a: null, b: 5 } as never)).toEqual({})
  })
  it('does not change the cart it was given', () => {
    const cart = { 'H1:wholesale': { ...RETAIL, wholesale: WS } }
    withoutBulkLines(cart)
    expect(Object.keys(cart)).toEqual(['H1:wholesale'])
  })
})

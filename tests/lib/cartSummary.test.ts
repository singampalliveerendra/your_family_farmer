import { describe, it, expect } from 'vitest'
import { summarizeCart, cartGrew } from '@/lib/cartSummary'

describe('summarizeCart', () => {
  // A 2.5 kg line is one item on the bar, not "2.5 items" — the old FAB
  // summed quantities and read oddly for part-unit produce.
  it('counts lines, not quantity', () => {
    expect(summarizeCart([{ qty: 2.5, pricePerKg: 40 }, { qty: 0.25, pricePerKg: 120 }]).lines).toBe(2)
  })

  // Rounded to the rupee like the cart page's subtotal, so the bar and the
  // checkout screen show the same number.
  it('rounds the subtotal to the rupee', () => {
    expect(summarizeCart([{ qty: 0.25, pricePerKg: 42 }, { qty: 1, pricePerKg: 30 }]).subtotal).toBe(41)
  })

  // A line with no price (should not happen, but legacy lines exist) counts
  // as an item and adds nothing — never NaN on the bar.
  it('treats a missing price as zero', () => {
    expect(summarizeCart([{ qty: 3 }, { qty: 1, pricePerKg: 50 }])).toEqual({ lines: 2, subtotal: 50 })
  })

  it('is empty for an empty cart', () => {
    expect(summarizeCart([])).toEqual({ lines: 0, subtotal: 0 })
  })
})

describe('cartGrew', () => {
  it('fires on a brand-new line', () => {
    expect(cartGrew({}, { a: { qty: 1 } })).toBe(true)
  })

  it('fires when an existing line goes up', () => {
    expect(cartGrew({ a: { qty: 1 } }, { a: { qty: 1.5 } })).toBe(true)
  })

  // Lowering a qty or removing a line is not an "add" — no bump.
  it('stays quiet on decreases and removals', () => {
    expect(cartGrew({ a: { qty: 2 } }, { a: { qty: 1 } })).toBe(false)
    expect(cartGrew({ a: { qty: 2 }, b: { qty: 1 } }, { a: { qty: 2 } })).toBe(false)
    expect(cartGrew({ a: { qty: 1 } }, {})).toBe(false)
  })

  it('stays quiet when nothing changed', () => {
    expect(cartGrew({ a: { qty: 1 } }, { a: { qty: 1 } })).toBe(false)
  })
})

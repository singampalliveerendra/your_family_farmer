import { describe, it, expect } from 'vitest'
import {
  roundQty, normalizeStep, snapToStep, stepUp, stepDown, formatQty,
  unitAllowsFractions, DEFAULT_STEP, STEP_CHOICES,
} from '@/lib/saleStep'

// Quantities are money-adjacent: qty × price is the line total, and a binary
// floating-point tail both mis-prices the line and renders as "0.7500000000001 kg".

describe('roundQty', () => {
  it('kills the floating-point tail at three decimals', () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3)
    expect(roundQty(0.25 * 3)).toBe(0.75)
    expect(roundQty(1.0005)).toBe(1.001)
  })
})

describe('unitAllowsFractions', () => {
  it('refuses fractions of things that cannot be split', () => {
    for (const u of ['piece', 'pieces', 'bunch', 'dozen', 'eggs', 'NOS', ' Piece ']) {
      expect(unitAllowsFractions(u)).toBe(false)
    }
  })

  it('allows fractions of weighable produce, and defaults to kg', () => {
    for (const u of ['kg', 'gram', 'litre', null, undefined]) {
      expect(unitAllowsFractions(u)).toBe(true)
    }
  })
})

describe('normalizeStep', () => {
  it('defaults to 1 for an absent or nonsensical step', () => {
    for (const s of [null, undefined, 0, -1, NaN]) {
      expect(normalizeStep(s)).toBe(DEFAULT_STEP)
    }
  })

  it('keeps a fractional step on a divisible unit', () => {
    expect(normalizeStep(0.25, 'kg')).toBe(0.25)
  })

  it('rounds a fractional step up to a whole one on an indivisible unit', () => {
    // You cannot sell a quarter of an egg.
    expect(normalizeStep(0.25, 'piece')).toBe(1)
    expect(normalizeStep(2.4, 'dozen')).toBe(2)
  })

  it('offers only steps a farmer can actually weigh', () => {
    expect(STEP_CHOICES.map((c) => c.value)).toEqual([1, 0.5, 0.25, 0.1])
  })
})

describe('snapToStep', () => {
  it('snaps a typed quantity onto the grid', () => {
    expect(snapToStep(0.4, 0.25)).toBe(0.5)
    expect(snapToStep(0.3, 0.25)).toBe(0.25)
    expect(snapToStep(1.1, 0.5)).toBe(1)
  })

  it('never returns less than one whole step', () => {
    expect(snapToStep(0.01, 0.25)).toBe(0.25)
    expect(snapToStep(0, 0.25)).toBe(0.25)
    expect(snapToStep(-5, 0.25)).toBe(0.25)
    expect(snapToStep(NaN, 0.25)).toBe(0.25)
  })

  it('steps DOWN to fit stock rather than overselling', () => {
    expect(snapToStep(10, 0.25, 1.6)).toBe(1.5)
    expect(snapToStep(10, 1, 3)).toBe(3)
  })

  it('falls back to the remaining stock when even one step will not fit', () => {
    expect(snapToStep(10, 1, 0.4)).toBe(0.4)
  })

  it('treats a zero or negative step as 1', () => {
    expect(snapToStep(2.6, 0)).toBe(3)
    expect(snapToStep(2.6, -1)).toBe(3)
  })
})

describe('stepUp / stepDown', () => {
  it('walks the grid without drift', () => {
    let q = 0
    for (let i = 0; i < 10; i += 1) q = stepUp(q, 0.1)
    expect(q).toBe(1) // not 0.9999999999999999
  })

  it('caps at stock instead of exceeding it', () => {
    expect(stepUp(1.5, 0.25, 1.6)).toBe(1.5)
    expect(stepUp(2, 1, 1.5)).toBe(1.5)
  })

  it('clears the line on the last "minus" tap', () => {
    // Below one step is unsellable, so the cart reads 0 as "remove".
    expect(stepDown(0.25, 0.25)).toBe(0)
    expect(stepDown(0.5, 0.25)).toBe(0.25)
    expect(stepDown(0, 0.25)).toBe(0)
  })
})

describe('formatQty', () => {
  it('reads the way a buyer writes it', () => {
    expect(formatQty(1)).toBe('1')
    expect(formatQty(1.5)).toBe('1.5')
    expect(formatQty(0.25)).toBe('0.25')
    expect(formatQty(0.1 + 0.2)).toBe('0.3')
  })

  it('is empty for a missing quantity rather than showing NaN', () => {
    expect(formatQty(null)).toBe('')
    expect(formatQty(undefined)).toBe('')
    expect(formatQty(NaN)).toBe('')
  })
})

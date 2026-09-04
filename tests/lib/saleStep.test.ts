import { describe, it, expect } from 'vitest'
import {
  roundQty, normalizeStep, snapToStep, stepUp, stepDown, formatQty,
  unitAllowsFractions, DEFAULT_STEP, STEP_CHOICES,
} from '@/lib/saleStep'

// Quantities are money-adjacent: qty × price is the line total, and a binary
// floating-point tail both mis-prices the line and renders as "0.7500000000001 kg".

describe('roundQty', () => {
  // 0.1 + 0.2 becomes exactly 0.3, so a line never renders as
  // '0.30000000000000004 kg' or prices off that value.
  it('kills the floating-point tail at three decimals', () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3)
    expect(roundQty(0.25 * 3)).toBe(0.75)
    expect(roundQty(1.0005)).toBe(1.001)
  })
})

describe('unitAllowsFractions', () => {
  // Pieces, bunches, dozens and eggs cannot be sold in halves, in any spelling
  // or casing.
  it('refuses fractions of things that cannot be split', () => {
    for (const u of ['piece', 'pieces', 'bunch', 'dozen', 'eggs', 'NOS', ' Piece ']) {
      expect(unitAllowsFractions(u)).toBe(false)
    }
  })

  // kg, gram and litre can be sold in fractions, and a missing unit is treated
  // as kg.
  it('allows fractions of weighable produce, and defaults to kg', () => {
    for (const u of ['kg', 'gram', 'litre', null, undefined]) {
      expect(unitAllowsFractions(u)).toBe(true)
    }
  })
})

describe('normalizeStep', () => {
  // A missing, zero or negative step size falls back to one whole unit.
  it('defaults to 1 for an absent or nonsensical step', () => {
    for (const s of [null, undefined, 0, -1, NaN]) {
      expect(normalizeStep(s)).toBe(DEFAULT_STEP)
    }
  })

  // 250g steps are allowed on kg produce. This is the 'sell 250g of mirchi'
  // feature.
  it('keeps a fractional step on a divisible unit', () => {
    expect(normalizeStep(0.25, 'kg')).toBe(0.25)
  })

  // A fractional step on a countable unit is rounded to a whole one.
  it('rounds a fractional step up to a whole one on an indivisible unit', () => {
    // You cannot sell a quarter of an egg.
    expect(normalizeStep(0.25, 'piece')).toBe(1)
    expect(normalizeStep(2.4, 'dozen')).toBe(2)
  })

  // The dropdown offers exactly 1, 0.5, 0.25 and 0.1, and nothing else.
  it('offers only steps a farmer can actually weigh', () => {
    expect(STEP_CHOICES.map((c) => c.value)).toEqual([1, 0.5, 0.25, 0.1])
  })
})

describe('snapToStep', () => {
  // A hand-typed 0.4kg with 250g steps becomes 0.5, and 0.3 becomes 0.25:
  // always the nearest valid step.
  it('snaps a typed quantity onto the grid', () => {
    expect(snapToStep(0.4, 0.25)).toBe(0.5)
    expect(snapToStep(0.3, 0.25)).toBe(0.25)
    expect(snapToStep(1.1, 0.5)).toBe(1)
  })

  // Zero, negative or NaN input becomes one full step, the smallest amount
  // that can actually be sold.
  it('never returns less than one whole step', () => {
    expect(snapToStep(0.01, 0.25)).toBe(0.25)
    expect(snapToStep(0, 0.25)).toBe(0.25)
    expect(snapToStep(-5, 0.25)).toBe(0.25)
    expect(snapToStep(NaN, 0.25)).toBe(0.25)
  })

  // Wanting more than there is drops to the largest valid step that fits, so
  // the farmer never oversells.
  it('steps DOWN to fit stock rather than overselling', () => {
    expect(snapToStep(10, 0.25, 1.6)).toBe(1.5)
    expect(snapToStep(10, 1, 3)).toBe(3)
  })

  // If a whole step is more than what is left, the buyer gets exactly the
  // remaining stock.
  it('falls back to the remaining stock when even one step will not fit', () => {
    expect(snapToStep(10, 1, 0.4)).toBe(0.4)
  })

  // A broken step value is treated as 1 instead of dividing by zero.
  it('treats a zero or negative step as 1', () => {
    expect(snapToStep(2.6, 0)).toBe(3)
    expect(snapToStep(2.6, -1)).toBe(3)
  })
})

describe('stepUp / stepDown', () => {
  // Tapping + ten times at 0.1 lands on exactly 1, not 0.9999999999999999.
  it('walks the grid without drift', () => {
    let q = 0
    for (let i = 0; i < 10; i += 1) q = stepUp(q, 0.1)
    expect(q).toBe(1) // not 0.9999999999999999
  })

  // The + button stops at whatever stock is available.
  it('caps at stock instead of exceeding it', () => {
    expect(stepUp(1.5, 0.25, 1.6)).toBe(1.5)
    expect(stepUp(2, 1, 1.5)).toBe(1.5)
  })

  // Tapping - on the smallest quantity takes it to 0, which the cart reads as
  // 'remove this line'.
  it('clears the line on the last "minus" tap', () => {
    // Below one step is unsellable, so the cart reads 0 as "remove".
    expect(stepDown(0.25, 0.25)).toBe(0)
    expect(stepDown(0.5, 0.25)).toBe(0.25)
    expect(stepDown(0, 0.25)).toBe(0)
  })
})

describe('formatQty', () => {
  // Display formatting: 1, 1.5, 0.25. No trailing zeros and no float noise.
  it('reads the way a buyer writes it', () => {
    expect(formatQty(1)).toBe('1')
    expect(formatQty(1.5)).toBe('1.5')
    expect(formatQty(0.25)).toBe('0.25')
    expect(formatQty(0.1 + 0.2)).toBe('0.3')
  })

  // A missing quantity renders as an empty box, never the text 'NaN'.
  it('is empty for a missing quantity rather than showing NaN', () => {
    expect(formatQty(null)).toBe('')
    expect(formatQty(undefined)).toBe('')
    expect(formatQty(NaN)).toBe('')
  })
})

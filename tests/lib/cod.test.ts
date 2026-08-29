import { describe, it, expect } from 'vitest'
import { computeCodSplit } from '@/lib/cod'

// Part-paid COD. Two invariants carry real money:
//   1. deposit + balanceDue === the full order total, always.
//   2. the deposit is never below the platform fee, or the moderator's
//      commission silently stops being collected on COD orders.

describe('computeCodSplit', () => {
  it('splits by percentage of the produce line', () => {
    const { deposit, balanceDue } = computeCodSplit(1000, 50, 30, 10)
    expect(deposit).toBe(100) // 10% of the 1000 line
    expect(balanceDue).toBe(980) // 1080 total - 100
  })

  it('rounds the deposit UP so the cash balance is never a fraction', () => {
    expect(computeCodSplit(155, 0, 0, 10).deposit).toBe(16) // 15.5 -> 16
    expect(computeCodSplit(101, 0, 0, 10).deposit).toBe(11) // 10.1 -> 11
  })

  it('floors the deposit at the platform fee on small orders', () => {
    // 10% of 100 is 10, less than the 25 commission — so the fee sets the floor.
    const { deposit, balanceDue } = computeCodSplit(100, 25, 0, 10)
    expect(deposit).toBe(25)
    expect(balanceDue).toBe(100)
  })

  it('lets the fee floor dominate a tiny produce line', () => {
    // 10% of a 10 line is 1, far below the 50 commission, so the deposit is
    // the fee. The buyer prepays 50 of a 60 total and hands over 10 in cash.
    expect(computeCodSplit(10, 50, 0, 10)).toEqual({ deposit: 50, balanceDue: 10 })
  })

  it('caps the deposit at the total when the percentage is misconfigured above 100', () => {
    // Guards against a fat-fingered settings row billing more than the order.
    const { deposit, balanceDue } = computeCodSplit(1000, 0, 0, 150)
    expect(deposit).toBe(1000)
    expect(balanceDue).toBe(0)
  })

  it('treats a 0 or missing percentage as part-payment switched off', () => {
    expect(computeCodSplit(1000, 0, 0, 0)).toEqual({ deposit: 0, balanceDue: 1000 })
    expect(computeCodSplit(1000, 0, 0, NaN)).toEqual({ deposit: 0, balanceDue: 1000 })
    expect(computeCodSplit(1000, 0, 0, -10)).toEqual({ deposit: 0, balanceDue: 1000 })
  })

  it('still collects the fee floor even at 100% deposit', () => {
    expect(computeCodSplit(1000, 50, 30, 100)).toEqual({ deposit: 1000, balanceDue: 80 })
  })

  it('is all zeroes for an empty order', () => {
    expect(computeCodSplit(0, 0, 0, 10)).toEqual({ deposit: 0, balanceDue: 0 })
  })

  it('clamps negative inputs instead of paying money out', () => {
    expect(computeCodSplit(-500, 0, 0, 10)).toEqual({ deposit: 0, balanceDue: 0 })
    // A negative fee must not drag the total below the produce line.
    expect(computeCodSplit(100, -50, 0, 10)).toEqual({ deposit: 10, balanceDue: 90 })
  })

  it('always sums back to the full total', () => {
    const cases: Array<[number, number, number, number]> = [
      [1000, 50, 30, 10], [155, 12, 0, 10], [1, 0, 0, 50],
      [100, 25, 0, 10], [10, 50, 0, 10], [999, 49, 15, 33],
    ]
    for (const [line, fee, delivery, pct] of cases) {
      const { deposit, balanceDue } = computeCodSplit(line, fee, delivery, pct)
      expect(deposit + balanceDue).toBe(line + fee + delivery)
      expect(deposit).toBeGreaterThanOrEqual(0)
      expect(balanceDue).toBeGreaterThanOrEqual(0)
    }
  })
})

import { describe, it, expect } from 'vitest'
import { computePlatformFee } from '@/lib/platform-fee'

// The moderator's commission. Its fallback behaviour matters as much as its
// maths: an unmigrated settings table must yield 0, never NaN, or the whole
// order total becomes NaN and checkout dies.

describe('computePlatformFee', () => {
  // 5% of Rs1000 is Rs50, and half-rupee results round up. The app never shows
  // paise.
  it('takes the percentage and rounds to whole rupees', () => {
    expect(computePlatformFee(1000, 5)).toBe(50)
    expect(computePlatformFee(250, 5)).toBe(13) // 12.5 rounds up
    expect(computePlatformFee(150, 5)).toBe(8) // 7.5 rounds up
  })

  // A fee of 0, a negative, NaN or Infinity all produce Rs0 rather than a
  // garbage charge on the order.
  it('is 0 whenever the fee is switched off or nonsensical', () => {
    expect(computePlatformFee(1000, 0)).toBe(0)
    expect(computePlatformFee(1000, -5)).toBe(0)
    expect(computePlatformFee(1000, NaN)).toBe(0)
    expect(computePlatformFee(1000, Infinity)).toBe(0)
  })

  // Nothing in the cart means no commission.
  it('is 0 for an empty or negative subtotal', () => {
    expect(computePlatformFee(0, 5)).toBe(0)
    expect(computePlatformFee(-100, 5)).toBe(0)
  })

  // Whatever rubbish goes in, the answer is always a real number. A NaN here
  // would spread into the order total and kill checkout.
  it('never returns NaN, whatever it is handed', () => {
    for (const fee of [
      computePlatformFee(NaN, 5),
      computePlatformFee(1000, NaN),
      computePlatformFee(NaN, NaN),
    ]) {
      expect(Number.isFinite(fee)).toBe(true)
    }
  })
})

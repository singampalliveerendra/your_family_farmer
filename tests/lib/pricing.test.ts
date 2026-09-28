import { describe, it, expect } from 'vitest'
import { getTierPrice, type TierInputs } from '@/lib/pricing'

// getTierPrice runs on BOTH the client cart and the server place-order route.
// If the two ever disagree the buyer sees one total and is charged another, so
// the ladder below is the contract that keeps them in lockstep.

const flat: TierInputs = { pricePerKg: 80 }

const threeTier: TierInputs = {
  pricePerKg: 100,
  priceTier1Qty: 2,
  priceTier1Price: 90,
  priceTier2Qty: 5,
  priceTier2Price: 80,
  priceTier3Price: 70,
}

describe('getTierPrice', () => {
  // With no bulk tiers set up, every quantity is charged the plain per-kg
  // price.
  it('falls back to the flat price when no tiers are configured', () => {
    expect(getTierPrice(1, flat)).toBe(80)
    expect(getTierPrice(100, flat)).toBe(80)
  })

  // No price configured returns null (the caller then hides the buy button)
  // rather than 0, which would give the produce away free.
  it('returns null when there is no price at all', () => {
    expect(getTierPrice(1, {})).toBeNull()
    expect(getTierPrice(1, { pricePerKg: null })).toBeNull()
  })

  // A tier with a quantity but no price, or a price but no quantity, is
  // incomplete, so it is ignored and the flat price applies.
  it('ignores a half-configured tier 1 and uses the flat price', () => {
    expect(getTierPrice(5, { pricePerKg: 80, priceTier1Qty: 2 })).toBe(80)
    expect(getTierPrice(5, { pricePerKg: 80, priceTier1Price: 90 })).toBe(80)
  })

  // The main bulk-discount path: up to 2kg Rs90, up to 5kg Rs80, above that
  // Rs70. A quantity landing exactly on a boundary gets the cheaper tier.
  it('walks the three-tier ladder, boundaries inclusive', () => {
    expect(getTierPrice(1, threeTier)).toBe(90)
    expect(getTierPrice(2, threeTier)).toBe(90) // tier-1 boundary is inclusive
    expect(getTierPrice(2.5, threeTier)).toBe(80)
    expect(getTierPrice(5, threeTier)).toBe(80) // tier-2 boundary is inclusive
    expect(getTierPrice(5.1, threeTier)).toBe(70)
    expect(getTierPrice(50, threeTier)).toBe(70)
  })

  // Buying past the tier-1 limit when no higher tier exists keeps the tier-1
  // price rather than jumping back to the flat price.
  it('never charges tier 1 above its own quantity, even with tiers 2 and 3 absent', () => {
    const t1Only: TierInputs = { pricePerKg: 100, priceTier1Qty: 2, priceTier1Price: 90 }
    expect(getTierPrice(3, t1Only)).toBe(90)
  })

  // If tier 3 was never priced, large quantities stay at the tier-2 rate.
  it('holds tier 2 past its quantity when tier 3 has no price', () => {
    const noT3: TierInputs = { ...threeTier, priceTier3Price: null }
    expect(getTierPrice(50, noT3)).toBe(80)
  })

  // A gap in the middle of the ladder is fine: tier 1, then straight to tier 3.
  it('skips straight to tier 3 when tier 2 is not configured', () => {
    const skipT2: TierInputs = {
      pricePerKg: 100, priceTier1Qty: 2, priceTier1Price: 90, priceTier3Price: 70,
    }
    expect(getTierPrice(3, skipT2)).toBe(70)
  })

  // An empty quantity shows the starting (dearest) tier price, not the bulk
  // discount.
  it('does not let a zero quantity fall through to a cheaper tier', () => {
    expect(getTierPrice(0, threeTier)).toBe(90)
  })
})

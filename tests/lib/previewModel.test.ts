import { describe, it, expect } from 'vitest'
import {
  previewNum,
  resolveSaleStep,
  previewAvailability,
  previewTiers,
} from '@/lib/previewModel'

// The farmer's buyer-preview. Its whole promise is that what it shows is what
// the BUYER will see, so the failures worth guarding against are the ones where
// it quietly lies: a live listing previewed as sold out, a gram listing priced
// "/kg", or a step the farmer picked that never reaches the saved row.
//
// A preview is also looked at while the form is HALF FILLED — that is when it
// is most useful — so most of these cases are partly-typed input rather than
// complete listings.

describe('previewNum', () => {
  // An untouched numeric field on this form arrives as an em-dash, not as an
  // empty string. Reading it as 0 would preview a perfectly stocked listing as
  // "Sold out", which is the one state a farmer would panic about.
  it('treats an untouched field as unknown, not as zero', () => {
    expect(previewNum('—')).toBeNull()
    expect(previewNum('')).toBeNull()
    expect(previewNum('   ')).toBeNull()
    expect(previewNum(null)).toBeNull()
    expect(previewNum(undefined)).toBeNull()
  })

  // Half-typed and non-numeric text must not reach the card as "NaN kg left".
  it('returns null for anything that is not a number', () => {
    expect(previewNum('abc')).toBeNull()
    expect(previewNum('1.2.3')).toBeNull()
  })

  // Real values, including the fractional stock a part-unit listing has.
  it('reads a real quantity, fractions included', () => {
    expect(previewNum('4')).toBe(4)
    expect(previewNum('0.25')).toBe(0.25)
    expect(previewNum(' 12 ')).toBe(12)
  })

  // A genuine zero is NOT the same as a blank field — it means sold out, and
  // the preview should say so.
  it('keeps a real zero distinct from a blank field', () => {
    expect(previewNum('0')).toBe(0)
  })
})

describe('resolveSaleStep', () => {
  // The heart of the 5d2a176 fix: the step the farmer picks has to survive
  // into what is saved. This one function now answers for the preview and for
  // both save paths, so they cannot disagree the way insert and edit once did.
  it('keeps the step the farmer picked on a weighable unit', () => {
    expect(resolveSaleStep('kg', '0.25')).toBe(0.25)
    expect(resolveSaleStep('kg', 0.5)).toBe(0.5)
    expect(resolveSaleStep('gram', '0.1')).toBe(0.1)
  })

  // There is no quarter of an egg, so a fractional step on a countable unit is
  // forced back to a whole one however the form was left.
  it('forces a whole step on units that cannot be split', () => {
    expect(resolveSaleStep('piece', '0.25')).toBe(1)
    expect(resolveSaleStep('bunch', 0.5)).toBe(1)
    expect(resolveSaleStep('dozen', '0.1')).toBe(1)
  })

  // 1 is how every listing behaved before sale_step existed, so anything
  // unusable means 1 rather than 0 — a step of 0 would make "+" do nothing.
  it('falls back to 1 for an unset, zero or unreadable step', () => {
    for (const bad of ['', '0', 'abc', 0, NaN]) {
      expect(resolveSaleStep('kg', bad)).toBe(1)
    }
  })

  // A missing unit is treated as kg elsewhere in the app, so a step still
  // applies rather than being silently discarded.
  it('still honours the step when no unit has been chosen', () => {
    expect(resolveSaleStep(null, '0.25')).toBe(0.25)
    expect(resolveSaleStep(undefined, '0.5')).toBe(0.5)
  })
})

describe('previewAvailability', () => {
  // Both preview faces derive these two flags, and they used to be written out
  // twice — once per view — which is how they drift apart.
  it('is sold out only at a real zero, never at an unknown stock', () => {
    expect(previewAvailability(0, null).soldOut).toBe(true)
    expect(previewAvailability(null, null).soldOut).toBe(false)
    expect(previewAvailability(5, null).soldOut).toBe(false)
  })

  // "+" greys out on the last unit the farmer actually has.
  it('caps the stepper when the quantity reaches stock', () => {
    expect(previewAvailability(2, 2).atMax).toBe(true)
    expect(previewAvailability(2, 1.75).atMax).toBe(false)
    expect(previewAvailability(2, 3).atMax).toBe(true)
  })

  // With stock unknown or nothing added yet there is nothing to cap against,
  // so the button stays live rather than locking the farmer out of the demo.
  it('does not cap while stock is unknown or nothing is added', () => {
    expect(previewAvailability(null, 5).atMax).toBe(false)
    expect(previewAvailability(5, null).atMax).toBe(false)
  })
})

describe('previewTiers', () => {
  const form = {
    price: '100', tier1Qty: '2', tier2Qty: '5', price2: '90', price3: '80',
  }

  // The complete ladder, in the order the buyer's page lists it.
  it('builds the full three-row ladder', () => {
    expect(previewTiers(form)).toEqual([
      { kind: 'base', qty: 2, price: 100 },
      { kind: 'mid', qty: 5, price: 90 },
      { kind: 'bulk', qty: null, price: 80 },
    ])
  })

  // The common case while typing: a price and nothing else. One row, not a
  // half-built table.
  it('shows just the base row when only a price has been typed', () => {
    expect(previewTiers({ ...form, tier1Qty: '', tier2Qty: '', price2: '', price3: '' }))
      .toEqual([{ kind: 'base', qty: 1, price: 100 }])
  })

  // No price yet means no ladder at all — the base row IS the price.
  it('shows no ladder before a price exists', () => {
    expect(previewTiers({ ...form, price: '—' })).toEqual([
      { kind: 'mid', qty: 5, price: 90 },
      { kind: 'bulk', qty: null, price: 80 },
    ])
  })

  // A tier needs BOTH halves. Half of one is a farmer mid-typing, and showing
  // it would preview a discount that does not exist.
  it('ignores a tier with only its quantity or only its price', () => {
    expect(previewTiers({ ...form, price2: '', price3: '' })).toHaveLength(1)
    expect(previewTiers({ ...form, tier2Qty: '', price3: '' })).toHaveLength(1)
  })

  // Bulk is open-ended — a price with no quantity of its own.
  it('carries bulk with no quantity', () => {
    const bulk = previewTiers(form).find((t) => t.kind === 'bulk')
    expect(bulk).toEqual({ kind: 'bulk', qty: null, price: 80 })
  })

  // Part-unit listings price in fractions too, so the ladder must not round.
  it('keeps fractional tier quantities intact', () => {
    expect(previewTiers({ ...form, tier1Qty: '0.5', tier2Qty: '2.5' })).toEqual([
      { kind: 'base', qty: 0.5, price: 100 },
      { kind: 'mid', qty: 2.5, price: 90 },
      { kind: 'bulk', qty: null, price: 80 },
    ])
  })

  // A tier-1 quantity of 0 would render "Up to 0 kg", so it falls back to 1.
  it('never heads the ladder with a zero quantity', () => {
    expect(previewTiers({ ...form, tier1Qty: '0' })[0]).toEqual({ kind: 'base', qty: 1, price: 100 })
  })
})

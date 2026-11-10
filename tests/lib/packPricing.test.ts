import { describe, it, expect } from 'vitest'
import { getTierPrice } from '@/lib/pricing'
import {
  legacyColumnsForPack,
  normalizeTiers,
  packLabel,
  packLinePrice,
  pricePerPack,
  resolveRetailPack,
  retailPackChoices,
  retailPackFormFromRow,
  unitAllowsRetailPacks,
  wholePacks,
} from '@/lib/packPricing'

// Client card 2026-11-10: retail packs for kg/gram (fixed list), price per
// pack, buy-more tiers in packs; optional (no pack = sold loose as before).

describe('pack sizes', () => {
  it('only kg and gram get retail packs', () => {
    expect(unitAllowsRetailPacks('kg')).toBe(true)
    expect(unitAllowsRetailPacks('gram')).toBe(true)
    expect(unitAllowsRetailPacks('g')).toBe(true) // the moderator form's spelling
    for (const u of ['piece', 'bunch', 'litre', '', null]) expect(unitAllowsRetailPacks(u)).toBe(false)
  })
  it('the fixed list, stored in the listing unit', () => {
    expect(retailPackChoices('kg')).toEqual([
      { value: 0.1, label: '100 g' }, { value: 0.25, label: '250 g' }, { value: 0.5, label: '500 g' },
      { value: 1, label: '1 kg' }, { value: 2, label: '2 kg' }, { value: 5, label: '5 kg' },
    ])
    expect(retailPackChoices('gram').map((c) => c.value)).toEqual([100, 250, 500, 1000, 2000, 5000])
    expect(retailPackChoices('piece')).toEqual([])
  })
  it('labels read like a buyer would say them', () => {
    expect(packLabel(0.25, 'kg')).toBe('250 g')
    expect(packLabel(1, 'kg')).toBe('1 kg')
    expect(packLabel(2000, 'gram')).toBe('2 kg')
    expect(packLabel(25, 'kg')).toBe('25 kg')
    expect(packLabel(12, 'piece')).toBe('12 piece')
  })
  it('whole packs only, tolerant of float noise', () => {
    expect(wholePacks(0.75, 0.25)).toBe(3)
    expect(wholePacks(0.1 + 0.2, 0.1)).toBe(3)
    expect(wholePacks(0.3, 0.25)).toBeNull()
    expect(wholePacks(0, 0.25)).toBeNull()
  })
})

describe('buy more, save more', () => {
  const tiers = [{ min_packs: 5, price: 22 }, { min_packs: 10, price: 20 }]
  it('the best tier reached, else the base', () => {
    expect(pricePerPack(1, 25, tiers)).toBe(25)
    expect(pricePerPack(4, 25, tiers)).toBe(25)
    expect(pricePerPack(5, 25, tiers)).toBe(22)
    expect(pricePerPack(12, 25, tiers)).toBe(20)
  })
  it('stored tiers are cleaned: bad rows dropped, sorted, at most 2', () => {
    expect(normalizeTiers([{ min_packs: 10, price: 20 }, { min_packs: 5, price: 22 }, { min_packs: 1, price: 1 }, 'x', { min_packs: 20, price: 18 }]))
      .toEqual([{ min_packs: 5, price: 22 }, { min_packs: 10, price: 20 }])
    expect(normalizeTiers(null)).toEqual([])
  })
})

describe('packLinePrice — what an order is charged', () => {
  const L = { unit: 'kg', retail_pack_size: 0.25, retail_pack_price: 25, retail_pack_tiers: [{ min_packs: 5, price: 22 }] }
  it('packs × price per pack, tier included', () => {
    expect(packLinePrice(0.75, L)).toEqual({ ok: true, packs: 3, perPack: 25, total: 75 })
    expect(packLinePrice(1.25, L)).toEqual({ ok: true, packs: 5, perPack: 22, total: 110 })
  })
  it('₹10 for 300 g stays ₹10 — no per-kg rounding', () => {
    expect(packLinePrice(0.3, { unit: 'kg', retail_pack_size: 0.3, retail_pack_price: 10 })).toMatchObject({ total: 10 })
  })
  it('not a whole number of packs → refused', () => {
    expect(packLinePrice(0.3, L)).toEqual({ ok: false, error: 'sold in packs of 250 g' })
  })
  it('a loose listing → null (old per-unit pricing applies)', () => {
    expect(packLinePrice(2, { unit: 'kg' })).toBeNull()
    expect(packLinePrice(2, { unit: 'kg', retail_pack_size: 0.25 })).toBeNull()
  })
})

describe('resolveRetailPack — the form', () => {
  const ok = (x: object) => resolveRetailPack({ unit: 'kg', packSize: '0.25', packPrice: '25', ...x })
  it('blank pack size = sold loose, everything cleared', () => {
    expect(resolveRetailPack({ unit: 'kg', packSize: '', packPrice: '25' })).toEqual({ ok: true, columns: { retail_pack_size: null, retail_pack_price: null, retail_pack_tiers: [] } })
  })
  it('a good pack with tiers; blank tier rows ignored', () => {
    expect(ok({ tiers: [{ minPacks: '5', price: '22' }, { minPacks: '', price: '' }, { minPacks: '10', price: '20.005' }] })).toEqual({
      ok: true,
      columns: { retail_pack_size: 0.25, retail_pack_price: 25, retail_pack_tiers: [{ min_packs: 5, price: 22 }, { min_packs: 10, price: 20.01 }] },
    })
  })
  it.each([
    [{ unit: 'piece' }, /only be set for kg or gram/],
    [{ packSize: '0.3' }, /from the list/],
    [{ packPrice: '' }, /price of one pack/],
    [{ packPrice: '0' }, /above 0/],
    [{ packPrice: '9999999' }, /too high/],
    [{ tiers: [{ minPacks: '1', price: '20' }] }, /2 or more/],
    [{ tiers: [{ minPacks: '2.5', price: '20' }] }, /whole number/],
    [{ tiers: [{ minPacks: '5', price: '' }] }, /price per pack for 5\+/],
    [{ tiers: [{ minPacks: '5', price: '25' }] }, /must go down/],
    [{ tiers: [{ minPacks: '5', price: '22' }, { minPacks: '5', price: '20' }] }, /more packs than the one before/],
    [{ tiers: [{ minPacks: '5', price: '22' }, { minPacks: '10', price: '23' }] }, /must go down/],
    [{ tiers: [{ minPacks: '3', price: '24' }, { minPacks: '5', price: '22' }, { minPacks: '9', price: '20' }] }, /At most 2/],
  ])('refuses %o', (x, msg) => {
    const r = ok(x)
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.error.en).toMatch(msg); expect(r.error.te).toBeTruthy() }
  })
  it('gram unit: 250 g is stored as 250', () => {
    expect(resolveRetailPack({ unit: 'gram', packSize: 250, packPrice: 25 })).toMatchObject({ ok: true, columns: { retail_pack_size: 250 } })
  })
  it('round trip through the form strings', () => {
    const row = { unit: 'kg', retail_pack_size: 0.5, retail_pack_price: 45, retail_pack_tiers: [{ min_packs: 4, price: 40 }] }
    expect(retailPackFormFromRow(row)).toEqual({ packSize: '0.5', packPrice: '45', tiers: [{ minPacks: '4', price: '40' }] })
    expect(retailPackFormFromRow({ unit: 'kg' })).toEqual({ packSize: '', packPrice: '', tiers: [] })
  })
})

describe('legacy per-unit columns stay fair for readers that do not know packs', () => {
  it('step = one pack; per-kg price derived', () => {
    expect(legacyColumnsForPack({ retail_pack_size: 0.25, retail_pack_price: 25, retail_pack_tiers: [] })).toEqual({
      sale_step: 0.25, price_tier_1_price: 100, price_tier_1_qty: null,
      price_tier_2_price: null, price_tier_2_qty: null, price_tier_3_price: null, price_tier_3_qty: null,
    })
    expect(legacyColumnsForPack({ retail_pack_size: null, retail_pack_price: null, retail_pack_tiers: [] })).toEqual({})
  })
  it('the old tier maths gives the same per-pack price as the pack tiers', () => {
    const c = { retail_pack_size: 0.25, retail_pack_price: 25, retail_pack_tiers: [{ min_packs: 5, price: 22 }, { min_packs: 10, price: 20 }] }
    const l = legacyColumnsForPack(c)
    const old = (qty: number) => getTierPrice(qty, {
      priceTier1Qty: l.price_tier_1_qty, priceTier1Price: l.price_tier_1_price,
      priceTier2Qty: l.price_tier_2_qty, priceTier2Price: l.price_tier_2_price, priceTier3Price: l.price_tier_3_price,
    })
    for (const packs of [1, 4, 5, 9, 10, 15]) {
      const qty = packs * 0.25
      expect((old(qty) as number) * 0.25).toBeCloseTo(pricePerPack(packs, 25, c.retail_pack_tiers), 6)
    }
  })
  it('one tier maps onto the old tier-3 slot', () => {
    const l = legacyColumnsForPack({ retail_pack_size: 1, retail_pack_price: 90, retail_pack_tiers: [{ min_packs: 3, price: 80 }] })
    expect(l).toMatchObject({ price_tier_1_qty: 2, price_tier_1_price: 90, price_tier_2_price: null, price_tier_3_price: 80 })
  })
})

describe('pack-pricing migration', () => {
  it('the size-and-price CHECK spells out IS NOT NULL (a bare > 0 on NULL passes a CHECK)', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of ['scripts/pack-pricing-migration.sql', 'scripts/staging-schema.sql']) {
      expect(readFileSync(f, 'utf8')).toMatch(/OR \(retail_pack_size IS NOT NULL AND retail_pack_price IS NOT NULL AND retail_pack_size > 0 AND retail_pack_price > 0\)/)
    }
  })
})

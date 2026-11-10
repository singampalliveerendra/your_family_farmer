import { describe, it, expect } from 'vitest'
import { perUnitPriceRow, type RetailSellForm } from '@/components/SellHowFields'
import { bothPricesError, EMPTY_WHOLESALE_FORM, type WholesaleForm } from '@/lib/wholesale'

// "Wholesale must be cheaper than retail" (2026-11-05) still holds with packs
// (2026-11-10): both sides are compared as ₹ per unit.
const RETAIL: RetailSellForm = { price: '', tier1Qty: '5', price2: '', price2Qty: '20', price3: '', saleStep: '1', packSize: '', packPrice: '', packTiers: [] }
const W = (x: Partial<WholesaleForm>): WholesaleForm => ({ ...EMPTY_WHOLESALE_FORM, saleMode: 'both', ...x })

describe('perUnitPriceRow', () => {
  it('a 250 g pack at ₹25 is ₹100/kg; a 25 kg wholesale pack at ₹700 is ₹28/kg → fine', () => {
    const row = perUnitPriceRow(W({ packSize: '25', packPrice: '700' }), { ...RETAIL, packSize: '0.25', packPrice: '25' }, 'kg')
    expect(row).toMatchObject({ wholesale_price: 28, price_tier_1_price: 100 })
    expect(bothPricesError(row)).toBeNull()
  })
  it('wholesale pack dearer per kg than the retail pack → refused', () => {
    const row = perUnitPriceRow(W({ packSize: '1', packPrice: '120' }), { ...RETAIL, packSize: '0.25', packPrice: '25' }, 'kg')
    expect(bothPricesError(row)).not.toBeNull()
  })
  it('a cheaper buy-more tier counts too', () => {
    const retail = { ...RETAIL, packSize: '1', packPrice: '100', packTiers: [{ minPacks: '5', price: '50' }] }
    expect(bothPricesError(perUnitPriceRow(W({ price: '60', minQty: '10' }), retail, 'kg'))).not.toBeNull()
    expect(bothPricesError(perUnitPriceRow(W({ price: '40', minQty: '10' }), retail, 'kg'))).toBeNull()
  })
  it('loose retail: the typed ₹/unit prices, as before', () => {
    expect(perUnitPriceRow(W({ price: '30', minQty: '10' }), { ...RETAIL, price: '40' }, 'kg')).toMatchObject({ wholesale_price: '30', price_tier_1_price: '40' })
  })
  it('a pack size left over on a piece unit is ignored (sold loose)', () => {
    expect(perUnitPriceRow(W({ price: '30', minQty: '10' }), { ...RETAIL, price: '40', packSize: '0.25', packPrice: '25' }, 'piece')).toMatchObject({ price_tier_1_price: '40' })
  })
})

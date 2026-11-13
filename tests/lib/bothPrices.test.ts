import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bothPricesError, lowestRetailPrice, touchesBothPriceRule } from '@/lib/wholesale'

// Decision 2026-11-05: a farmer selling Both (Retail + Wholesale) enters two
// separate prices, and the wholesale price must be lower than every retail
// price — otherwise the save is blocked.

describe('bothPricesError', () => {
  const row = (extra: Record<string, unknown>) => ({ sale_mode: 'both', price_tier_1_price: 40, wholesale_price: 30, ...extra })
  it('cheaper wholesale is fine', () => {
    expect(bothPricesError(row({}))).toBeNull()
  })
  it('equal or higher wholesale is blocked, naming the retail price', () => {
    expect(bothPricesError(row({ wholesale_price: 40 }))?.en).toBe('Wholesale price must be lower than your retail price (₹40).')
    expect(bothPricesError(row({ wholesale_price: '55' }))?.te).toContain('₹40')
  })
  it('compares with the lowest retail tier entered', () => {
    expect(bothPricesError(row({ price_tier_2_price: 35, price_tier_3_price: 31, wholesale_price: 32 }))?.en).toContain('₹31')
    expect(bothPricesError(row({ price_tier_2_price: '', price_tier_3_price: null, wholesale_price: 39 }))).toBeNull()
  })
  it('form strings work the same as numbers', () => {
    expect(bothPricesError({ sale_mode: 'both', price_tier_1_price: '40', wholesale_price: '40.00' })).not.toBeNull()
    expect(bothPricesError({ sale_mode: 'both', price_tier_1_price: '40', wholesale_price: '39.5' })).toBeNull()
  })
  it('only Both is checked; a missing price is left to the other checks', () => {
    expect(bothPricesError(row({ sale_mode: 'retail', wholesale_price: 90 }))).toBeNull()
    expect(bothPricesError(row({ sale_mode: 'wholesale', wholesale_price: 90 }))).toBeNull()
    expect(bothPricesError(row({ wholesale_price: '' }))).toBeNull()
    expect(bothPricesError({ sale_mode: 'both', wholesale_price: 30 })).toBeNull()
  })
  it('lowestRetailPrice ignores blanks, zero and junk', () => {
    expect(lowestRetailPrice({ price_tier_1_price: 40, price_tier_2_price: 0, price_tier_3_price: 'x' })).toBe(40)
    expect(lowestRetailPrice({})).toBeNull()
  })
  it('the server checks only changes that touch a price or the sale mode', () => {
    expect(touchesBothPriceRule({ status: 'paused' })).toBe(false)
    expect(touchesBothPriceRule({ soil_ph: 6 })).toBe(false)
    expect(touchesBothPriceRule({ price_tier_2_price: 30 })).toBe(true)
    expect(touchesBothPriceRule({ sale_mode: 'both' })).toBe(true)
  })
})

describe('the forms ask for two separate, named prices', () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  // The price boxes live in SellHowFields ("How do you want to sell?" step).
  it('the Sell step shows a Retail price box', () => {
    expect(src('src/components/SellHowFields.tsx')).toMatch(/Retail price/)
  })
  it.each(['src/app/farmer/dashboard/page.tsx', 'src/app/moderator/listings/ListingForm.tsx'])('%s shows the price error and blocks the save', (p) => {
    const s = src(p)
    expect(s).toMatch(/priceError=/)
    expect(s).toMatch(/if \(bothPriceErr\) \{ setError\(/)
  })
})

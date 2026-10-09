import { describe, it, expect } from 'vitest'
import {
  SHARE_PER_PAGE,
  chunkForShare,
  displayUrl,
  farmerShareUrl,
  pickShareItems,
  shareCaption,
  shareFileName,
  sharePriceLabel,
  type ShareListing,
} from '@/lib/produceShare'

// "Share my produce" turns the farmer's in-stock catalogue into WhatsApp
// images. A buyer orders off these, so an item on the image that the farmer's
// page won't sell is a broken promise — the filter must match the public
// Produce tab exactly.

const row = (over: Partial<ShareListing> = {}): ShareListing => ({
  id: 'p1',
  name: 'Tomato',
  status: 'available',
  price_tier_1_price: 40,
  unit: 'kg',
  stock_qty: 10,
  ...over,
})

describe('pickShareItems', () => {
  it('keeps available listings with stock and a price', () => {
    expect(pickShareItems([row()], {})).toHaveLength(1)
  })

  it('drops anything not available — sold out, paused, coming soon, taken down', () => {
    const rows = ['sold_out', 'paused', 'coming_soon', 'suspended', 'rejected'].map((status, i) =>
      row({ id: `p${i}`, status }),
    )
    expect(pickShareItems(rows, {})).toEqual([])
  })

  it('drops a listing whose own stock hit zero', () => {
    expect(pickShareItems([row({ stock_qty: 0 })], {})).toEqual([])
  })

  // Orders decrement the HARVEST row, never the template — so a template still
  // saying "10 kg" is sold out once every logged pick is spent.
  it('treats spent harvests as sold out even when the template still has stock', () => {
    expect(pickShareItems([row()], { p1: [{ stock_qty: 0 }, { stock_qty: 0 }] })).toEqual([])
  })

  it('keeps a listing whose template is at zero but a harvest still has stock', () => {
    expect(pickShareItems([row({ stock_qty: 0 })], { p1: [{ stock_qty: 0 }, { stock_qty: 3 }] })).toHaveLength(1)
  })

  it('treats an untracked (null) harvest quantity as in stock', () => {
    expect(pickShareItems([row()], { p1: [{ stock_qty: null }] })).toHaveLength(1)
  })

  it('drops a listing with no price — a tile without a price is no use', () => {
    expect(pickShareItems([row({ price_tier_1_price: null }), row({ id: 'p2', price_tier_1_price: 0 })], {})).toEqual([])
  })

  it('keeps the original order', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', stock_qty: 0 }), row({ id: 'c' })]
    expect(pickShareItems(rows, {}).map((r) => r.id)).toEqual(['a', 'c'])
  })
})

describe('chunkForShare', () => {
  const n = (count: number) => Array.from({ length: count }, (_, i) => i)

  it('makes no pages for nothing', () => {
    expect(chunkForShare([])).toEqual([])
  })

  it('fits up to a full page on one image', () => {
    expect(chunkForShare(n(SHARE_PER_PAGE))).toHaveLength(1)
  })

  it('splits evenly rather than leaving a near-empty last image', () => {
    expect(chunkForShare(n(10), 9).map((p) => p.length)).toEqual([5, 5])
    expect(chunkForShare(n(19), 9).map((p) => p.length)).toEqual([7, 6, 6])
  })

  it('never exceeds a page and never loses or reorders an item', () => {
    for (let count = 1; count <= 40; count++) {
      const pages = chunkForShare(n(count), 9)
      expect(pages.every((p) => p.length >= 1 && p.length <= 9)).toBe(true)
      expect(pages.flat()).toEqual(n(count))
      expect(pages).toHaveLength(Math.ceil(count / 9))
    }
  })
})

describe('sharePriceLabel', () => {
  it('reads per unit', () => {
    expect(sharePriceLabel({ price_tier_1_price: 40, unit: 'kg' })).toBe('₹40/kg')
    expect(sharePriceLabel({ price_tier_1_price: 60, unit: 'dozen' })).toBe('₹60/dozen')
  })

  it('defaults a missing unit to kg', () => {
    expect(sharePriceLabel({ price_tier_1_price: 40, unit: null })).toBe('₹40/kg')
  })

  it('adds the smallest pack for part-unit produce (250 g mirchi)', () => {
    expect(sharePriceLabel({ price_tier_1_price: 80, unit: 'kg', sale_step: 0.25 })).toBe('₹80/kg · min 0.25 kg')
  })

  it('says nothing extra for whole-unit steps', () => {
    expect(sharePriceLabel({ price_tier_1_price: 40, unit: 'kg', sale_step: 1 })).toBe('₹40/kg')
  })

  it('drops a float tail from the price', () => {
    expect(sharePriceLabel({ price_tier_1_price: 42.5, unit: 'kg' })).toBe('₹42.5/kg')
  })
})

describe('links and caption', () => {
  it('points at the farmer page on whatever origin the app runs on', () => {
    expect(farmerShareUrl('https://gogrameen.in', 'ramesh')).toBe('https://gogrameen.in/farmer/ramesh')
    expect(farmerShareUrl('https://gogrameen.in/', 'ramesh')).toBe('https://gogrameen.in/farmer/ramesh')
  })

  it('escapes a slug so it cannot break out of the path', () => {
    expect(farmerShareUrl('https://gogrameen.in', 'a b/c')).toBe('https://gogrameen.in/farmer/a%20b%2Fc')
  })

  it('prints the URL without scheme or www', () => {
    expect(displayUrl('https://www.gogrameen.in/farmer/ramesh')).toBe('gogrameen.in/farmer/ramesh')
  })

  // The caption is the only tappable part of a WhatsApp image share.
  it('puts the link in the caption, on its own line', () => {
    const L = (en: string) => en
    const text = shareCaption('Ramesh', 'https://gogrameen.in/farmer/ramesh', L)
    expect(text.split('\n')).toContain('https://gogrameen.in/farmer/ramesh')
    expect(text).toContain("Ramesh's farm")
  })

  it('still reads well with no farmer name', () => {
    const text = shareCaption('  ', 'https://x/farmer/a', (en) => en)
    expect(text).not.toContain("'s farm")
    expect(text).toContain('https://x/farmer/a')
  })

  it('numbers files only when there is more than one image', () => {
    expect(shareFileName('ramesh', 0, 1)).toBe('gogrameen-ramesh.png')
    expect(shareFileName('ramesh', 1, 3)).toBe('gogrameen-ramesh-2-of-3.png')
    expect(shareFileName('../??', 0, 1)).toBe('gogrameen-farm.png')
  })
})

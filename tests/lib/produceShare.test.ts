import { describe, it, expect } from 'vitest'
import {
  SHARE_PER_PAGE,
  chunkForShare,
  displayUrl,
  farmerShareUrl,
  optimizedImageUrl,
  pickShareItems,
  SHARE_MAX_BYTES,
  SHARE_MAX_FILES,
  shareBatchLabel,
  shareBatches,
  shareCaption,
  shareFileName,
  shareTextWithFiles,
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

describe('optimizedImageUrl', () => {
  // Same-origin, so the canvas can draw it without CORS. The width must be one
  // Next allows (384 is a default) or the optimiser answers 400.
  it('routes the photo through our own optimiser at 384px', () => {
    const src = 'https://abc.supabase.co/storage/v1/object/public/produce/a b.jpg'
    expect(optimizedImageUrl(src)).toBe(
      `/_next/image?url=${encodeURIComponent(src)}&w=384&q=75`,
    )
    expect(optimizedImageUrl(src).startsWith('/')).toBe(true)
  })
})

describe('shareTextWithFiles', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'

  // WhatsApp on iOS keeps the text and DROPS the images when both are shared.
  it('sends images alone on iPhone and iPad', () => {
    expect(shareTextWithFiles(IPHONE)).toBe(false)
    expect(shareTextWithFiles(IPAD_DESKTOP, 5)).toBe(false)
  })

  it('keeps the caption with the images on Android and on a real Mac', () => {
    expect(shareTextWithFiles(ANDROID)).toBe(true)
    expect(shareTextWithFiles(IPAD_DESKTOP, 0)).toBe(true)
  })
})

describe('shareBatches', () => {
  // Chrome refuses a share of more than 10 files or 50 MB with "Permission
  // denied", and canShare() says yes anyway. An aggregator with 11 images saw
  // "Sharing failed" on every tap until the images went out in batches.
  const MB = 1024 * 1024

  it('keeps up to 10 images in one share', () => {
    expect(shareBatches(Array(10).fill(2 * MB))).toEqual([[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]])
  })

  it('splits 11 images into 10 + 1', () => {
    const b = shareBatches(Array(11).fill(2 * MB))
    expect(b).toEqual([[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [10]])
  })

  it('never puts more than 10 files in a batch, and keeps every image in order', () => {
    const b = shareBatches(Array(25).fill(MB))
    expect(b.map((x) => x.length)).toEqual([10, 10, 5])
    expect(b.flat()).toEqual([...Array(25).keys()])
    expect(Math.max(...b.map((x) => x.length))).toBeLessThanOrEqual(SHARE_MAX_FILES)
  })

  it('starts a new batch before the total size passes the cap', () => {
    const b = shareBatches([20 * MB, 20 * MB, 20 * MB])
    expect(b).toEqual([[0, 1], [2]])
    for (const batch of b) {
      expect(batch.length * 20 * MB).toBeLessThanOrEqual(SHARE_MAX_BYTES)
    }
  })

  it('still sends a single oversized image on its own instead of dropping it', () => {
    expect(shareBatches([60 * MB, MB])).toEqual([[0], [1]])
  })

  it('has nothing to share when there are no images', () => {
    expect(shareBatches([])).toEqual([])
  })
})

describe('shareBatchLabel', () => {
  const en = (e: string) => e
  const te = (_e: string, t: string) => t

  it('names the image range, counting from 1', () => {
    expect(shareBatchLabel([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], en)).toBe('Share images 1–10')
    expect(shareBatchLabel([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], te)).toBe('చిత్రాలు 1–10 పంపండి')
  })

  it('says "image" for a batch of one', () => {
    expect(shareBatchLabel([10], en)).toBe('Share image 11')
    expect(shareBatchLabel([10], te)).toBe('చిత్రం 11 పంపండి')
  })
})

describe('catalogue size vs the 10-file share limit', () => {
  it('fits a 90-item catalogue into one share (8 images, 12 per image)', () => {
    const pages = chunkForShare(Array.from({ length: 90 }, (_, i) => i))
    expect(SHARE_PER_PAGE).toBe(12)
    expect(pages).toHaveLength(8)
    expect(shareBatches(pages.map(() => 2 * 1024 * 1024))).toHaveLength(1)
  })
})

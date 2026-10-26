import { describe, it, expect } from 'vitest'
import { coverImageUrl, shareImageFileName, productMetadata } from '@/lib/productShare'

describe('coverImageUrl', () => {
  it('uses the first gallery photo', () => {
    expect(coverImageUrl({ image_urls: ['https://x/a.jpg', 'https://x/b.jpg'], image_url: 'https://x/old.jpg' })).toBe('https://x/a.jpg')
  })
  it('falls back to the single image_url', () => {
    expect(coverImageUrl({ image_urls: [], image_url: 'https://x/old.jpg' })).toBe('https://x/old.jpg')
    expect(coverImageUrl({ image_urls: null, image_url: 'https://x/old.jpg' })).toBe('https://x/old.jpg')
  })
  it('skips blank entries and returns null with no photo', () => {
    expect(coverImageUrl({ image_urls: ['', '  '], image_url: 'https://x/old.jpg' })).toBe('https://x/old.jpg')
    expect(coverImageUrl({ image_urls: null, image_url: '' })).toBeNull()
    expect(coverImageUrl({})).toBeNull()
  })
})

describe('shareImageFileName', () => {
  it('names the file after the product with the right extension', () => {
    expect(shareImageFileName('Orange', 'image/jpeg')).toBe('orange.jpg')
    expect(shareImageFileName('Desi Tomato (Nati)', 'image/png')).toBe('desi-tomato-nati.png')
    expect(shareImageFileName('Mango', 'image/webp')).toBe('mango.webp')
  })
  it('falls back when the name has no latin letters', () => {
    expect(shareImageFileName('టమాటా', 'image/jpeg')).toBe('produce.jpg')
  })
})

describe('productMetadata', () => {
  const orange = {
    name: 'Orange',
    variety: 'Nagpur',
    method: 'natural',
    price_tier_1_price: 80,
    unit: 'kg',
    image_urls: ['https://cdn/orange.jpg'],
    farmer: { name: 'Ravi', village: 'Pentapadu' },
  }

  it('puts the product photo, name, price and farmer in the preview', () => {
    const m = productMetadata(orange)
    expect(m.openGraph?.title).toBe('Orange (Nagpur) — ₹80/kg')
    expect(m.openGraph?.description).toBe('Natural farming · Grown by Ravi, Pentapadu · Order fresh, straight from the farmer.')
    expect(m.openGraph).toMatchObject({ images: [{ url: 'https://cdn/orange.jpg', alt: 'Orange' }] })
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', images: ['https://cdn/orange.jpg'] })
  })

  it('leaves the image out when the product has no photo', () => {
    const m = productMetadata({ ...orange, image_urls: null, image_url: null })
    expect(m.openGraph).not.toHaveProperty('images')
    expect(m.twitter).toMatchObject({ card: 'summary' })
  })

  it('copes with missing price, method and farmer', () => {
    const m = productMetadata({ name: 'Mango' })
    expect(m.openGraph?.title).toBe('Mango')
    expect(m.description).toBe('Order fresh, straight from the farmer.')
  })
})

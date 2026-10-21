import { describe, it, expect } from 'vitest'
import { FEED_PAGE_SIZE, nextVisibleCount, nextBatchCoverUrls } from '@/lib/feedPaging'

describe('nextVisibleCount', () => {
  it('adds one page at a time', () => {
    expect(nextVisibleCount(15, 100)).toBe(30)
    expect(nextVisibleCount(30, 100)).toBe(45)
  })

  it('never goes past the end of the list', () => {
    expect(nextVisibleCount(15, 20)).toBe(20)
    expect(nextVisibleCount(20, 20)).toBe(20)
    expect(nextVisibleCount(0, 3)).toBe(3)
  })

  it('treats a negative count as zero', () => {
    expect(nextVisibleCount(-5, 100)).toBe(FEED_PAGE_SIZE)
  })
})

describe('nextBatchCoverUrls', () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ image_urls: [`a${i}.jpg`, `b${i}.jpg`] }))

  it('returns only the cover of each card in the next batch', () => {
    const urls = nextBatchCoverUrls(items, 15)
    expect(urls).toHaveLength(15)
    expect(urls[0]).toBe('a15.jpg')
    expect(urls[14]).toBe('a29.jpg')
    expect(urls.some((u) => u.startsWith('b'))).toBe(false)
  })

  it('falls back to image_url and skips cards with no photo', () => {
    const urls = nextBatchCoverUrls([{ image_url: 'x.jpg' }, { image_urls: [] }, { image_url: null }], 0)
    expect(urls).toEqual(['x.jpg'])
  })

  it('dedupes harvest cards of the same produce (they share the cover)', () => {
    expect(nextBatchCoverUrls([{ image_url: 'x.jpg' }, { image_url: 'x.jpg' }], 0)).toEqual(['x.jpg'])
  })

  it('is empty once everything is drawn', () => {
    expect(nextBatchCoverUrls(items, 40)).toEqual([])
  })
})

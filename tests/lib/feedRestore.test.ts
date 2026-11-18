import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  saveFeedSnapshot, readFeedSnapshot, clearFeedSnapshot, updateFeedSnapshot,
  pickAnchor, scrollDeltaFor, snapshotIsStale, feedViewKey, FEED_SNAPSHOT_FRESH_MS,
  type FeedSnapshot,
} from '@/lib/feedRestore'

const snap = (over: Partial<FeedSnapshot<{ n: number }>> = {}): FeedSnapshot<{ n: number }> => ({
  data: { n: 1 },
  fetchedAt: 1000,
  filters: { search: '', method: 'all', category: 'all', sortBy: 'fresh', farmerFilter: 'all' },
  consumerLat: 16.8, consumerLng: 81.5, consumerLocationName: 'Tadepalligudem',
  visibleCount: 45,
  anchor: { key: 'h33', top: 120 },
  scrollY: 5400,
  ...over,
})

describe('feed snapshot store', () => {
  beforeEach(() => clearFeedSnapshot())

  it('is empty until the feed saves one (a fresh load / refresh starts at the top)', () => {
    expect(readFeedSnapshot()).toBeNull()
  })

  it('gives back what was saved: data, filters, drawn count and position', () => {
    saveFeedSnapshot(snap())
    const s = readFeedSnapshot<{ n: number }>()!
    expect(s.visibleCount).toBe(45)
    expect(s.anchor).toEqual({ key: 'h33', top: 120 })
    expect(s.filters.sortBy).toBe('fresh')
    expect(s.data.n).toBe(1)
  })

  it('scroll updates patch the position only', () => {
    saveFeedSnapshot(snap())
    updateFeedSnapshot({ anchor: { key: 'h40', top: 8 }, scrollY: 6100 })
    const s = readFeedSnapshot<{ n: number }>()!
    expect(s.anchor).toEqual({ key: 'h40', top: 8 })
    expect(s.scrollY).toBe(6100)
    expect(s.visibleCount).toBe(45)
  })

  it('a position update with no snapshot does nothing', () => {
    updateFeedSnapshot({ scrollY: 99 })
    expect(readFeedSnapshot()).toBeNull()
  })
})

describe('pickAnchor', () => {
  it('picks the first card still on screen, skipping ones scrolled past', () => {
    const cards = [
      { key: 'a', top: -600, bottom: -300 },
      { key: 'b', top: -280, bottom: -10 },
      { key: 'c', top: 10, bottom: 290 },
    ]
    expect(pickAnchor(cards)).toEqual({ key: 'c', top: 10 })
  })

  it('a card cut off at the top still counts', () => {
    expect(pickAnchor([{ key: 'a', top: -100, bottom: 150 }])).toEqual({ key: 'a', top: -100 })
  })

  it('nothing on screen → null', () => {
    expect(pickAnchor([{ key: 'a', top: -500, bottom: -200 }])).toBeNull()
    expect(pickAnchor([])).toBeNull()
  })
})

describe('scrollDeltaFor', () => {
  it('scrolls down by how far the card has moved down (boxes above loaded)', () => {
    expect(scrollDeltaFor({ key: 'x', top: 120 }, 420)).toBe(300)
  })
  it('scrolls up when the card is higher than before', () => {
    expect(scrollDeltaFor({ key: 'x', top: 120 }, 20)).toBe(-100)
  })
})

describe('snapshotIsStale', () => {
  it('fresh within 30 s, stale after', () => {
    expect(snapshotIsStale(0, FEED_SNAPSHOT_FRESH_MS - 1)).toBe(false)
    expect(snapshotIsStale(0, FEED_SNAPSHOT_FRESH_MS)).toBe(true)
    expect(snapshotIsStale(NaN, 5)).toBe(true)
  })
})

describe('feedViewKey', () => {
  const base = { search: '', method: 'all', category: 'all', farmerFilter: 'all', distanceFilter: 'local', sortBy: 'fresh', consumerLat: 16.8, consumerLng: 81.5 }
  it('same view → same key (a restore keeps the drawn cards)', () => {
    expect(feedViewKey(base)).toBe(feedViewKey({ ...base }))
  })
  it('any filter, sort or location change → new key (back to the first batch)', () => {
    for (const k of Object.keys(base) as (keyof typeof base)[]) {
      const changed = { ...base, [k]: typeof base[k] === 'number' ? 1 : 'x' }
      expect(feedViewKey(changed)).not.toBe(feedViewKey(base))
    }
  })
})

describe('home feed uses the snapshot', () => {
  const src = readFileSync(join(__dirname, '../..', 'src/app/consumer/page.tsx'), 'utf8')
  it('starts from the snapshot and skips the skeleton', () => {
    expect(src).toMatch(/const \[restored\] = useState\(\(\) => readFeedSnapshot<FeedData>\(\)\)/)
    expect(src).toMatch(/useState\(!restored\)/)
    expect(src).toMatch(/useState\(\(\) => restored\?\.visibleCount \?\? FEED_PAGE_SIZE\)/)
  })
  it('only resets the drawn cards when the view really changes', () => {
    expect(src).toMatch(/if \(lastViewKey\.current === viewKey\) return/)
  })
  it('marks every card and saves the spot when one is tapped', () => {
    expect(src).toMatch(/<div ref=\{gridRef\} onClickCapture=\{recordPosition\}/)
    expect(src).toMatch(/anchorKey=\{card\.key\}/)
    expect(readFileSync(join(__dirname, '../..', 'src/components/produce/ProduceTile.tsx'), 'utf8')).toMatch(/data-feed-key=\{p\.anchorKey\}/)
  })
})

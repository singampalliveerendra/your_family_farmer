import { describe, it, expect } from 'vitest'
import {
  CONSUMER_VISIBLE_STATUSES,
  ORDERABLE_STATUSES,
  isSoldOutListing,
  isSoldOutWithHarvests,
} from '@/lib/produceStatus'

// Who decides a produce is sold out — the listing template, or the harvests
// logged under it? Getting this wrong has already cost us twice: once when
// selling out made a farmer's crop vanish from their public profile, and once
// when a zeroed harvest still advertised "10 kg left" because the template's
// own number had never been decremented. These tests fix both answers.

describe('the visible / orderable status lists', () => {
  // USE: a sold-out crop must still be SHOWN. Filtering the consumer queries
  // down to 'available' is what made a farmer's catalogue silently shrink the
  // moment they sold out — buyers had no way to learn the crop even existed.
  it('shows sold-out produce to buyers instead of hiding it', () => {
    expect([...CONSUMER_VISIBLE_STATUSES]).toEqual(['available', 'sold_out'])
  })

  // USE: seeing is not buying, but 'sold_out' is a stock state rather than a
  // takedown, so a stale cart line may still check out (the stock RPC has the
  // final word on quantity). What must NEVER become orderable is anything a
  // farmer or moderator has taken down.
  it('never lets a paused, suspended or rejected listing be ordered', () => {
    for (const banned of ['paused', 'suspended', 'rejected', 'coming_soon', 'draft']) {
      expect(ORDERABLE_STATUSES).not.toContain(banned)
    }
  })
})

describe('isSoldOutListing', () => {
  // USE: the auto-flip in /api/farmer/update-listing writes status 'sold_out'.
  // Reading it is the cheap, direct signal.
  it('trusts an explicit sold_out status', () => {
    expect(isSoldOutListing({ status: 'sold_out', stock_qty: 5 })).toBe(true)
  })

  // USE: rows written before the auto-flip existed carry stock 0 with status
  // still 'available'. Reading only the status would offer a buyer produce
  // that is demonstrably gone.
  it('also catches a row left at available with zero stock', () => {
    expect(isSoldOutListing({ status: 'available', stock_qty: 0 })).toBe(true)
    expect(isSoldOutListing({ status: 'available', stock_qty: -2 })).toBe(true)
  })

  // USE: null stock means "quantity not tracked", which is a normal way to
  // sell. Treating null as zero would hide every untracked listing in the app.
  it('does not treat untracked stock as zero', () => {
    expect(isSoldOutListing({ status: 'available', stock_qty: null })).toBe(false)
    expect(isSoldOutListing({})).toBe(false)
  })

  // USE: the ordinary in-stock case, so the guard can't regress to "always true".
  it('is false for a listing with stock', () => {
    expect(isSoldOutListing({ status: 'available', stock_qty: 10 })).toBe(false)
  })
})

describe('isSoldOutWithHarvests', () => {
  // USE: this is the fix for the real-money bug. An order placed against a
  // harvest decrements THAT row, never the template's, so the template happily
  // sits at "10 kg available" long after the last kilo went. Wherever a produce
  // is shown as one row, the harvests are the authority.
  it('says sold out when every logged pick is empty, whatever the template claims', () => {
    const listing = { status: 'available', stock_qty: 10 }
    expect(isSoldOutWithHarvests(listing, [{ stock_qty: 0 }, { stock_qty: 0 }])).toBe(true)
  })

  // USE: one pick with produce left keeps the whole crop buyable — the farmer
  // has kilos in hand and must not be shown as sold out.
  it('stays buyable while any pick still has stock', () => {
    const listing = { status: 'sold_out', stock_qty: 0 }
    expect(isSoldOutWithHarvests(listing, [{ stock_qty: 0 }, { stock_qty: 4 }])).toBe(false)
  })

  // USE: a harvest with null stock means quantity not tracked, not zero. A
  // farmer who logs a pick without a number is still selling it.
  it('treats an untracked pick as available, not as empty', () => {
    expect(isSoldOutWithHarvests({ status: 'available', stock_qty: 0 }, [{ stock_qty: null }])).toBe(false)
    expect(isSoldOutWithHarvests({ status: 'available', stock_qty: 0 }, [{}])).toBe(false)
  })

  // USE: with no picks logged at all there is nothing to defer to, so the
  // template's own number speaks — this is the path older listings still take.
  it('falls back to the template when no harvest has been logged', () => {
    expect(isSoldOutWithHarvests({ status: 'sold_out', stock_qty: 0 }, [])).toBe(true)
    expect(isSoldOutWithHarvests({ status: 'available', stock_qty: 6 }, [])).toBe(false)
  })
})

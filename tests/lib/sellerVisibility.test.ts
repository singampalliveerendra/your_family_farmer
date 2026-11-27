import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  HIDDEN_FROM_BUYERS_TAG,
  readWithSellingUntil,
  sellerOpen,
  withoutClosed,
} from '@/lib/sellerVisibility'
import { WARN_DAYS, sellingEndsSoon, standingOf } from '@/lib/subscriptionLifecycle'
import { onMarket, type MarketListingRow } from '@/lib/bulkMarket'
import type { SubscriptionRow } from '@/lib/subscriptionPlans'

// Decision 2026-11-27: an aggregator may add produce any time; buyers see it
// only while a Selling / Combined plan is live; it vanishes the moment the plan
// ends; the aggregator is warned 7 days before.

const NOW = new Date('2026-11-27T06:00:00Z')
const DAY = 86_400_000
const day = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString()

describe('sellerOpen', () => {
  it('farmers are always visible', () => {
    expect(sellerOpen({ account_type: 'farmer', selling_until: null }, NOW)).toBe(true)
    expect(sellerOpen({ account_type: null }, NOW)).toBe(true)
  })
  it('an aggregator with no selling cover is hidden', () => {
    expect(sellerOpen({ account_type: 'aggregator', selling_until: null }, NOW)).toBe(false)
    expect(sellerOpen({ account_type: 'aggregator' }, NOW)).toBe(false)
  })
  it('visible until the exact moment the plan ends, hidden from then on', () => {
    expect(sellerOpen({ account_type: 'aggregator', selling_until: day(1) }, NOW)).toBe(true)
    expect(sellerOpen({ account_type: 'aggregator', selling_until: NOW.toISOString() }, NOW)).toBe(false)
    expect(sellerOpen({ account_type: 'aggregator', selling_until: day(-1) }, NOW)).toBe(false)
  })
  it('free forever (infinity) is always visible', () => {
    expect(sellerOpen({ account_type: 'aggregator', selling_until: 'infinity' }, NOW)).toBe(true)
  })
  it('junk dates and a missing seller hide', () => {
    expect(sellerOpen({ account_type: 'aggregator', selling_until: 'not a date' }, NOW)).toBe(false)
    expect(sellerOpen(null, NOW)).toBe(false)
  })
})

describe('withoutClosed', () => {
  it('drops only the closed sellers’ rows', () => {
    const rows = [{ id: 'a', farmer_id: 'f1' }, { id: 'b', farmer_id: 'agg' }, { id: 'c', farmer_id: null }]
    expect(withoutClosed(rows, new Set(['agg'])).map((r) => r.id)).toEqual(['a', 'c'])
    expect(withoutClosed(rows, new Set()).length).toBe(3)
  })
})

describe('readWithSellingUntil', () => {
  it('uses the column when it exists', async () => {
    const r = await readWithSellingUntil(async (withCol) => ({ data: withCol ? 'with' : 'without', error: null }))
    expect(r).toEqual({ data: 'with', error: null, checked: true })
  })
  it('a database without the column reads without it and hides nobody', async () => {
    const r = await readWithSellingUntil(async (withCol) => withCol
      ? { data: null, error: { message: "column farmers.selling_until does not exist" } }
      : { data: 'without', error: null })
    expect(r).toEqual({ data: 'without', error: null, checked: false })
  })
  it('a genuine error is not swallowed', async () => {
    const r = await readWithSellingUntil(async () => ({ data: null, error: { message: 'permission denied' } }))
    expect(r.error?.message).toBe('permission denied')
    expect(r.checked).toBe(true)
  })
})

const SUB = (o: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: 's1', aggregator_id: 'agg', plan_id: 'p', kind: 'selling', source: 'payment', status: 'active',
  starts_at: day(-20), ends_at: day(10), amount_paid: 999,
  ...o,
} as SubscriptionRow)

describe('the 7-day warning', () => {
  it('WARN_DAYS is 7', () => expect(WARN_DAYS).toBe(7))
  it('standing turns "ending" 7 days before, not earlier', () => {
    expect(standingOf([SUB({ ends_at: day(7) })], NOW).state).toBe('ending')
    expect(standingOf([SUB({ ends_at: day(8) })], NOW).state).toBe('active')
  })
  it('sellingEndsSoon gives the date buyers stop seeing the produce', () => {
    expect(sellingEndsSoon([SUB({ ends_at: day(5) })], NOW)).toEqual({ endsAt: day(5), daysLeft: 5 })
    expect(sellingEndsSoon([SUB({ ends_at: day(10) })], NOW)).toBeNull()
  })
  it('a combined plan counts; a buying-only plan does not', () => {
    expect(sellingEndsSoon([SUB({ kind: 'combined', ends_at: day(3) })], NOW)?.daysLeft).toBe(3)
    expect(sellingEndsSoon([SUB({ kind: 'buying', ends_at: day(3) })], NOW)).toBeNull()
  })
  it('no warning when a renewal already follows, or for free forever', () => {
    const renewed = [SUB({ ends_at: day(3) }), SUB({ id: 's2', starts_at: day(3), ends_at: day(33) })]
    expect(sellingEndsSoon(renewed, NOW)).toBeNull()
    expect(sellingEndsSoon([SUB({ ends_at: null, source: 'free_forever' })], NOW)).toBeNull()
  })
  it('nothing to warn about once it has ended', () => {
    expect(sellingEndsSoon([SUB({ ends_at: day(-1) })], NOW)).toBeNull()
  })
})

describe('the bulk market follows the same rule', () => {
  const lot = { id: 'l', farmer_id: 'agg', sale_mode: 'wholesale', status: 'available', wholesale_price: 40, wholesale_min_qty: 100, stock_qty: 500 } as unknown as MarketListingRow
  const seller = { id: 'agg', account_type: 'aggregator', active: true }
  it('an aggregator seller without a selling plan is off the market', () => {
    expect(onMarket(lot, [], { ...seller, selling_until: null }, 'viewer')).toBe(false)
    expect(onMarket(lot, [], { ...seller, selling_until: day(-1) }, 'viewer')).toBe(false)
  })
  it('with a live plan, or when the column was not read, it stays', () => {
    expect(onMarket(lot, [], { ...seller, selling_until: day(3) }, 'viewer')).toBe(true)
    expect(onMarket(lot, [], seller, 'viewer')).toBe(true)
  })
  it('farmers are unaffected', () => {
    expect(onMarket({ ...lot, farmer_id: 'f' } as MarketListingRow, [], { id: 'f', account_type: 'farmer', active: true, selling_until: null }, 'viewer')).toBe(true)
  })
})

describe('words', () => {
  it('the tag says hidden and what to do, in both languages', () => {
    expect(HIDDEN_FROM_BUYERS_TAG.en).toBe('Hidden from buyers – subscribe to show')
    expect(HIDDEN_FROM_BUYERS_TAG.te).toMatch(/[ఀ-౿]/)
  })
})

describe('scripts/selling-visibility-migration.sql', () => {
  const raw = readFileSync(join(process.cwd(), 'scripts/selling-visibility-migration.sql'), 'utf8')
  const sql = raw.replace(/--.*$/gm, '')
  it('adds selling_until and lets the browser read it', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS selling_until timestamptz/)
    expect(sql).toMatch(/GRANT SELECT \(selling_until\) ON public\.farmers TO anon, authenticated/)
  })
  it('selling_until = latest end of active Selling / Combined rows, infinity for forever', () => {
    expect(sql).toMatch(/max\(COALESCE\(s\.ends_at, 'infinity'::timestamptz\)\)/)
    expect(sql).toMatch(/s\.kind IN \('selling', 'combined'\)/)
    expect(sql).toMatch(/s\.status = 'active'/)
  })
  it('kept current on every subscription change', () => {
    expect(sql).toMatch(/AFTER INSERT OR UPDATE OR DELETE ON public\.aggregator_subscriptions/)
  })
  it('no one else can write it', () => {
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.farmers/)
    expect(sql).toMatch(/NEW\.selling_until := OLD\.selling_until/)
  })
  it('definer functions are not callable from the browser', () => {
    for (const fn of ['refresh_selling_until\\(uuid\\)', 'aggregator_subscriptions_sync_selling\\(\\)', 'farmers_guard_selling_until\\(\\)']) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn} FROM PUBLIC, anon, authenticated`))
    }
  })
  it('back-fills every aggregator and drops the old add-produce lock', () => {
    expect(sql).toMatch(/WHERE account_type = 'aggregator'/)
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS produce_listings_selling_plan ON public\.produce_listings/)
    expect(sql).not.toMatch(/CREATE TRIGGER produce_listings_selling_plan/)
  })
  it('is mirrored in staging-schema.sql and the prod check', () => {
    const schema = readFileSync(join(process.cwd(), 'scripts/staging-schema.sql'), 'utf8')
    expect(schema).toMatch(/selling_until/)
    expect(schema).toMatch(/CREATE TRIGGER aggregator_subscriptions_selling_until/)
    expect(schema).not.toMatch(/CREATE TRIGGER produce_listings_selling_plan/)
    expect(readFileSync(join(process.cwd(), 'scripts/CHECK-prod-migrations.sql'), 'utf8')).toMatch(/'selling-visibility', 'farmers\.selling_until'/)
  })
})

import { describe, it, expect } from 'vitest'
import {
  PLAN_KINDS,
  PLAN_KIND_BLURBS,
  PLAN_KIND_LABELS,
  accessOf,
  durationLabel,
  highlightLines,
  inr,
  manualGrant,
  offerIsLive,
  perLabel,
  planPrice,
  plansTeaser,
  sortPlans,
  subscriptionLive,
  unlocksBuying,
  unlocksSelling,
  validatePlan,
  type PlanRow,
  type SubscriptionRow,
} from '@/lib/subscriptionPlans'

const NOW = new Date('2026-11-04T10:00:00Z')
const PLAN = (x: Partial<PlanRow> = {}): PlanRow => ({
  id: 'p1', kind: 'buying', name_en: 'Bulk buyer', duration_days: 30, actual_price: 999,
  offer_enabled: true, offer_price: 599, offer_ends_at: '2026-11-30T18:29:59Z', active: true, sort_order: 0, ...x,
})

describe('offerIsLive / planPrice', () => {
  it('a running offer: pay the offer price, see the saving', () => {
    expect(planPrice(PLAN(), NOW)).toEqual({
      price: 599, actual: 999, onOffer: true, savings: 400, savingsPct: 40, free: false, offerEndsAt: '2026-11-30T18:29:59Z',
    })
  })
  it('after the end date the actual price comes back by itself', () => {
    const later = new Date('2026-12-01T00:00:00Z')
    expect(offerIsLive(PLAN(), later)).toBe(false)
    expect(planPrice(PLAN(), later)).toMatchObject({ price: 999, onOffer: false, savings: 0, savingsPct: 0, offerEndsAt: null })
  })
  it('the exact end moment counts as ended', () => {
    expect(offerIsLive(PLAN({ offer_ends_at: NOW.toISOString() }), NOW)).toBe(false)
  })
  it('no end date = runs until switched off', () => {
    expect(offerIsLive(PLAN({ offer_ends_at: null }), new Date('2030-01-01'))).toBe(true)
  })
  it('switched off: actual price, even with an offer price kept', () => {
    expect(planPrice(PLAN({ offer_enabled: false }), NOW)).toMatchObject({ price: 999, onOffer: false })
  })
  it('a broken offer is ignored, never charged', () => {
    for (const bad of [{ offer_price: null }, { offer_price: 999 }, { offer_price: 1200 }, { offer_price: -5 }, { offer_ends_at: 'junk' }]) {
      expect(planPrice(PLAN(bad), NOW)).toMatchObject({ price: 999, onOffer: false })
    }
  })
  it('free plans and free offers', () => {
    expect(planPrice(PLAN({ actual_price: 0, offer_enabled: false, offer_price: null }), NOW)).toMatchObject({ price: 0, free: true })
    expect(planPrice(PLAN({ offer_price: 0 }), NOW)).toMatchObject({ price: 0, free: true, onOffer: true, savingsPct: 100 })
  })
  it('numeric strings from the database', () => {
    expect(planPrice(PLAN({ actual_price: '1499.00', offer_price: '999.50' }), NOW)).toMatchObject({ price: 999.5, actual: 1499, savings: 499.5, savingsPct: 33 })
  })
  it('% saved rounds DOWN so it never overstates', () => {
    expect(planPrice(PLAN({ actual_price: 300, offer_price: 199 }), NOW).savingsPct).toBe(33) // 33.67
  })
})

describe('durationLabel / perLabel / inr', () => {
  it.each([
    [30, '1 month'], [90, '3 months'], [365, '1 year'], [730, '2 years'], [45, '45 days'], [1, '1 day'], [7, '7 days'],
  ])('%i days → %s', (d, en) => {
    expect(durationLabel(d).en).toBe(en)
    expect(durationLabel(d).te).toMatch(/[ఀ-౿]/)
  })
  it('per labels', () => {
    expect(perLabel(30).en).toBe('/month')
    expect(perLabel(365).en).toBe('/year')
    expect(perLabel(90).en).toBe(' for 3 months')
  })
  it('rupees', () => {
    expect(inr(1499)).toBe('₹1,499')
    expect(inr(125000)).toBe('₹1,25,000')
    expect(inr(99.5)).toBe('₹99.50')
    expect(inr(0)).toBe('₹0')
  })
})

describe('highlightLines', () => {
  it('one benefit per line; bullets and blanks dropped', () => {
    expect(highlightLines('• See all bulk listings\n\n- Farmer phone numbers\n  * Buy direct  ')).toEqual(['See all bulk listings', 'Farmer phone numbers', 'Buy direct'])
  })
  it('Windows line ends, empty and null', () => {
    expect(highlightLines('a\r\nb')).toEqual(['a', 'b'])
    expect(highlightLines('')).toEqual([])
    expect(highlightLines(null)).toEqual([])
  })
  it('at most 8', () => {
    expect(highlightLines(Array.from({ length: 12 }, (_, i) => `b${i}`).join('\n'))).toHaveLength(8)
  })
})

describe('sortPlans / plansTeaser', () => {
  const plans = [
    PLAN({ id: 'y', kind: 'selling', duration_days: 365, actual_price: 4999, offer_price: 2999, sort_order: 2 }),
    PLAN({ id: 'old', kind: 'combined', sort_order: 0 }),
    PLAN({ id: 'm', sort_order: 1 }),
    PLAN({ id: 'off', active: false, actual_price: 1, offer_enabled: false }),
    PLAN({ id: 'bad', kind: 'gold' }),
  ]
  it('only active Buying/Selling plans, in sort order (an old Combined plan never shows)', () => {
    expect(sortPlans(plans, NOW).map((p) => p.id)).toEqual(['m', 'y'])
  })
  it('same sort order → cheapest first', () => {
    expect(sortPlans([PLAN({ id: 'a', actual_price: 500, offer_enabled: false }), PLAN({ id: 'b', actual_price: 100, offer_enabled: false })], NOW).map((p) => p.id)).toEqual(['b', 'a'])
  })
  it('teaser: lowest current price and best saving', () => {
    expect(plansTeaser(plans, NOW)).toEqual({ fromPrice: 599, fromPer: { en: '/month', te: '/నెల' }, bestSavingPct: 40, anyFree: false })
  })
  it('teaser knows about free plans', () => {
    expect(plansTeaser([PLAN({ actual_price: 0, offer_enabled: false, offer_price: null })], NOW)).toMatchObject({ fromPrice: 0, anyFree: true, bestSavingPct: 0 })
  })
  it('no plans → no teaser (page says "coming soon")', () => {
    expect(plansTeaser([], NOW)).toBeNull()
    expect(plansTeaser([PLAN({ active: false })], NOW)).toBeNull()
  })
})

describe('validatePlan', () => {
  const GOOD = { kind: 'buying', name_en: ' Bulk buyer ', duration_days: 30, actual_price: 999, offer_enabled: true, offer_price: 599, offer_ends_at: '2026-11-30T18:29:59Z' }
  it('a good plan, cleaned', () => {
    const r = validatePlan({ ...GOOD, highlights_en: '• one\n\ntwo', sort_order: 3 }, NOW)
    expect(r).toEqual({ ok: true, columns: {
      kind: 'buying', name_en: 'Bulk buyer', name_te: null, duration_days: 30, actual_price: 999,
      offer_enabled: true, offer_price: 599, offer_ends_at: '2026-11-30T18:29:59.000Z',
      offer_label_en: null, offer_label_te: null, highlights_en: 'one\ntwo', highlights_te: null, active: true, sort_order: 3,
    } })
  })
  it('₹0 free plan', () => {
    expect(validatePlan({ kind: 'selling', name_en: 'Free', duration_days: 365, actual_price: 0 }, NOW)).toMatchObject({ ok: true })
  })
  it('offer switched off keeps its price', () => {
    expect(validatePlan({ ...GOOD, offer_enabled: false }, NOW)).toMatchObject({ ok: true, columns: { offer_enabled: false, offer_price: 599 } })
  })
  it('a past end date is fine when the offer is off', () => {
    expect(validatePlan({ ...GOOD, offer_enabled: false, offer_ends_at: '2026-01-01' }, NOW).ok).toBe(true)
  })
  it.each([
    [{ kind: 'gold' }, /either Buying or Selling/],
    [{ kind: 'combined' }, /either Buying or Selling/],
    [{ kind: undefined }, /either Buying or Selling/],
    [{ name_en: '   ' }, /plan name/],
    [{ name_en: 'x'.repeat(61) }, /60 characters/],
    [{ name_te: 'త'.repeat(61) }, /Telugu name/],
    [{ duration_days: 0 }, /Duration/],
    [{ duration_days: 30.5 }, /Duration/],
    [{ duration_days: 4000 }, /Duration/],
    [{ duration_days: 'abc' }, /Duration/],
    [{ actual_price: -1 }, /actual price/],
    [{ actual_price: '' }, /actual price/],
    [{ actual_price: 2_000_000 }, /actual price/],
    [{ offer_price: 999 }, /lower than the actual/],
    [{ offer_price: 1500 }, /lower than the actual/],
    [{ offer_price: -1 }, /lower than the actual/],
    [{ offer_price: null }, /Enter the offer price/],
    [{ actual_price: 0, offer_price: 0 }, /free plan cannot have an offer/],
    [{ offer_ends_at: 'not a date' }, /valid date/],
    [{ offer_ends_at: '2026-11-01' }, /in the future/],
  ])('refuses %o', (bad, msg) => {
    const r = validatePlan({ ...GOOD, ...bad } as Record<string, unknown>, NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(msg)
  })
  it('only exactly true switches an offer on, only exactly false hides a plan', () => {
    const r = validatePlan({ ...GOOD, offer_enabled: 'yes', active: 'no' }, NOW)
    expect(r).toMatchObject({ ok: true, columns: { offer_enabled: false, active: true } })
  })
  it('long highlights are cut, not refused', () => {
    const r = validatePlan({ ...GOOD, highlights_en: 'x'.repeat(500) }, NOW)
    expect(r.ok && r.columns.highlights_en!.length).toBe(120)
  })
  it('paise are kept to 2 places', () => {
    expect(validatePlan({ ...GOOD, actual_price: '999.999', offer_price: 599.555 }, NOW)).toMatchObject({ columns: { actual_price: 1000, offer_price: 599.56 } })
  })
})

describe('subscriptions held', () => {
  const SUB = (x: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
    id: 's', kind: 'buying', source: 'payment', status: 'active', starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-12-01T00:00:00Z', ...x,
  })
  it('live between start and end', () => {
    expect(subscriptionLive(SUB(), NOW)).toBe(true)
    expect(subscriptionLive(SUB({ ends_at: NOW.toISOString() }), NOW)).toBe(false)
    expect(subscriptionLive(SUB({ starts_at: '2026-11-05T00:00:00Z' }), NOW)).toBe(false)
  })
  it('pending, cancelled or unknown kinds never count', () => {
    expect(subscriptionLive(SUB({ status: 'pending' }), NOW)).toBe(false)
    expect(subscriptionLive(SUB({ status: 'cancelled' }), NOW)).toBe(false)
    expect(subscriptionLive(SUB({ kind: 'gold' }), NOW)).toBe(false)
  })
  it('what each kind unlocks', () => {
    expect(PLAN_KINDS.map((k) => [unlocksBuying(k), unlocksSelling(k)])).toEqual([[true, false], [false, true], [true, true]])
  })
  it('access adds up across rows', () => {
    const a = accessOf([SUB(), SUB({ id: 't', kind: 'selling', ends_at: '2027-01-01T00:00:00Z' })], NOW)
    expect(a).toMatchObject({ buying: true, selling: true, forever: false, endsAt: '2027-01-01T00:00:00Z' })
    expect(a.current).toHaveLength(2)
  })
  it('free forever unlocks both, no end', () => {
    expect(accessOf([SUB({ kind: 'combined', source: 'free_forever', ends_at: null })], NOW)).toMatchObject({ buying: true, selling: true, forever: true, endsAt: null })
  })
  it('expired → nothing', () => {
    expect(accessOf([SUB({ ends_at: '2026-11-02T00:00:00Z' })], NOW)).toMatchObject({ buying: false, selling: false, endsAt: null, current: [] })
    expect(accessOf([], NOW)).toMatchObject({ buying: false, selling: false })
  })
})

describe('manualGrant', () => {
  it('for N days', () => {
    expect(manualGrant({ kind: 'buying', days: 30, note: ' trial ' }, NOW)).toEqual({ ok: true, row: {
      kind: 'buying', source: 'manual', starts_at: NOW.toISOString(), ends_at: '2026-12-04T10:00:00.000Z',
      amount_paid: 0, plan_name: 'Activated by moderator · Buying', note: 'trial',
    } })
  })
  it('free forever has no end', () => {
    expect(manualGrant({ kind: 'combined', forever: true }, NOW)).toMatchObject({ ok: true, row: { source: 'free_forever', ends_at: null, plan_name: 'Free forever · Buying + Selling', note: null } })
  })
  it.each([[{ kind: 'gold', days: 30 }], [{ kind: 'buying' }], [{ kind: 'buying', days: 0 }], [{ kind: 'buying', days: 2.5 }], [{ kind: 'buying', days: 5000 }], [{ kind: 'buying', forever: 'yes' }]])('refuses %o', (bad) => {
    expect(manualGrant(bad as never, NOW).ok).toBe(false)
  })
})

describe('labels', () => {
  it('every kind has both languages', () => {
    for (const k of PLAN_KINDS) {
      for (const m of [PLAN_KIND_LABELS[k], PLAN_KIND_BLURBS[k]]) {
        expect(m.en).toBeTruthy()
        expect(m.te).toMatch(/[ఀ-౿]/)
      }
    }
  })
})

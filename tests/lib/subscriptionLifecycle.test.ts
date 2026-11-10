import { describe, it, expect } from 'vitest'
import {
  HIDE_AFTER_DAYS,
  REMINDER_DAYS,
  activationDates,
  currentCoverEnd,
  hideDue,
  isSubscriptionOrderId,
  makeSubscriptionOrderId,
  quotePurchase,
  reminderDue,
  standingOf,
  subscriptionReceiptNo,
} from '@/lib/subscriptionLifecycle'
import type { PlanRow, SubscriptionRow } from '@/lib/subscriptionPlans'

const NOW = new Date('2026-11-04T10:00:00Z')
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()
const ID = '3f2a9c10-1111-4222-8333-444455556666'
const PLAN = (x: Partial<PlanRow> = {}): PlanRow => ({
  id: 'p1', kind: 'buying', name_en: 'Bulk buyer', duration_days: 30, actual_price: 999,
  offer_enabled: true, offer_price: 599, offer_ends_at: day(10), active: true, ...x,
})
const SUB = (x: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: 's1', kind: 'buying', source: 'payment', status: 'active', starts_at: day(-20), ends_at: day(10), ...x,
})

describe('Cashfree order id', () => {
  it('gs_ + the row id + a time suffix, under 45 chars', () => {
    const id = makeSubscriptionOrderId(ID, NOW.getTime())
    expect(id).toMatch(/^gs_3f2a9c10111142228333444455556666_[0-9a-z]+$/)
    expect(id.length).toBeLessThanOrEqual(45)
    expect(isSubscriptionOrderId(id)).toBe(true)
  })
  it('each attempt is unique', () => {
    expect(makeSubscriptionOrderId(ID, 1)).not.toBe(makeSubscriptionOrderId(ID, 2))
  })
  it('the shop’s order ids and junk are not subscriptions', () => {
    expect(isSubscriptionOrderId('gg_3f2a9c10111142228333444455556666_abc')).toBe(false)
    expect(isSubscriptionOrderId('gs_xyz')).toBe(false)
    expect(isSubscriptionOrderId(null)).toBe(false)
    expect(isSubscriptionOrderId(undefined)).toBe(false)
  })
})

describe('subscriptionReceiptNo', () => {
  it('India date + first 6 of the id', () => {
    expect(subscriptionReceiptNo(ID, NOW)).toBe('GGS-20261104-3F2A9C')
  })
  it('late evening UTC is already tomorrow in India', () => {
    expect(subscriptionReceiptNo(ID, new Date('2026-11-04T20:00:00Z'))).toBe('GGS-20261105-3F2A9C')
  })
})

describe('quotePurchase', () => {
  it('first plan, start now, at the offer price', () => {
    expect(quotePurchase(PLAN(), [], 'now', NOW)).toEqual({
      ok: true, amount: 599, actual: 999, onOffer: true, free: false, durationDays: 30,
      startMode: 'now', startsAt: NOW.toISOString(), endsAt: day(30), currentEnd: null,
    })
  })
  it('an offer that has ended is not given', () => {
    expect(quotePurchase(PLAN({ offer_ends_at: day(-1) }), [], 'now', NOW)).toMatchObject({ ok: true, amount: 999, onOffer: false })
  })
  it('an old Combined plan row is never sold again (two plans since 2026-11-10)', () => {
    expect(quotePurchase(PLAN({ kind: 'combined' }), [], 'now', NOW)).toEqual({ ok: false, error: 'This plan is not available any more.' })
  })
  it('₹0 plan', () => {
    expect(quotePurchase(PLAN({ actual_price: 0, offer_enabled: false, offer_price: null }), [], 'now', NOW)).toMatchObject({ ok: true, amount: 0, free: true })
  })
  it('already holding it: start after the current plan ends', () => {
    const q = quotePurchase(PLAN(), [SUB()], 'after_current', NOW)
    expect(q).toMatchObject({ ok: true, startsAt: day(10), endsAt: day(40), currentEnd: day(10) })
  })
  it('already holding it: start now at the FULL price (no part payment)', () => {
    expect(quotePurchase(PLAN(), [SUB()], 'now', NOW)).toMatchObject({ ok: true, amount: 599, startsAt: NOW.toISOString(), currentEnd: day(10) })
  })
  it('a Combined plan covers a Buying purchase', () => {
    expect(quotePurchase(PLAN(), [SUB({ kind: 'combined' })], 'after_current', NOW)).toMatchObject({ ok: true, startsAt: day(10) })
  })
  it('a Selling plan does not cover Buying', () => {
    expect(quotePurchase(PLAN(), [SUB({ kind: 'selling' })], 'after_current', NOW).ok).toBe(false)
  })
  it('a plan already bought to start later extends the chain', () => {
    const q = quotePurchase(PLAN(), [SUB(), SUB({ id: 's2', starts_at: day(10), ends_at: day(40) })], 'after_current', NOW)
    expect(q).toMatchObject({ ok: true, startsAt: day(40) })
  })
  it.each([
    ['nothing to start after', PLAN(), [], 'after_current', /no current plan/],
    ['free forever already', PLAN(), [SUB({ kind: 'combined', source: 'free_forever', ends_at: null })], 'now', /free, forever/],
    ['hidden plan', PLAN({ active: false }), [], 'now', /not available/],
    ['unknown kind', PLAN({ kind: 'gold' }), [], 'now', /not available/],
  ] as const)('refused: %s', (_n, plan, subs, mode, msg) => {
    const q = quotePurchase(plan, subs as unknown as SubscriptionRow[], mode, NOW)
    expect(q.ok).toBe(false)
    if (!q.ok) expect(q.error).toMatch(msg)
  })
  it('expired, pending and cancelled rows are ignored', () => {
    const subs = [SUB({ ends_at: day(-1) }), SUB({ id: 'p', status: 'pending' }), SUB({ id: 'c', status: 'cancelled' })]
    expect(currentCoverEnd(subs, 'buying', NOW)).toEqual({ endsAt: null, forever: false })
  })
})

describe('activationDates (when Cashfree confirms)', () => {
  it('"now" starts at confirmation, not when checkout opened', () => {
    expect(activationDates({ kind: 'buying', start_mode: 'now', duration_days: 30 }, [SUB()], NOW)).toEqual({ startsAt: NOW.toISOString(), endsAt: day(30) })
  })
  it('"after_current" starts when the live cover ends', () => {
    expect(activationDates({ kind: 'buying', start_mode: 'after_current', duration_days: 365 }, [SUB()], NOW)).toEqual({ startsAt: day(10), endsAt: day(375) })
  })
  it('"after_current" but the cover ended meanwhile → starts now, never in the past', () => {
    expect(activationDates({ kind: 'buying', start_mode: 'after_current', duration_days: 30 }, [SUB({ ends_at: day(-1) })], NOW).startsAt).toBe(NOW.toISOString())
  })
  it('a missing duration falls back to 30 days', () => {
    expect(activationDates({ kind: 'buying', duration_days: null }, [], NOW).endsAt).toBe(day(30))
  })
})

describe('standingOf', () => {
  it('forever', () => {
    expect(standingOf([SUB({ kind: 'combined', source: 'free_forever', ends_at: null })], NOW)).toEqual({ state: 'forever' })
  })
  it('active with days left', () => {
    expect(standingOf([SUB()], NOW)).toEqual({ state: 'active', endsAt: day(10), daysLeft: 10 })
  })
  it(`ending: within ${REMINDER_DAYS} days`, () => {
    expect(standingOf([SUB({ ends_at: day(2) })], NOW)).toEqual({ state: 'ending', endsAt: day(2), daysLeft: 2 })
  })
  it('a renewal bought to follow means it is not "ending"', () => {
    expect(standingOf([SUB({ ends_at: day(2) }), SUB({ id: 'n', starts_at: day(2), ends_at: day(32) })], NOW)).toMatchObject({ state: 'active', endsAt: day(32) })
  })
  it('expired, with days since', () => {
    expect(standingOf([SUB({ ends_at: day(-12) })], NOW)).toEqual({ state: 'expired', endedAt: day(-12), daysSince: 12 })
  })
  it('never had one', () => {
    expect(standingOf([], NOW)).toEqual({ state: 'none' })
    expect(standingOf([SUB({ status: 'pending' })], NOW)).toEqual({ state: 'none' })
  })
})

describe('hideDue (moderator may hide listings)', () => {
  it(`not before ${HIDE_AFTER_DAYS} days`, () => {
    expect(hideDue([SUB({ kind: 'selling', ends_at: day(-9) })], NOW)).toMatchObject({ due: false, daysSince: 9 })
  })
  it(`from day ${HIDE_AFTER_DAYS}`, () => {
    expect(hideDue([SUB({ kind: 'selling', ends_at: day(-10) })], NOW)).toEqual({ due: true, endedAt: day(-10), daysSince: 10 })
  })
  it('a Combined plan counts as selling', () => {
    expect(hideDue([SUB({ kind: 'combined', ends_at: day(-15) })], NOW).due).toBe(true)
  })
  it('only a Buying plan ended → selling was never paid for → not this list', () => {
    expect(hideDue([SUB({ kind: 'buying', ends_at: day(-30) })], NOW).due).toBe(false)
  })
  it('still selling, or free forever → never', () => {
    expect(hideDue([SUB({ kind: 'selling', ends_at: day(-30) }), SUB({ id: 'l', kind: 'selling' })], NOW).due).toBe(false)
    expect(hideDue([SUB({ kind: 'combined', source: 'free_forever', ends_at: null })], NOW).due).toBe(false)
  })
  it('never had a plan → not "expired"', () => {
    expect(hideDue([], NOW).due).toBe(false)
  })
})

describe('reminderDue (3-day WhatsApp)', () => {
  it('ends in 2 days → yes', () => {
    const s = SUB({ ends_at: day(2) })
    expect(reminderDue(s, [s], NOW)).toBe(true)
  })
  it('ends in 5 days → not yet', () => {
    const s = SUB({ ends_at: day(5) })
    expect(reminderDue(s, [s], NOW)).toBe(false)
  })
  it('already renewed → no', () => {
    const s = SUB({ ends_at: day(2) })
    expect(reminderDue(s, [s, SUB({ id: 'n', starts_at: day(2), ends_at: day(32) })], NOW)).toBe(false)
  })
  it('free forever alongside → no', () => {
    const s = SUB({ ends_at: day(2) })
    expect(reminderDue(s, [s, SUB({ id: 'f', kind: 'combined', source: 'free_forever', ends_at: null })], NOW)).toBe(false)
  })
  it('ended, never-ending, cancelled → no', () => {
    for (const s of [SUB({ ends_at: day(-1) }), SUB({ source: 'manual', ends_at: null }), SUB({ ends_at: day(1), status: 'cancelled' })]) {
      expect(reminderDue(s, [s], NOW)).toBe(false)
    }
  })
})

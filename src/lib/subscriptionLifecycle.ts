/**
 * The life of a subscription after a plan is chosen (Phase 4): what buying it
 * costs and when it starts, the Cashfree order id, the receipt number, whether
 * it is ending soon, and when a moderator may hide an expired aggregator's
 * listings. Pure — used by the aggregator subscribe routes, the Cashfree
 * webhook / reconcile, the reminder cron, the dashboard banner and the
 * moderator's expired list.
 *
 * Decisions (2026-11-04):
 *  - No refunds, no part payments. A second plan either starts NOW at the
 *    full price, or starts when the current plan ends.
 *  - ₹0 plan = starts at once without payment.
 *  - WhatsApp reminder 3 days before a plan ends; no auto-debit.
 *  - After a plan ends, listings stay visible 10 days; then the moderator
 *    may hide them. The app never hides them on its own.
 */

import {
  isPlanKind,
  isPlanRowKind,
  planPrice,
  subscriptionLive,
  unlocksBuying,
  unlocksSelling,
  type PlanKind,
  type PlanRow,
  type SubscriptionRow,
} from '@/lib/subscriptionPlans'

export const REMINDER_DAYS = 3
export const HIDE_AFTER_DAYS = 10
const DAY = 86_400_000

export type StartMode = 'now' | 'after_current'

// ── Cashfree order id ──────────────────────────────────────────────

/**
 * Our Cashfree order id for one payment attempt. "gs_" marks a subscription
 * (the shop's orders use "gg_"), so the shared webhook can tell them apart.
 * Unique per attempt: 3 + 32 + 1 + ~8 = 44 chars, under Cashfree's 45.
 */
export function makeSubscriptionOrderId(subscriptionId: string, now: number = Date.now()): string {
  return `gs_${subscriptionId.replace(/-/g, '')}_${now.toString(36)}`
}

export const isSubscriptionOrderId = (id: string | null | undefined): boolean =>
  typeof id === 'string' && /^gs_[0-9a-f]{32}_[0-9a-z]+$/.test(id)

// ── Receipt number ─────────────────────────────────────────────────

/** GGS-20261104-3F2A9C — the India date it started + the row id. */
export function subscriptionReceiptNo(subscriptionId: string, at: Date): string {
  const ist = new Date(at.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '')
  return `GGS-${ist}-${subscriptionId.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

// ── Buying a plan ──────────────────────────────────────────────────

/** Does a held row cover (at least) what this kind unlocks? */
function covers(held: PlanKind, wanted: PlanKind): boolean {
  if (held === 'combined') return true
  return held === wanted
}

/**
 * The latest end among live rows that already cover what this plan unlocks —
 * the date an "after the current plan" purchase starts on. null when there is
 * nothing to wait for (or it never ends — then buying is pointless).
 */
export function currentCoverEnd(subs: readonly SubscriptionRow[], kind: PlanKind, now: Date = new Date()): { endsAt: string | null; forever: boolean } {
  let endsAt: string | null = null
  let forever = false
  for (const s of subs) {
    if (!subscriptionLive(s, now) || !isPlanKind(s.kind) || !covers(s.kind, kind)) continue
    if (s.ends_at === null) forever = true
    else if (!endsAt || s.ends_at > endsAt) endsAt = s.ends_at
  }
  // Rows already bought to start later extend the chain.
  for (const s of subs) {
    if (s.status !== 'active' || !isPlanKind(s.kind) || !covers(s.kind, kind) || !s.ends_at) continue
    if (new Date(s.starts_at).getTime() > now.getTime() && (!endsAt || s.ends_at > endsAt)) endsAt = s.ends_at
  }
  return { endsAt: forever ? null : endsAt, forever }
}

export type Quote =
  | {
      ok: true
      amount: number
      actual: number
      onOffer: boolean
      free: boolean
      durationDays: number
      startMode: StartMode
      startsAt: string
      endsAt: string
      /** The aggregator already holds this, until this date (offer "start after"). */
      currentEnd: string | null
    }
  | { ok: false; error: string }

/**
 * What buying `plan` costs now and the dates it would run. The price is the
 * plan's CURRENT price (an offer that ended a second ago no longer applies) —
 * the server re-quotes at purchase and never takes a price from the browser.
 */
export function quotePurchase(
  plan: PlanRow,
  subs: readonly SubscriptionRow[],
  mode: StartMode,
  now: Date = new Date(),
): Quote {
  if (plan.active === false || !isPlanRowKind(plan.kind)) return { ok: false, error: 'This plan is not available any more.' }
  const days = Number(plan.duration_days)
  if (!Number.isInteger(days) || days < 1) return { ok: false, error: 'This plan is not available any more.' }
  const cover = currentCoverEnd(subs, plan.kind, now)
  if (cover.forever) return { ok: false, error: 'You already have this for free, forever — nothing to buy.' }
  if (mode === 'after_current' && !cover.endsAt) return { ok: false, error: 'You have no current plan to start after. Choose Start now.' }
  const p = planPrice(plan, now)
  const start = mode === 'after_current' && cover.endsAt ? new Date(cover.endsAt) : now
  return {
    ok: true,
    amount: p.price,
    actual: p.actual,
    onOffer: p.onOffer,
    free: p.free,
    durationDays: days,
    startMode: mode,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + days * DAY).toISOString(),
    currentEnd: cover.endsAt,
  }
}

/**
 * The dates a PAID row runs, worked out at the moment Cashfree confirms it
 * (not when the checkout opened): "now" starts then; "after_current" starts
 * when the cover that is live at that moment ends — never in the past.
 */
export function activationDates(
  row: { kind: string; start_mode?: string | null; duration_days?: number | null },
  otherSubs: readonly SubscriptionRow[],
  now: Date = new Date(),
): { startsAt: string; endsAt: string } {
  const days = Math.max(1, Math.round(Number(row.duration_days) || 30))
  let start = now
  if (row.start_mode === 'after_current' && isPlanKind(row.kind)) {
    const cover = currentCoverEnd(otherSubs, row.kind, now)
    if (cover.endsAt && new Date(cover.endsAt).getTime() > now.getTime()) start = new Date(cover.endsAt)
  }
  return { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + days * DAY).toISOString() }
}

// ── Where a subscription stands ────────────────────────────────────

export type Standing =
  | { state: 'forever' }
  | { state: 'active'; endsAt: string; daysLeft: number }
  | { state: 'ending'; endsAt: string; daysLeft: number }
  | { state: 'expired'; endedAt: string; daysSince: number }
  | { state: 'none' }

const daysBetween = (a: number, b: number) => Math.floor((b - a) / DAY)

/**
 * The aggregator's overall standing, for the dashboard banner and the
 * moderator list. "Ending" = within REMINDER_DAYS of the last live end, with
 * nothing bought to follow it.
 */
export function standingOf(subs: readonly SubscriptionRow[], now: Date = new Date()): Standing {
  const live = subs.filter((s) => subscriptionLive(s, now))
  if (live.some((s) => s.ends_at === null)) return { state: 'forever' }
  // Live, plus anything already bought to start later, chains the end date.
  const chain = subs.filter((s) => s.status === 'active' && isPlanKind(s.kind) && s.ends_at && new Date(s.ends_at).getTime() > now.getTime())
  if (live.length) {
    const end = chain.reduce((m, s) => (s.ends_at! > m ? s.ends_at! : m), live[0].ends_at ?? '')
    const daysLeft = Math.max(0, Math.ceil((new Date(end).getTime() - now.getTime()) / DAY))
    return daysLeft <= REMINDER_DAYS ? { state: 'ending', endsAt: end, daysLeft } : { state: 'active', endsAt: end, daysLeft }
  }
  const ended = subs
    .filter((s) => s.status === 'active' && isPlanKind(s.kind) && s.ends_at && new Date(s.ends_at).getTime() <= now.getTime())
    .map((s) => s.ends_at as string)
    .sort()
    .pop()
  if (ended) return { state: 'expired', endedAt: ended, daysSince: daysBetween(new Date(ended).getTime(), now.getTime()) }
  return { state: 'none' }
}

/**
 * May a moderator hide this aggregator's listings? Only when they cannot sell
 * now, their last plan that allowed selling ended HIDE_AFTER_DAYS or more ago,
 * and they never held free-forever. A brand-new aggregator who never had a plan
 * is not "expired" — Phase 7 (the selling lock) handles them.
 */
export function hideDue(subs: readonly SubscriptionRow[], now: Date = new Date()): { due: boolean; endedAt: string | null; daysSince: number } {
  const sellingRows = subs.filter((s) => s.status === 'active' && isPlanKind(s.kind) && unlocksSelling(s.kind as PlanKind))
  if (sellingRows.some((s) => subscriptionLive(s, now))) return { due: false, endedAt: null, daysSince: 0 }
  if (sellingRows.some((s) => s.ends_at === null)) return { due: false, endedAt: null, daysSince: 0 }
  const last = sellingRows.map((s) => s.ends_at as string).filter(Boolean).sort().pop() ?? null
  if (!last) return { due: false, endedAt: null, daysSince: 0 }
  const days = daysBetween(new Date(last).getTime(), now.getTime())
  return { due: days >= HIDE_AFTER_DAYS, endedAt: last, daysSince: days }
}

/**
 * Should this row get the "ends in 3 days" WhatsApp today? It must be live,
 * end within REMINDER_DAYS, and nothing already bought may continue after it.
 */
export function reminderDue(row: SubscriptionRow, allSubs: readonly SubscriptionRow[], now: Date = new Date()): boolean {
  if (!subscriptionLive(row, now) || !row.ends_at || !isPlanKind(row.kind)) return false
  const left = new Date(row.ends_at).getTime() - now.getTime()
  if (left <= 0 || left > REMINDER_DAYS * DAY) return false
  const cover = currentCoverEnd(allSubs.filter((s) => s.id !== row.id), row.kind as PlanKind, now)
  if (cover.forever) return false
  // Something else already carries this cover past the row's end.
  return !(cover.endsAt && cover.endsAt > row.ends_at)
}

/** What a kind unlocks, as a short list for banners. */
export function unlocks(kind: PlanKind): { buying: boolean; selling: boolean } {
  return { buying: unlocksBuying(kind), selling: unlocksSelling(kind) }
}

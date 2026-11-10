/**
 * Aggregator subscription plans: what a plan costs right now, how it reads on
 * the homepage, what a moderator may save, and what an aggregator holds.
 * Pure — used by the moderator Plans screen, its API routes, the /home pages,
 * and later the subscribe flow (Phase 4) and the bulk market (Phase 5).
 *
 * Decisions (2026-11-04, changed 2026-11-10): there are exactly THREE fixed
 * plans — Buying, Selling and Buying + Selling (combined) — one of each, and a
 * moderator only edits their price, duration and offer (no adding, no
 * deleting). The client's own accounts hold free-forever Combined rows.
 * Moderators are super-users for now; price ₹0 = free (no payment); an offer is a lower
 * price with an optional end date, after which the actual price shows again by
 * itself; existing aggregators hold a free-forever Combined row; no refunds or
 * part payments. Schema: scripts/subscription-migration.sql.
 */

export type Msg = { en: string; te: string }

export const PLAN_KINDS = ['buying', 'selling', 'combined'] as const
export type PlanKind = (typeof PLAN_KINDS)[number]

/** The fixed plans, one row each, in screen order (scripts/fixed-plans-migration.sql). */
export const PLAN_ROW_KINDS = ['buying', 'selling', 'combined'] as const
export type PlanRowKind = (typeof PLAN_ROW_KINDS)[number]
export const isPlanRowKind = (v: unknown): v is PlanRowKind =>
  typeof v === 'string' && (PLAN_ROW_KINDS as readonly string[]).includes(v)

export const SUB_SOURCES = ['payment', 'free_plan', 'manual', 'free_forever'] as const
export type SubSource = (typeof SUB_SOURCES)[number]

/** Same bounds as the CHECK constraints in the migration. */
export const MAX_PLAN_PRICE = 1_000_000
export const MAX_PLAN_DAYS = 3650
export const MAX_PLAN_NAME = 60
export const MAX_HIGHLIGHTS = 8
export const MAX_HIGHLIGHT_LEN = 120

export const PLAN_KIND_LABELS: Record<PlanKind, Msg> = {
  buying: { en: 'Buying', te: 'కొనుగోలు' },
  selling: { en: 'Selling', te: 'అమ్మకం' },
  combined: { en: 'Buying + Selling', te: 'కొనుగోలు + అమ్మకం' },
}

export const PLAN_KIND_BLURBS: Record<PlanKind, Msg> = {
  buying: {
    en: 'Buy bulk produce straight from farmers and other aggregators.',
    te: 'రైతులు, ఇతర అగ్రిగేటర్ల నుండి నేరుగా బల్క్‌గా కొనండి.',
  },
  selling: {
    en: 'List your produce on Go Grameen — retail, wholesale or both.',
    te: 'మీ ఉత్పత్తులను గో గ్రామీణ్‌లో అమ్మండి — చిల్లర, హోల్‌సేల్ లేదా రెండూ.',
  },
  combined: {
    en: 'Everything: buy in bulk and sell on Go Grameen.',
    te: 'అన్నీ: బల్క్‌గా కొనండి, గో గ్రామీణ్‌లో అమ్మండి.',
  },
}

/** What a kind unlocks. */
export const unlocksBuying = (k: PlanKind) => k === 'buying' || k === 'combined'
export const unlocksSelling = (k: PlanKind) => k === 'selling' || k === 'combined'

export type PlanRow = {
  id: string
  kind: PlanKind | string
  name_en: string
  name_te?: string | null
  duration_days: number
  actual_price: number | string
  offer_enabled?: boolean | null
  offer_price?: number | string | null
  offer_ends_at?: string | null
  offer_label_en?: string | null
  offer_label_te?: string | null
  highlights_en?: string | null
  highlights_te?: string | null
  active?: boolean | null
  sort_order?: number | null
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export const isPlanKind = (v: unknown): v is PlanKind => typeof v === 'string' && (PLAN_KINDS as readonly string[]).includes(v)

/** Is the offer running at `now`? Enabled, priced below actual, not ended. */
export function offerIsLive(p: PlanRow, now: Date = new Date()): boolean {
  if (!p.offer_enabled) return false
  const offer = num(p.offer_price)
  const actual = num(p.actual_price) ?? 0
  if (offer === null || offer < 0 || offer >= actual) return false
  if (p.offer_ends_at) {
    const end = new Date(p.offer_ends_at).getTime()
    if (!Number.isFinite(end) || end <= now.getTime()) return false
  }
  return true
}

export type PlanPrice = {
  /** What the aggregator pays now. */
  price: number
  /** The original price (shown crossed out when on offer). */
  actual: number
  onOffer: boolean
  /** ₹ saved and % saved (whole percent, rounded down so it never overstates). */
  savings: number
  savingsPct: number
  free: boolean
  /** When the offer ends, if it does. */
  offerEndsAt: string | null
}

export function planPrice(p: PlanRow, now: Date = new Date()): PlanPrice {
  const actual = Math.max(0, num(p.actual_price) ?? 0)
  const live = offerIsLive(p, now)
  const price = live ? (num(p.offer_price) as number) : actual
  const savings = live ? Math.round((actual - price) * 100) / 100 : 0
  return {
    price,
    actual,
    onOffer: live,
    savings,
    savingsPct: live && actual > 0 ? Math.floor((savings / actual) * 100) : 0,
    free: price === 0,
    offerEndsAt: live ? (p.offer_ends_at ?? null) : null,
  }
}

/** "1 month", "1 year", "3 months", "45 days" — both languages. */
export function durationLabel(days: number): Msg {
  const d = Math.round(days)
  if (d > 0 && d % 365 === 0) {
    const y = d / 365
    return y === 1 ? { en: '1 year', te: '1 సంవత్సరం' } : { en: `${y} years`, te: `${y} సంవత్సరాలు` }
  }
  if (d > 0 && d % 30 === 0) {
    const m = d / 30
    return m === 1 ? { en: '1 month', te: '1 నెల' } : { en: `${m} months`, te: `${m} నెలలు` }
  }
  return d === 1 ? { en: '1 day', te: '1 రోజు' } : { en: `${d} days`, te: `${d} రోజులు` }
}

/** "/month", "/year" or " for 45 days" after a price. */
export function perLabel(days: number): Msg {
  if (days === 30) return { en: '/month', te: '/నెల' }
  if (days === 365) return { en: '/year', te: '/సంవత్సరం' }
  const d = durationLabel(days)
  return { en: ` for ${d.en}`, te: ` ${d.te}కు` }
}

/** ₹1,499 or ₹99.50 — Indian grouping, paise only when there are any. */
export function inr(v: number): string {
  const n = Math.round(v * 100) / 100
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`
}

/** Benefit lines from the textarea: one per line, blanks dropped, capped. */
export function highlightLines(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•\-*]+/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_HIGHLIGHTS)
}

/**
 * Active plans in homepage order: the fixed order Buying, Selling,
 * Buying + Selling (moderators cannot reorder since 2026-11-10, so the stored
 * sort_order is not trusted), then cheapest first.
 */
export function sortPlans<T extends PlanRow>(plans: readonly T[], now: Date = new Date()): T[] {
  const rank = (p: PlanRow) => PLAN_ROW_KINDS.indexOf(p.kind as PlanRowKind)
  return plans
    .filter((p) => p.active !== false && isPlanRowKind(p.kind))
    .slice()
    .sort((a, b) => rank(a) - rank(b) || planPrice(a, now).price - planPrice(b, now).price)
}

/**
 * The homepage teaser on the Aggregator card: the lowest current price, and the
 * biggest saving on offer. null when there are no plans to show.
 */
export function plansTeaser(plans: readonly PlanRow[], now: Date = new Date()):
  { fromPrice: number; fromPer: Msg; bestSavingPct: number; anyFree: boolean } | null {
  const live = sortPlans(plans, now)
  if (!live.length) return null
  let cheapest = live[0]
  for (const p of live) if (planPrice(p, now).price < planPrice(cheapest, now).price) cheapest = p
  const bestSavingPct = Math.max(0, ...live.map((p) => planPrice(p, now).savingsPct))
  return {
    fromPrice: planPrice(cheapest, now).price,
    fromPer: perLabel(cheapest.duration_days),
    bestSavingPct,
    anyFree: live.some((p) => planPrice(p, now).free),
  }
}

// ── Moderator input ─────────────────────────────────────────────────

export type PlanColumns = {
  kind: PlanRowKind
  name_en: string
  name_te: string | null
  duration_days: number
  actual_price: number
  offer_enabled: boolean
  offer_price: number | null
  offer_ends_at: string | null
  offer_label_en: string | null
  offer_label_te: string | null
  highlights_en: string | null
  highlights_te: string | null
  active: boolean
  sort_order: number
}

export type PlanInput = Partial<Record<keyof PlanColumns, unknown>>

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

const lines = (v: unknown): string | null => {
  const l = highlightLines(typeof v === 'string' ? v : '').map((x) => x.slice(0, MAX_HIGHLIGHT_LEN))
  return l.length ? l.join('\n') : null
}

// To the paisa. toPrecision first: 599.555 * 100 is 59955.4999… in floating
// point, which would otherwise round the wrong way.
const money = (v: unknown): number | null => {
  const n = num(v)
  return n === null ? null : Math.round(Number((n * 100).toPrecision(12))) / 100
}

/**
 * Check and clean what the moderator typed. Mirrors every CHECK in the
 * migration, so a bad plan is refused with a plain message here rather than a
 * database error.
 */
export function validatePlan(input: PlanInput, now: Date = new Date()):
  { ok: true; columns: PlanColumns } | { ok: false; error: string } {
  if (!isPlanRowKind(input.kind)) return { ok: false, error: 'A plan is Buying, Selling or Buying + Selling.' }
  const name = text(input.name_en, MAX_PLAN_NAME + 1)
  if (!name) return { ok: false, error: 'Enter a plan name.' }
  if (name.length > MAX_PLAN_NAME) return { ok: false, error: `Plan name must be ${MAX_PLAN_NAME} characters or less.` }
  const nameTe = text(input.name_te, MAX_PLAN_NAME + 1)
  if (nameTe && nameTe.length > MAX_PLAN_NAME) return { ok: false, error: `Telugu name must be ${MAX_PLAN_NAME} characters or less.` }

  const days = num(input.duration_days)
  if (days === null || !Number.isInteger(days) || days < 1 || days > MAX_PLAN_DAYS) {
    return { ok: false, error: `Duration must be a whole number of days, 1 to ${MAX_PLAN_DAYS}.` }
  }

  const actual = money(input.actual_price)
  if (actual === null || actual < 0 || actual > MAX_PLAN_PRICE) {
    return { ok: false, error: 'Enter the actual price (₹0 for a free plan).' }
  }

  const offerEnabled = input.offer_enabled === true
  const offer = money(input.offer_price)
  if (offer !== null && (offer < 0 || offer >= actual)) {
    return { ok: false, error: actual === 0 ? 'A free plan cannot have an offer.' : 'Offer price must be lower than the actual price.' }
  }
  if (offerEnabled && offer === null) return { ok: false, error: 'Enter the offer price, or switch the offer off.' }

  let endsAt: string | null = null
  if (input.offer_ends_at !== undefined && input.offer_ends_at !== null && input.offer_ends_at !== '') {
    const d = new Date(String(input.offer_ends_at))
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'Offer end date is not a valid date.' }
    if (offerEnabled && d.getTime() <= now.getTime()) return { ok: false, error: 'Offer end date must be in the future.' }
    endsAt = d.toISOString()
  }

  const sort = num(input.sort_order)
  return {
    ok: true,
    columns: {
      kind: input.kind,
      name_en: name,
      name_te: nameTe,
      duration_days: days,
      actual_price: actual,
      offer_enabled: offerEnabled,
      offer_price: offer,
      offer_ends_at: endsAt,
      offer_label_en: text(input.offer_label_en, 40),
      offer_label_te: text(input.offer_label_te, 40),
      highlights_en: lines(input.highlights_en),
      highlights_te: lines(input.highlights_te),
      active: input.active !== false,
      sort_order: sort !== null && Number.isInteger(sort) ? Math.max(-1000, Math.min(1000, sort)) : 0,
    },
  }
}

// ── What an aggregator holds ────────────────────────────────────────

export type SubscriptionRow = {
  id: string
  kind: PlanKind | string
  source: SubSource | string
  status: string
  starts_at: string
  ends_at: string | null
  plan_name?: string | null
  amount_paid?: number | string | null
}

export type Access = {
  buying: boolean
  selling: boolean
  /** Holds a never-ending grant (free forever / manual with no end). */
  forever: boolean
  /** The latest end among the active rows that unlock something (null = forever or none). */
  endsAt: string | null
  /** Active rows right now. */
  current: SubscriptionRow[]
}

/** Is this row in force at `now`? */
export function subscriptionLive(s: SubscriptionRow, now: Date = new Date()): boolean {
  if (s.status !== 'active' || !isPlanKind(s.kind)) return false
  const t = now.getTime()
  const start = new Date(s.starts_at).getTime()
  if (Number.isFinite(start) && start > t) return false
  if (s.ends_at === null) return true
  const end = new Date(s.ends_at).getTime()
  return Number.isFinite(end) && end > t
}

export function accessOf(subs: readonly SubscriptionRow[], now: Date = new Date()): Access {
  const current = subs.filter((s) => subscriptionLive(s, now))
  const forever = current.some((s) => s.ends_at === null)
  let endsAt: string | null = null
  if (!forever) {
    for (const s of current) if (s.ends_at && (!endsAt || s.ends_at > endsAt)) endsAt = s.ends_at
  }
  return {
    buying: current.some((s) => unlocksBuying(s.kind as PlanKind)),
    selling: current.some((s) => unlocksSelling(s.kind as PlanKind)),
    forever,
    endsAt,
    current,
  }
}

/**
 * A moderator's manual grant. `days` null = no end (only allowed for manual /
 * free-forever, the same rule as the database). Returns the row to insert.
 */
export function manualGrant(
  input: { kind: unknown; days?: unknown; forever?: unknown; note?: unknown },
  now: Date = new Date(),
): { ok: true; row: { kind: PlanKind; source: 'manual' | 'free_forever'; starts_at: string; ends_at: string | null; amount_paid: 0; plan_name: string; note: string | null } } | { ok: false; error: string } {
  if (!isPlanKind(input.kind)) return { ok: false, error: 'Choose what to unlock: Buying, Selling or both.' }
  const forever = input.forever === true
  let endsAt: string | null = null
  if (!forever) {
    const d = num(input.days)
    if (d === null || !Number.isInteger(d) || d < 1 || d > MAX_PLAN_DAYS) {
      return { ok: false, error: `Enter the number of days (1 to ${MAX_PLAN_DAYS}), or choose Free forever.` }
    }
    endsAt = new Date(now.getTime() + d * 86_400_000).toISOString()
  }
  const label = PLAN_KIND_LABELS[input.kind].en
  return {
    ok: true,
    row: {
      kind: input.kind,
      source: forever ? 'free_forever' : 'manual',
      starts_at: now.toISOString(),
      ends_at: endsAt,
      amount_paid: 0,
      plan_name: forever ? `Free forever · ${label}` : `Activated by moderator · ${label}`,
      note: text(input.note, 200),
    },
  }
}

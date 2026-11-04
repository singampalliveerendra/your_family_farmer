import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AGGREGATOR_CONTENT, CONSUMER_CONTENT, FARMER_CONTENT, PLAN_COMPARE, ROLE_ACCENT, type Pair, type RoleContent } from '@/lib/roleContent'
import { ROLE_CARDS } from '@/components/home/RoleSelect'

// The role explainer pages: both languages everywhere, every link real, and
// the promises match the 2026-11-04 decisions.

const TELUGU = /[ఀ-౿]/
const pairsOf = (c: RoleContent): Pair[] => [
  c.badge, c.title, c.intro,
  ...c.glance.flatMap((g) => [g.value, g.label]),
  ...c.benefits.flatMap((b) => [b.title, b.body]),
  ...c.steps.flatMap((s) => [s.title, s.body]),
  ...(c.features ?? []),
  ...c.terms,
  ...c.faqs.flatMap((f) => [f.q, f.a]),
  ...c.ctas.map((x) => x.label),
  ...(c.stepsNote ? [c.stepsNote] : []),
]
const routeExists = (href: string) => {
  const path = href.split(/[?#]/)[0]
  return existsSync(join(process.cwd(), 'src/app', path, 'page.tsx'))
}

describe.each([['consumer', CONSUMER_CONTENT], ['farmer', FARMER_CONTENT], ['aggregator', AGGREGATOR_CONTENT]] as const)('%s page', (_n, c) => {
  it('every line has English and Telugu', () => {
    for (const [en, te] of pairsOf(c)) {
      expect(en.trim().length).toBeGreaterThan(0)
      // Pure figures ("₹0", "0%") read the same in both languages.
      if (/^[₹\d%.\s]+$/.test(te)) expect(te).toBe(en)
      else expect(te).toMatch(TELUGU)
    }
  })
  it('every button goes to a real page, exactly one is the main step', () => {
    for (const x of c.ctas) expect(routeExists(x.href), x.href).toBe(true)
    expect(c.ctas.filter((x) => x.primary)).toHaveLength(1)
  })
  it('three facts at a glance, and its own accent colour', () => {
    expect(c.glance).toHaveLength(3)
    expect(ROLE_ACCENT[c.role].ink).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('every icon is a real icon', async () => {
    const src = readFileSync(join(process.cwd(), 'src/components/home/Icon.tsx'), 'utf8')
    for (const b of c.benefits) expect(src).toMatch(new RegExp(`\\n  ${b.icon}: '`))
  })
  it('no duplicate lines (they are React keys)', () => {
    const keys = [...c.benefits.map((b) => b.title[0]), ...c.steps.map((s) => s.title[0]), ...c.terms.map((t) => t[0]), ...c.faqs.map((f) => f.q[0])]
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('the promises match the decisions', () => {
  const text = (c: RoleContent) => pairsOf(c).map((p) => p[0]).join(' ')
  it('farmers: free, no subscription, bulk only for aggregators', () => {
    const t = text(FARMER_CONTENT)
    expect(t).toMatch(/No subscription/)
    expect(t).toMatch(/only to aggregators/)
    expect(t).not.toMatch(/₹[1-9]/) // farmers are never quoted a price (only ₹0)
    expect(FARMER_CONTENT.steps.some((s) => s.soon)).toBe(false) // everything for farmers is live
  })
  it('aggregators: no refunds, 10 days after expiry, Cashfree only, contacts after subscribing', () => {
    const t = text(AGGREGATOR_CONTENT)
    expect(t).toMatch(/no refunds/i)
    expect(t).toMatch(/10 days/)
    expect(t).toMatch(/Cashfree — no cash on delivery/)
    expect(t).toMatch(/phone numbers .* only to subscribed aggregators/)
    expect(t).toMatch(/0% platform fee/)
    expect(t).toMatch(/3 days before/)
  })
  it('consumers: retail only, refunds on decline', () => {
    const t = text(CONSUMER_CONTENT)
    expect(t).toMatch(/Bulk \(wholesale\) lots are for aggregators/)
    expect(t).toMatch(/refunded automatically/)
  })
  it('what is not built yet says so', () => {
    // Paying for a plan is live (Phase 4); the bulk market is not yet.
    expect(AGGREGATOR_CONTENT.steps.filter((s) => s.soon).map((s) => s.title[0])).toEqual([
      'Look around the bulk market', 'Buy direct from farmers',
    ])
    expect(AGGREGATOR_CONTENT.stepsNote?.[0]).toMatch(/opening soon/)
    expect(CONSUMER_CONTENT.steps.some((s) => s.soon)).toBe(false)
  })
})

describe('/home role cards', () => {
  it('three ways in, in order, each to real pages', () => {
    expect(ROLE_CARDS.map((c) => c.role)).toEqual(['consumer', 'farmer', 'aggregator'])
    expect(ROLE_CARDS.map((c) => c.primary.href)).toEqual(['/consumer', '/home/farmer', '/home/aggregator'])
    for (const c of ROLE_CARDS) {
      expect(routeExists(c.primary.href), c.primary.href).toBe(true)
      expect(routeExists(c.secondary.href), c.secondary.href).toBe(true)
      expect(c.points).toHaveLength(3)
      for (const p of [c.title, ...c.points, c.primary.label, c.secondary.label]) expect(p[1]).toMatch(TELUGU)
    }
  })
  it('plan prices only on the aggregator card', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/home/RoleSelect.tsx'), 'utf8')
    expect(src).toMatch(/role !== 'aggregator'/)
  })
})

describe('plan comparison table', () => {
  it('Combined unlocks everything; Buying and Selling split the rest', () => {
    for (const r of PLAN_COMPARE) {
      expect(r.combined).toBe(true)
      expect(r.label[1]).toMatch(TELUGU)
    }
    expect(PLAN_COMPARE.some((r) => r.buying && !r.selling)).toBe(true)
    expect(PLAN_COMPARE.some((r) => r.selling && !r.buying)).toBe(true)
  })
})

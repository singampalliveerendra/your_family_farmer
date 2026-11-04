import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AGGREGATOR_CONTENT, FARMER_CONTENT, type Pair, type RoleContent } from '@/lib/roleContent'

// The role explainer pages: both languages everywhere, every link real, and
// the promises match the 2026-11-04 decisions.

const TELUGU = /[ఀ-౿]/
const pairsOf = (c: RoleContent): Pair[] => [
  c.badge, c.title, c.intro,
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

describe.each([['farmer', FARMER_CONTENT], ['aggregator', AGGREGATOR_CONTENT]] as const)('%s page', (_n, c) => {
  it('every line has English and Telugu', () => {
    for (const [en, te] of pairsOf(c)) {
      expect(en.trim().length).toBeGreaterThan(0)
      expect(te).toMatch(TELUGU)
    }
  })
  it('every button goes to a real page, exactly one is the main step', () => {
    for (const x of c.ctas) expect(routeExists(x.href), x.href).toBe(true)
    expect(c.ctas.filter((x) => x.primary)).toHaveLength(1)
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
    expect(t).not.toMatch(/₹\d/) // farmers are never quoted a price
    expect(FARMER_CONTENT.steps.some((s) => s.soon)).toBe(false) // everything for farmers is live
  })
  it('aggregators: no refunds, 10 days after expiry, Cashfree only, contacts after subscribing', () => {
    const t = text(AGGREGATOR_CONTENT)
    expect(t).toMatch(/no refunds/i)
    expect(t).toMatch(/10 days/)
    expect(t).toMatch(/Cashfree — no cash on delivery/)
    expect(t).toMatch(/phone numbers .* only to subscribed aggregators/)
    expect(t).toMatch(/0% platform fee/)
  })
  it('what is not built yet says so', () => {
    expect(AGGREGATOR_CONTENT.steps.filter((s) => s.soon).map((s) => s.title[0])).toEqual([
      'Look around before you pay', 'Pick a plan', 'Buy direct from farmers',
    ])
    expect(AGGREGATOR_CONTENT.stepsNote?.[0]).toMatch(/opening soon/)
  })
})

describe('/home role cards', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/home/RoleSelect.tsx'), 'utf8')
  it('three ways in, each to a real page', () => {
    const hrefs = [...src.matchAll(/href: '([^']+)'/g)].map((m) => m[1])
    expect(hrefs).toEqual(['/consumer', '/home/farmer', '/home/aggregator'])
    for (const h of hrefs) expect(routeExists(h), h).toBe(true)
  })
  it('plan prices only on the aggregator card', () => {
    expect(src).toMatch(/key !== 'aggregator'/)
  })
})

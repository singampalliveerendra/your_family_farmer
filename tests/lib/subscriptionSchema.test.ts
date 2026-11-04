import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MAX_PLAN_DAYS, MAX_PLAN_PRICE, PLAN_KINDS, SUB_SOURCES } from '@/lib/subscriptionPlans'
import { PUBLIC_PLAN_COLUMNS } from '@/lib/publicPlans'

// The subscription migration, the schema snapshot and src/lib/subscriptionPlans.ts
// must agree. Comments are stripped so a mention in a comment can't pass.
const sql = (f: string) => readFileSync(join(process.cwd(), 'scripts', f), 'utf8').replace(/--.*$/gm, '')
const list = (s: string, re: RegExp) => {
  const m = s.match(re)
  expect(m, String(re)).not.toBeNull()
  return m![1].split(',').map((x) => x.trim().replace(/'/g, ''))
}

describe.each(['subscription-migration.sql', 'staging-schema.sql'])('%s', (file) => {
  const s = sql(file)
  it('plan kinds match the code (both tables)', () => {
    expect(list(s, /subscription_plans_kind_check\s+CHECK \(kind IN \(([^)]*)\)\)/)).toEqual([...PLAN_KINDS])
    expect(list(s, /aggregator_subscriptions_kind_check\s+CHECK \(kind IN \(([^)]*)\)\)/)).toEqual([...PLAN_KINDS])
  })
  it('sources match the code', () => {
    expect(list(s, /CHECK \(source IN \(([^)]*)\)\)/)).toEqual([...SUB_SOURCES])
  })
  it('limits match the code', () => {
    expect(s).toMatch(new RegExp(`duration_days BETWEEN 1 AND ${MAX_PLAN_DAYS}`))
    expect(s).toMatch(new RegExp(`actual_price <= ${MAX_PLAN_PRICE}`))
  })
  it('an enabled offer cannot be passed by a NULL price (COALESCE)', () => {
    expect(s).toMatch(/NOT offer_enabled OR COALESCE\(offer_price, -1\) >= 0/)
    expect(s).toMatch(/offer_price < actual_price/)
  })
  it('only moderator grants may run forever; only payments carry money', () => {
    expect(s).toMatch(/ends_at IS NOT NULL OR source IN \('free_forever', 'manual'\)/)
    expect(s).toMatch(/source = 'payment' OR amount_paid = 0/)
  })
  it('security: anon reads ACTIVE plans only, never subscriptions, writes nothing', () => {
    expect(s).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(s).toMatch(/GRANT SELECT ON public\.subscription_plans TO anon, authenticated/)
    expect(s).toMatch(/FOR SELECT TO anon, authenticated USING \(active = true\)/)
    expect(s).toMatch(/REVOKE ALL ON public\.aggregator_subscriptions FROM anon, authenticated/)
    expect(s).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*subscription/i)
    expect(s).not.toMatch(/CREATE POLICY[^;]*aggregator_subscriptions/)
  })
  it('the public page asks only for columns the table has', () => {
    for (const c of PUBLIC_PLAN_COLUMNS.split(',').map((x) => x.trim())) expect(s).toMatch(new RegExp(`\\n\\s+${c}\\s`))
  })
})

describe('migration only', () => {
  const s = sql('subscription-migration.sql')
  it('existing aggregators get free forever, once', () => {
    expect(s).toMatch(/'combined', 'free_forever', 'active', now\(\), NULL, 0/)
    expect(s).toMatch(/WHERE f\.account_type = 'aggregator'/)
    expect(s).toMatch(/AND NOT EXISTS/)
  })
  it('prod check lists both tables', () => {
    const c = readFileSync(join(process.cwd(), 'scripts/CHECK-prod-migrations.sql'), 'utf8')
    expect(c).toMatch(/table_name='subscription_plans'/)
    expect(c).toMatch(/table_name='aggregator_subscriptions'/)
  })
})

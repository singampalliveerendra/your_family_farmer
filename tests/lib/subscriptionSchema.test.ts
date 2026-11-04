import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MAX_PLAN_DAYS, MAX_PLAN_PRICE, PLAN_KINDS, SUB_SOURCES } from '@/lib/subscriptionPlans'
import { PUBLIC_PLAN_COLUMNS } from '@/lib/publicPlans'
import { SUB_ROW_COLUMNS } from '@/lib/subscriptionSettle'

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

describe.each(['subscription-payments-migration.sql', 'staging-schema.sql'])('payments part: %s', (file) => {
  const s = sql(file)
  it('adds every column the settle / receipt code writes', () => {
    for (const c of ['cashfree_order_id', 'payment_ref', 'payment_label', 'paid_at', 'receipt_no', 'duration_days', 'start_mode']) {
      expect(s).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\b`))
    }
    // Across both parts: the server reads every one of these columns.
    const both = file === 'staging-schema.sql' ? s : s + sql('subscription-migration.sql')
    for (const c of SUB_ROW_COLUMNS.split(',').map((x) => x.trim())) expect(both, c).toMatch(new RegExp(`\\b${c}\\b`))
  })
  it('a payment row only counts once really paid; only payments carry a Cashfree order', () => {
    expect(s).toMatch(/source <> 'payment' OR status <> 'active' OR \(cashfree_order_id IS NOT NULL AND paid_at IS NOT NULL\)/)
    expect(s).toMatch(/cashfree_order_id IS NULL OR source = 'payment'/)
    expect(s).toMatch(/start_mode IN \('now', 'after_current'\)/)
  })
  it('one Cashfree order and one receipt number per row', () => {
    expect(s).toMatch(/UNIQUE INDEX IF NOT EXISTS aggregator_subscriptions_cashfree_order_idx/)
    expect(s).toMatch(/UNIQUE INDEX IF NOT EXISTS aggregator_subscriptions_receipt_idx/)
  })
  it('holds: one open hold per listing, server-only', () => {
    expect(s).toMatch(/subscription_listing_holds_open_idx[\s\S]*WHERE released_at IS NULL/)
    expect(s).toMatch(/REVOKE ALL ON public\.subscription_listing_holds FROM anon, authenticated/)
    expect(s).not.toMatch(/CREATE POLICY[^;]*subscription_listing_holds/)
  })
})

describe('prod check lists the payments part', () => {
  it('both new pieces', () => {
    const c = readFileSync(join(process.cwd(), 'scripts/CHECK-prod-migrations.sql'), 'utf8')
    expect(c).toMatch(/column_name='cashfree_order_id'/)
    expect(c).toMatch(/table_name='subscription_listing_holds'/)
  })
})

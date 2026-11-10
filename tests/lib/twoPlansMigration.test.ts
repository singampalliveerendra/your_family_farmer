import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// scripts/two-plans-migration.sql (client card 2026-11-10): exactly one Buying
// and one Selling plan; the client's free-forever Combined SUBSCRIPTIONS are
// left alone. Mirrored in staging-schema.sql so a zip review sees it.
const sql = readFileSync(join(process.cwd(), 'scripts/two-plans-migration.sql'), 'utf8')
const schema = readFileSync(join(process.cwd(), 'scripts/staging-schema.sql'), 'utf8')
const code = sql.replace(/--.*$/gm, '')

describe('two-plans migration', () => {
  it('hides any Combined plan instead of deleting it (subscriptions point at it)', () => {
    expect(code).toMatch(/UPDATE public\.subscription_plans\s+SET active = false[\s\S]*WHERE kind = 'combined'/)
    expect(code).not.toMatch(/DELETE/i)
  })
  it('seeds Buying and Selling only if missing, hidden and at ₹0 until a moderator prices them', () => {
    for (const k of ['buying', 'selling']) {
      expect(code).toMatch(new RegExp(`SELECT '${k}',[\\s\\S]*?false, \\d+\\s+WHERE NOT EXISTS \\(SELECT 1 FROM public\\.subscription_plans WHERE kind = '${k}'\\)`))
    }
    expect(code).toMatch(/30, 0, false/)
  })
  it('one plan per kind and never a Combined plan on show — in the migration and the schema', () => {
    for (const s of [code, schema]) {
      expect(s).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_one_per_kind\s+ON public\.subscription_plans \(kind\) WHERE kind IN \('buying', 'selling'\)/)
      expect(s).toMatch(/CHECK \(kind <> 'combined' OR NOT active\)/)
    }
  })
  it('never touches aggregator_subscriptions (free-forever Combined rows stay)', () => {
    expect(code).not.toMatch(/aggregator_subscriptions/)
  })
})

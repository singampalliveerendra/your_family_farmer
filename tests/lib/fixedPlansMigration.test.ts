import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// scripts/fixed-plans-migration.sql (2026-11-10): exactly one Buying, one
// Selling and one Buying + Selling plan; the client's free-forever Combined
// SUBSCRIPTIONS are left alone. Mirrored in staging-schema.sql so a zip
// review sees it.
const sql = readFileSync(join(process.cwd(), 'scripts/fixed-plans-migration.sql'), 'utf8')
const schema = readFileSync(join(process.cwd(), 'scripts/staging-schema.sql'), 'utf8')
const code = sql.replace(/--.*$/gm, '')

describe('fixed-plans migration', () => {
  it('seeds each of the three plans only if missing, hidden and at ₹0 until a moderator prices them', () => {
    for (const k of ['buying', 'selling', 'combined']) {
      expect(code).toMatch(new RegExp(`SELECT '${k}', '[^']+', '[^']+', 30, 0, false,[\\s\\S]*?false, \\d+\\s+WHERE NOT EXISTS \\(SELECT 1 FROM public\\.subscription_plans WHERE kind = '${k}'\\)`))
    }
  })
  it('never hides, edits or deletes a plan that is already there', () => {
    expect(code).not.toMatch(/UPDATE|DELETE/i)
  })
  it('undoes the two-plans version: Combined may be shown again', () => {
    expect(code).toMatch(/DROP INDEX IF EXISTS public\.subscription_plans_one_per_kind/)
    expect(code).toMatch(/DROP CONSTRAINT IF EXISTS subscription_plans_no_combined_on_show/)
    expect(schema).not.toMatch(/subscription_plans_one_per_kind|no_combined_on_show/)
  })
  it('one plan per kind — in the migration and the schema', () => {
    for (const s of [code, schema]) {
      expect(s).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_kind_unique\s+ON public\.subscription_plans \(kind\);/)
    }
  })
  it('never touches aggregator_subscriptions (free-forever Combined rows stay)', () => {
    expect(code).not.toMatch(/aggregator_subscriptions/)
  })
})

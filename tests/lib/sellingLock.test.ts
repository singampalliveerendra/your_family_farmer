import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SELLING_PLAN_REQUIRED, SELLING_PLAN_REQUIRED_MODERATOR, isSellingPlanError, sellingLockText } from '@/lib/sellingLock'

// Phase 7: the database trigger enforces the lock; these are its words, and
// the migration's rules checked against what the decision says.

describe('isSellingPlanError / sellingLockText', () => {
  const dbError = 'SELLING_PLAN_REQUIRED: a Selling plan is needed to put produce on sale.'
  it('spots the trigger’s refusal, nothing else', () => {
    expect(isSellingPlanError(dbError)).toBe(true)
    expect(isSellingPlanError('duplicate key value')).toBe(false)
    expect(isSellingPlanError(null)).toBe(false)
    expect(isSellingPlanError(undefined)).toBe(false)
  })
  it('turns it into plain words in the chosen language; other errors pass through', () => {
    expect(sellingLockText(dbError, (en) => en)).toBe(SELLING_PLAN_REQUIRED.en)
    expect(sellingLockText(dbError, (_en, te) => te)).toBe(SELLING_PLAN_REQUIRED.te)
    expect(sellingLockText('network down', (en) => en)).toBe('network down')
  })
  it('tells people what to do', () => {
    expect(SELLING_PLAN_REQUIRED.en).toMatch(/Your plan/)
    expect(SELLING_PLAN_REQUIRED.te).toMatch(/[ఀ-౿]/)
    expect(SELLING_PLAN_REQUIRED_MODERATOR).toMatch(/Activate a plan/)
  })
})

describe('scripts/selling-lock-migration.sql', () => {
  const sql = readFileSync(join(process.cwd(), 'scripts/selling-lock-migration.sql'), 'utf8').replace(/--.*$/gm, '')
  it('the trigger raises exactly what the app looks for', () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'SELLING_PLAN_REQUIRED:/)
  })
  it('fires on insert and on status changes only — stock / price edits never', () => {
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF status ON public\.produce_listings/)
  })
  it('only produce ENTERING sale is checked; anything already on sale passes', () => {
    expect(sql).toMatch(/NEW\.status NOT IN \('available', 'coming_soon', 'sold_out'\)/)
    expect(sql).toMatch(/TG_OP = 'UPDATE' AND OLD\.status IN \('available', 'coming_soon', 'sold_out'\)/)
  })
  it('farmers are never affected', () => {
    expect(sql).toMatch(/account_type = 'aggregator'/)
  })
  it('a Selling or Combined plan, live now, unlocks it', () => {
    expect(sql).toMatch(/s\.kind IN \('selling', 'combined'\)/)
    expect(sql).toMatch(/s\.status = 'active'/)
    expect(sql).toMatch(/s\.ends_at IS NULL OR s\.ends_at > now\(\)/)
    expect(sql).toMatch(/s\.starts_at <= now\(\)/)
  })
  it('the helpers read server-only data, so they are definer-run and not callable from the browser', () => {
    expect(sql.match(/SECURITY DEFINER/g)).toHaveLength(2)
    expect(sql.match(/SET search_path = public/g)).toHaveLength(2)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.aggregator_can_sell\(uuid\) FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.enforce_aggregator_selling_plan\(\) FROM PUBLIC, anon, authenticated/)
  })
  it('the prod check knows about it', () => {
    expect(readFileSync(join(process.cwd(), 'scripts/CHECK-prod-migrations.sql'), 'utf8')).toMatch(/tgname='produce_listings_selling_plan'/)
  })
})

describe('every produce save path explains the lock', () => {
  it.each([
    'src/app/farmer/dashboard/page.tsx',
    'src/app/api/farmer/update-listing/route.ts',
    'src/app/api/moderator/listings/route.ts',
    'src/app/api/moderator/listings/[id]/route.ts',
  ])('%s', (f) => {
    expect(readFileSync(join(process.cwd(), f), 'utf8')).toMatch(/sellingLockText|isSellingPlanError/)
  })
})

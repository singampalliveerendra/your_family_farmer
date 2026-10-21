import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Functions ran in iad1 (Washington) for six months while the production
// database sits in ap-south-1 (Mumbai), so every query crossed the world and
// back: p75 was ~1.9 s on /api/produce and the home page (vercel metrics,
// 2026-10-21). Fluid compute bills provisioned memory for the whole wait, so
// the wrong region costs money as well as time. vercel.json overrides the
// dashboard setting, which makes this file the one place the region lives.

const config = JSON.parse(readFileSync(join(__dirname, '../../vercel.json'), 'utf8'))

describe('vercel.json', () => {
  it('runs functions in Mumbai, next to the production database', () => {
    expect(config.regions).toEqual(['bom1'])
  })

  it('keeps the payment reconcile cron', () => {
    expect(config.crons).toContainEqual({ path: '/api/cron/reconcile-payments', schedule: '0 2 * * *' })
  })
})

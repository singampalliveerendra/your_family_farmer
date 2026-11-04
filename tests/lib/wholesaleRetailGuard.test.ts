import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Wholesale-only produce must never reach a household buyer. Every buyer-facing
// file that reads produce_listings has to filter it — through
// src/lib/wholesaleVisibility.ts or an explicit sale_mode condition. This scan
// fails the moment a new buyer page reads produce without doing so.

const ROOT = process.cwd()
const BUYER_AREAS = [
  'src/app/api/produce',
  'src/app/api/consumer',
  'src/app/consumer',
  'src/app/region',
  'src/app/home',
  'src/lib/farmShots.ts',
  'src/app/farmer/[slug]',
  'src/components/consumer',
  'src/components/farmer/tabs',
  'src/components/farmer/ShareProduceButton.tsx',
  'src/app/api/orders/place',
]

// Reads that are not a way to SEE produce, each with the reason.
const ALLOWED: Record<string, string> = {
  // Re-checks the live stock of an item already on screen (it came from the
  // filtered /api/produce feed).
  'src/app/consumer/page.tsx': 'stock re-check of a shown item',
  // Reads delivery_mode of items already in the cart; checkout itself refuses
  // wholesale-only produce (orders/place).
  'src/components/consumer/Cart.tsx': 'delivery mode of cart items',
  // Its produce comes in as a prop from the filtered /farmer/[slug] page; the
  // reads here are harvest stock for those ids, delete, and the owner's
  // quick-add insert.
}

function files(p: string): string[] {
  const abs = join(ROOT, p)
  if (statSync(abs).isFile()) return [p]
  return readdirSync(abs).flatMap((f) => files(join(p, f)))
}

const READS = /from\(\s*['"]produce_listings['"]\s*\)|produce_listings!inner/
const FILTERS = /@\/lib\/wholesaleVisibility|sale_mode/

const buyerFiles = BUYER_AREAS.flatMap(files).filter((f) => /\.(ts|tsx)$/.test(f))
const readers = buyerFiles.filter((f) => READS.test(readFileSync(join(ROOT, f), 'utf8')))

describe('every buyer-facing read of produce filters out wholesale-only', () => {
  it('found the buyer-facing readers (the scan is not empty)', () => {
    expect(readers.length).toBeGreaterThan(8)
  })

  it.each(readers.map((f) => [relative(ROOT, join(ROOT, f))]))('%s', (f) => {
    if (ALLOWED[f]) return
    expect(readFileSync(join(ROOT, f), 'utf8')).toMatch(FILTERS)
  })

  it('the allow-list only names files that still exist and still read produce', () => {
    for (const f of Object.keys(ALLOWED)) expect(readers).toContain(f)
  })
})

describe('no buyer-facing screen offers bulk buying (decision 2026-11-04)', () => {
  // Bulk is only for subscribed aggregators. A household page, the cart or a
  // consumer component that brings back a "Buy wholesale" path fails here.
  const HOUSEHOLD = ['src/app/consumer', 'src/components/consumer', 'src/app/farmer/[slug]', 'src/app/region', 'src/app/home']
    .flatMap(files).filter((f) => /\.(ts|tsx)$/.test(f))

  it('found the household screens', () => {
    expect(HOUSEHOLD.length).toBeGreaterThan(10)
  })

  it.each(HOUSEHOLD.map((f) => [f]))('%s', (f) => {
    const src = readFileSync(join(ROOT, f), 'utf8')
    expect(src).not.toMatch(/@\/lib\/wholesaleOrder|WholesaleBuy|wholesale:\s*(true|wsLine)/)
  })

  it('the "Buy wholesale" toggle component is gone', () => {
    expect(() => statSync(join(ROOT, 'src/components/consumer/WholesaleBuy.tsx'))).toThrow()
  })
})

describe('the surfaces the request named are covered', () => {
  // home feed + Android, search + Android, farmer pages, share images
  it.each([
    'src/app/api/produce/route.ts',
    'src/app/api/produce/search/route.ts',
    'src/app/farmer/[slug]/page.tsx',
    'src/components/farmer/ShareProduceButton.tsx',
    'src/app/region/[slug]/page.tsx',
    'src/app/consumer/produce/[id]/page.tsx',
    'src/app/consumer/produce/[id]/layout.tsx',
    'src/app/consumer/harvest/[harvestId]/page.tsx',
    'src/lib/farmShots.ts', // /home and the role pages' photos
    'src/components/consumer/TodaysHarvest.tsx',
    'src/components/consumer/FreshHarvestsTable.tsx',
    'src/app/api/orders/place/route.ts',
  ])('%s uses the wholesale filter', (f) => {
    expect(readFileSync(join(ROOT, f), 'utf8')).toMatch(/@\/lib\/wholesaleVisibility/)
  })

  it('the Android app only reads the two filtered APIs', () => {
    const dir = 'android/app/src/main/java'
    const all = files(dir).filter((f) => f.endsWith('.kt')).map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n')
    const apis = new Set([...all.matchAll(/"(api\/produce[a-z/]*)"/g)].map((m) => m[1]))
    expect([...apis].sort()).toEqual(['api/produce', 'api/produce/search'])
    expect(all).not.toMatch(/rest\/v1\/produce_listings/)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// /api/produce and /api/produce/search feed the web home page, search AND the
// Android app (catalogue/ProduceApi.kt). Wholesale-only produce must never come
// out of either, and a "both" produce must go out without its wholesale price.

type Row = Record<string, unknown>
const db = { listings: [] as Row[], farmers: [] as Row[] }

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  const rows = () => (table === 'produce_listings' ? db.listings : table === 'farmers' ? db.farmers : [])
  const b: Record<string, unknown> = {
    select: () => b,
    order: () => b,
    limit: () => b,
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b },
    in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b },
    then: (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows().filter((r) => filters.every((f) => f(r))), error: null }).then(res),
  }
  return b
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => query(t) } }))
vi.mock('@/lib/purchaseCounts', () => ({ purchaseCountsFor: async () => ({}) }))

const feed = (await import('@/app/api/produce/route')).GET
const search = (await import('@/app/api/produce/search/route')).GET

const L = (id: string, extra: Row = {}): Row => ({
  id, name: 'Tomato', farmer_id: 'f1', status: 'available', unit: 'kg', price_tier_1_price: 40,
  created_at: '2026-11-01T00:00:00Z', ...extra,
})

beforeEach(() => {
  db.farmers = [{ id: 'f1', name: 'Ravi', village: 'X', slug: 'ravi', active: true }]
  db.listings = [
    L('retail', { sale_mode: 'retail' }),
    L('both', { sale_mode: 'both', wholesale_price: 25, wholesale_min_qty: 100, wholesale_pack_size: 25, wholesale_transport_states: ['AP'] }),
    L('wsonly', { sale_mode: 'wholesale', wholesale_price: 20, wholesale_min_qty: 500 }),
    L('old'), // a row from before the migration
  ]
})

const ids = (body: unknown) => (body as Row[]).map((r) => r.id).sort()
const get = (fn: (r: NextRequest) => Promise<Response>, url: string) => fn(new NextRequest(`http://localhost${url}`))

describe.each([
  ['/api/produce (home feed + Android)', feed, '/api/produce'],
  ['/api/produce?status=feed', feed, '/api/produce?status=feed'],
  ['/api/produce/search (search + Android)', search, '/api/produce/search?q=tomato'],
  ['/api/produce/search, no query', search, '/api/produce/search'],
] as const)('%s', (_name, fn, url) => {
  it('never returns wholesale-only produce', async () => {
    const body = await (await get(fn, url)).json()
    expect(ids(body)).toEqual(['both', 'old', 'retail'])
  })

  it('a "both" produce goes out at its retail price, with no wholesale fields', async () => {
    const body = (await (await get(fn, url)).json()) as Row[]
    const both = body.find((r) => r.id === 'both')!
    expect(both.price_tier_1_price).toBe(40)
    for (const k of ['sale_mode', 'wholesale_price', 'wholesale_min_qty', 'wholesale_pack_size', 'wholesale_transport_states']) {
      expect(both).not.toHaveProperty(k)
    }
  })

  it('only wholesale-only produce → an empty list, not an error', async () => {
    db.listings = [L('w1', { sale_mode: 'wholesale' }), L('w2', { sale_mode: 'wholesale' })]
    const res = await get(fn, url)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})

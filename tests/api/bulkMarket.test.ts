import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// /api/aggregator/market end to end against an in-memory Supabase: who may
// open it, what is on it, and — the point of the Buying plan — that seller
// contact details are only ever in the response for a subscribed aggregator.

type Row = Record<string, unknown>
const ME = '11111111-1111-4111-8111-111111111111'
const FARMER = '22222222-2222-4222-8222-222222222222'
const OTHER_AGG = '44444444-4444-4444-8444-444444444444'
const L1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const L2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

const db = { tables: {} as Record<string, Row[]>, fail: '' }
function query(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let single = false
  const run = () => {
    if (db.fail === table) return { data: null, error: { message: 'column does not exist' } }
    const rows = (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r))).map((r) => ({ ...r }))
    return { data: single ? rows[0] ?? null : rows, error: null }
  }
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b },
    in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b },
    limit: () => b,
    maybeSingle: () => { single = true; return b },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  }
  return b
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => query(t) }) }))
let session: string | null = ME
vi.mock('@/lib/farmer-session', () => ({ getFarmerSessionFromRequest: () => (session ? { farmerId: session, issuedAt: 0 } : null) }))

const { GET } = await import('@/app/api/aggregator/market/route')
const get = (qs = '') => GET(new NextRequest(`http://localhost/api/aggregator/market${qs}`))

beforeEach(() => {
  session = ME
  db.fail = ''
  db.tables = {
    farmers: [
      { id: ME, name: 'Me', account_type: 'aggregator', active: true },
      { id: FARMER, name: 'Ravi', village: 'Pentapadu', district: 'West Godavari', state: 'AP', phone: '9000000001', farm_address: 'Door 4, Canal road', account_type: 'farmer', active: true },
      { id: OTHER_AGG, name: 'GoDhan', village: 'Tadepalligudem', district: 'West Godavari', phone: '9000000002', account_type: 'aggregator', active: true },
    ],
    produce_listings: [
      { id: L1, farmer_id: FARMER, name: 'Tomato', unit: 'kg', status: 'available', sale_mode: 'wholesale', wholesale_price: 30, wholesale_min_qty: 100, wholesale_pack_size: 25, wholesale_transport_states: ['AP'] },
      { id: L2, farmer_id: OTHER_AGG, name: 'Onion', unit: 'kg', status: 'available', sale_mode: 'both', wholesale_price: 22, wholesale_min_qty: 50, source_farmer_id: 'g1', wholesale_transport_states: [] },
      { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', farmer_id: FARMER, name: 'Rice', status: 'available', sale_mode: 'retail', wholesale_price: null },
      { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', farmer_id: ME, name: 'Mine', status: 'available', sale_mode: 'wholesale', wholesale_price: 10, wholesale_min_qty: 5 },
    ],
    harvests: [{ id: 'h1', produce_listing_id: L1, stock_qty: 400, paused: false, harvested_at: day(-1) }],
    source_farmers: [{ id: 'g1', name: 'Lakshmi', village: 'Pentapadu' }],
    aggregator_subscriptions: [],
  }
})

describe('who may open the bulk market', () => {
  it('logged out → 401', async () => {
    session = null
    expect((await get()).status).toBe(401)
  })
  it('a farmer → 401 (farmers sell bulk, they do not buy it)', async () => {
    session = FARMER
    expect((await get()).status).toBe(401)
  })
  it('an aggregator without a plan may LOOK', async () => {
    const j = await (await get()).json()
    expect(j.items.map((i: Row) => i.name)).toEqual(['Tomato', 'Onion'])
    expect(j.access).toEqual({ buying: false, standing: 'none' })
  })
})

describe('contacts unlock only with a Buying plan', () => {
  it('no plan: no phone, WhatsApp or address anywhere in the response', async () => {
    const text = await (await get()).text()
    expect(text).not.toContain('9000000001')
    expect(text).not.toContain('9000000002')
    expect(text).not.toContain('Canal road')
    expect(text).toContain('Pentapadu') // village + district stay
  })
  it('a Selling-only plan does not unlock them', async () => {
    db.tables.aggregator_subscriptions = [{ id: 's', aggregator_id: ME, kind: 'selling', source: 'payment', status: 'active', starts_at: day(-1), ends_at: day(20) }]
    expect(await (await get()).text()).not.toContain('9000000001')
  })
  it('Buying plan: contacts in', async () => {
    db.tables.aggregator_subscriptions = [{ id: 's', aggregator_id: ME, kind: 'buying', source: 'payment', status: 'active', starts_at: day(-1), ends_at: day(20) }]
    const j = await (await get()).json()
    expect(j.access.buying).toBe(true)
    expect(j.items[0].contact).toEqual({ phone: '9000000001', whatsapp: '919000000001', address: 'Door 4, Canal road' })
  })
  it('Combined and free-forever count as Buying', async () => {
    db.tables.aggregator_subscriptions = [{ id: 's', aggregator_id: ME, kind: 'combined', source: 'free_forever', status: 'active', starts_at: day(-9), ends_at: null }]
    expect((await (await get()).json()).items.every((i: Row) => i.contact)).toBe(true)
  })
  it('an expired plan locks them again', async () => {
    db.tables.aggregator_subscriptions = [{ id: 's', aggregator_id: ME, kind: 'buying', source: 'payment', status: 'active', starts_at: day(-40), ends_at: day(-1) }]
    const j = await (await get()).json()
    expect(j.access).toEqual({ buying: false, standing: 'expired' })
    expect(j.items.every((i: Row) => i.contact === null)).toBe(true)
  })
  it('another aggregator’s plan is not mine', async () => {
    db.tables.aggregator_subscriptions = [{ id: 's', aggregator_id: OTHER_AGG, kind: 'buying', source: 'payment', status: 'active', starts_at: day(-1), ends_at: day(20) }]
    expect((await (await get()).json()).access.buying).toBe(false)
  })
})

describe('what is on it', () => {
  it('an aggregator’s listing names its grower', async () => {
    const onion = (await (await get()).json()).items.find((i: Row) => i.name === 'Onion')
    expect(onion.grower).toEqual({ name: 'Lakshmi', village: 'Pentapadu' })
    expect(onion.seller.type).toBe('aggregator')
  })
  it('low stock hides a listing', async () => {
    db.tables.harvests[0].stock_qty = 60 // below the 100 minimum
    expect((await (await get()).json()).items.map((i: Row) => i.name)).toEqual(['Onion'])
  })
  it('one listing by id', async () => {
    const j = await (await get(`?id=${L1}`)).json()
    expect(j.item.name).toBe('Tomato')
  })
  it('by id: retail, my own, or junk → refused', async () => {
    expect((await get('?id=cccccccc-cccc-4ccc-8ccc-cccccccccccc')).status).toBe(404)
    expect((await get('?id=dddddddd-dddd-4ddd-8ddd-dddddddddddd')).status).toBe(404)
    expect((await get('?id=nope')).status).toBe(400)
  })
  it('before the wholesale migration: an empty, locked market (no crash)', async () => {
    db.fail = 'produce_listings'
    const j = await (await get()).json()
    expect(j).toMatchObject({ items: [], configured: false })
  })
  it('before the subscription migration: still opens, locked', async () => {
    db.fail = 'aggregator_subscriptions'
    const j = await (await get()).json()
    expect(j.items).toHaveLength(2)
    expect(j.access.buying).toBe(false)
  })
})

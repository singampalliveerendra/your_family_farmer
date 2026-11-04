import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// The routes that replaced the browser's direct writes (security fix,
// 2026-11-05), against an in-memory Supabase: the owner may, another seller
// may not, a logged-out caller may not.

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const MY_LISTING = '33333333-3333-4333-8333-333333333333'
const OTHER_LISTING = '44444444-4444-4444-8444-444444444444'
const MY_HARVEST = '55555555-5555-4555-8555-555555555555'
const OTHER_HARVEST = '66666666-6666-4666-8666-666666666666'
const MY_PHOTO = '77777777-7777-4777-8777-777777777777'
const OTHER_PHOTO = '88888888-8888-4888-8888-888888888888'
const MY_INTENT = '99999999-9999-4999-8999-999999999999'
const OTHER_INTENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MOD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

type Row = Record<string, unknown>
let db: Record<string, Row[]>
const signed: string[] = []

function seed() {
  db = {
    farmers: [
      { id: ME, account_type: 'farmer', region_slug: 'tpg', name: 'Me', slug: 'me', phone: '9000000001' },
      { id: OTHER, account_type: 'farmer', region_slug: 'far', name: 'Other', slug: 'other', phone: '9000000002' },
    ],
    produce_listings: [
      { id: MY_LISTING, farmer_id: ME, status: 'available', unit: 'kg', source_farmer_id: null },
      { id: OTHER_LISTING, farmer_id: OTHER, status: 'available', unit: 'kg', source_farmer_id: null },
    ],
    harvests: [
      { id: MY_HARVEST, produce_listing_id: MY_LISTING, farmer_id: ME, paused: false },
      { id: OTHER_HARVEST, produce_listing_id: OTHER_LISTING, farmer_id: OTHER, paused: false },
    ],
    media: [
      { id: MY_PHOTO, farmer_id: ME, url: 'x' },
      { id: OTHER_PHOTO, farmer_id: OTHER, url: 'y' },
    ],
    demand_intents: [
      { id: MY_INTENT, consumer_id: 'c1', crop_name: 'Mango' },
      { id: OTHER_INTENT, consumer_id: 'c2', crop_name: 'Papaya' },
    ],
  }
  signed.length = 0
}

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let op: 'select' | 'update' | 'delete' | 'insert' = 'select'
  let set: Row | null = null
  let single = false
  const rows = () => (db[table] ?? []).filter((r) => filters.every((f) => f(r)))
  const run = () => {
    if (op === 'insert') {
      const row = { id: 'new-id', ...set }
      db[table].push(row)
      return { data: single ? row : [row], error: null }
    }
    const hit = rows()
    if (op === 'update') hit.forEach((r) => Object.assign(r, set))
    if (op === 'delete') db[table] = db[table].filter((r) => !hit.includes(r))
    if (single) return { data: hit[0] ?? null, error: null }
    return { data: hit.map((r) => ({ ...r })), error: null, count: hit.length }
  }
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b },
    neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return b },
    order: () => b,
    update: (s: Row) => { op = 'update'; set = s; return b },
    insert: (s: Row) => { op = 'insert'; set = s; return b },
    delete: () => { op = 'delete'; return b },
    maybeSingle: () => { single = true; return b },
    single: () => { single = true; return b },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  }
  return b
}

const PUBLIC_BASE = 'https://x.supabase.co/storage/v1/object/public/farm-images/'
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => query(t),
    storage: {
      from: () => ({
        createSignedUploadUrl: async (p: string) => { signed.push(p); return { data: { token: 'tok', path: p }, error: null } },
        getPublicUrl: (p: string) => ({ data: { publicUrl: PUBLIC_BASE + p } }),
      }),
    },
  }),
}))

let seller: string | null = ME
let consumer: string | null = 'c1'
let moderator: { id: string; zone: string } | null = null
vi.mock('@/lib/farmer-session', () => ({ getFarmerSessionFromRequest: () => (seller ? { farmerId: seller } : null) }))
vi.mock('@/lib/session', () => ({ getConsumerSessionFromRequest: () => (consumer ? { consumerId: consumer } : null) }))
vi.mock('@/lib/moderator-session', () => ({
  isModeratorRequest: () => !!moderator,
  getModeratorZone: () => moderator?.zone ?? null,
  getModeratorId: () => moderator?.id ?? null,
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => true }))

const harvests = await import('@/app/api/farmer/harvests/route')
const harvest = await import('@/app/api/farmer/harvests/[id]/route')
const listing = await import('@/app/api/farmer/listings/[id]/route')
const profile = await import('@/app/api/farmer/profile/route')
const media = await import('@/app/api/farmer/media/route')
const photo = await import('@/app/api/farmer/media/[id]/route')
const upload = await import('@/app/api/uploads/farm-image/route')
const intent = await import('@/app/api/consumer/intents/[id]/route')

const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/x', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => { seed(); seller = ME; consumer = 'c1'; moderator = null })

describe('harvests', () => {
  const body = (listingId: string) => ({ produce_listing_id: listingId, harvested_at: new Date().toISOString(), approx_quantity: 10, farmer_id: OTHER })
  it('owner logs a harvest; farmer comes from the listing, not the request', async () => {
    const r = await harvests.POST(req('POST', body(MY_LISTING)))
    expect(r.status).toBe(200)
    const row = db.harvests.find((h) => h.id === 'new-id')!
    expect(row).toMatchObject({ farmer_id: ME, produce_listing_id: MY_LISTING, stock_qty: 10, unit: 'kg' })
  })
  it("cannot log on another farmer's produce", async () => {
    expect((await harvests.POST(req('POST', body(OTHER_LISTING)))).status).toBe(403)
    expect(db.harvests).toHaveLength(2)
  })
  it('logged out = 401', async () => {
    seller = null
    expect((await harvests.POST(req('POST', body(MY_LISTING)))).status).toBe(401)
  })
  it("pause / delete: own yes, another's no", async () => {
    expect((await harvest.PATCH(req('PATCH', { paused: true }), ctx(MY_HARVEST))).status).toBe(200)
    expect(db.harvests.find((h) => h.id === MY_HARVEST)!.paused).toBe(true)
    expect((await harvest.PATCH(req('PATCH', { paused: true }), ctx(OTHER_HARVEST))).status).toBe(403)
    expect(db.harvests.find((h) => h.id === OTHER_HARVEST)!.paused).toBe(false)
    expect((await harvest.DELETE(req('DELETE'), ctx(OTHER_HARVEST))).status).toBe(403)
    expect((await harvest.DELETE(req('DELETE'), ctx(MY_HARVEST))).status).toBe(200)
    expect(db.harvests.map((h) => h.id)).toEqual([OTHER_HARVEST])
  })
})

describe('produce delete', () => {
  it("own yes, another's no", async () => {
    expect((await listing.DELETE(req('DELETE'), ctx(OTHER_LISTING))).status).toBe(403)
    expect((await listing.DELETE(req('DELETE'), ctx(MY_LISTING))).status).toBe(200)
    expect(db.produce_listings.map((l) => l.id)).toEqual([OTHER_LISTING])
  })
})

describe('own profile', () => {
  it('GET returns my row (with my phone) and needs login', async () => {
    const r = await profile.GET(req('GET'))
    expect((await r.json()).farmer).toMatchObject({ id: ME, phone: '9000000001' })
    seller = null
    expect((await profile.GET(req('GET'))).status).toBe(401)
  })
  it('PATCH edits only my row and ignores UPI / status keys', async () => {
    const r = await profile.PATCH(req('PATCH', { village: 'Pentapadu', upi_id: 'x@upi', active: false }))
    expect(r.status).toBe(200)
    expect(db.farmers.find((f) => f.id === ME)).toMatchObject({ village: 'Pentapadu' })
    expect(db.farmers.find((f) => f.id === ME)).not.toHaveProperty('upi_id')
    expect(db.farmers.find((f) => f.id === ME)).not.toHaveProperty('active')
    expect(db.farmers.find((f) => f.id === OTHER)).not.toHaveProperty('village')
  })
  it("refuses another seller's page link and phone", async () => {
    expect((await profile.PATCH(req('PATCH', { slug: 'other' }))).status).toBe(409)
    expect((await profile.PATCH(req('PATCH', { phone: '9000000002' }))).status).toBe(409)
    expect((await profile.PATCH(req('PATCH', { phone: '12345' }))).status).toBe(400)
  })
})

describe('gallery photos', () => {
  it('only a photo inside my own folder', async () => {
    expect((await media.POST(req('POST', { url: `${PUBLIC_BASE}${ME}/gallery-1-a.jpg` }))).status).toBe(200)
    expect((await media.POST(req('POST', { url: `${PUBLIC_BASE}${OTHER}/gallery-1-a.jpg` }))).status).toBe(400)
    expect((await media.POST(req('POST', { url: `${PUBLIC_BASE}${ME}/../${OTHER}/x.jpg` }))).status).toBe(400)
    expect((await media.POST(req('POST', { url: 'https://evil.example/x.jpg' }))).status).toBe(400)
  })
  it("remove: own yes, another's no", async () => {
    expect((await photo.DELETE(req('DELETE'), ctx(OTHER_PHOTO))).status).toBe(403)
    expect((await photo.DELETE(req('DELETE'), ctx(MY_PHOTO))).status).toBe(200)
  })
})

describe('upload link', () => {
  it("a seller always gets their own folder, whatever farmerId says", async () => {
    const r = await upload.POST(req('POST', { kind: 'produce', ext: 'jpg', farmerId: OTHER }))
    expect(r.status).toBe(200)
    expect(signed[0].startsWith(`${ME}/produce-`)).toBe(true)
  })
  it('a moderator: farmer in zone → that folder; outside zone → own onboarding folder', async () => {
    seller = null
    moderator = { id: MOD, zone: 'tpg' }
    await upload.POST(req('POST', { kind: 'cover', ext: 'png', farmerId: ME }))
    await upload.POST(req('POST', { kind: 'cover', ext: 'png', farmerId: OTHER }))
    expect(signed[0].startsWith(`${ME}/cover-`)).toBe(true)
    expect(signed[1].startsWith(`onboarding/${MOD}/cover-`)).toBe(true)
  })
  it('logged out = 401; non-photos refused', async () => {
    expect((await upload.POST(req('POST', { kind: 'produce', ext: 'pdf' }))).status).toBe(400)
    seller = null
    expect((await upload.POST(req('POST', { kind: 'produce', ext: 'jpg' }))).status).toBe(401)
    expect(signed).toHaveLength(0)
  })
})

describe('buyer requests', () => {
  it("edit / remove: own yes, another buyer's no", async () => {
    expect((await intent.PATCH(req('PATCH', { quantity_kg: 3 }), ctx(OTHER_INTENT))).status).toBe(404)
    expect((await intent.DELETE(req('DELETE'), ctx(OTHER_INTENT))).status).toBe(404)
    expect(db.demand_intents).toHaveLength(2)
    expect((await intent.PATCH(req('PATCH', { quantity_kg: 3 }), ctx(MY_INTENT))).status).toBe(200)
    expect((await intent.DELETE(req('DELETE'), ctx(MY_INTENT))).status).toBe(200)
    expect(db.demand_intents.map((d) => d.id)).toEqual([OTHER_INTENT])
  })
  it('logged out = 401', async () => {
    consumer = null
    expect((await intent.DELETE(req('DELETE'), ctx(MY_INTENT))).status).toBe(401)
  })
})

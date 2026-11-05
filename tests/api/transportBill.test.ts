import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// The transport-bill routes (2026-11-05) against an in-memory Supabase: only
// the seller sends the bill and marks it paid; the buyer, the seller and a
// zone moderator may open the private bill — nobody else.

const SELLER = '11111111-1111-4111-8111-111111111111'
const BUYER = '22222222-2222-4222-8222-222222222222'
const OTHER = '44444444-4444-4444-8444-444444444444'
const OID = '33333333-3333-4333-8333-333333333333'
type Row = Record<string, unknown>
let orders: Row[]
let session: string | null
let moderatorZone: string | null
const signed: string[] = []

function query(table: string) {
  const f: Array<(r: Row) => boolean> = []
  let set: Row | null = null
  let single = false
  const run = () => {
    const rows = table === 'orders' ? orders : table === 'farmers' ? [{ id: SELLER, region_slug: 'tpg' }] : []
    const hit = rows.filter((r) => f.every((x) => x(r)))
    if (set) { hit.forEach((r) => Object.assign(r, set)); return { data: hit.map((r) => ({ ...r })), error: null } }
    return { data: single ? (hit[0] ? { ...hit[0] } : null) : hit, error: null }
  }
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (c: string, v: unknown) => { f.push((r) => r[c] === v); return b },
    is: (c: string, v: unknown) => { f.push((r) => (r[c] ?? null) === v); return b },
    in: (c: string, v: unknown[]) => { f.push((r) => v.includes(r[c])); return b },
    update: (s: Row) => { set = s; return b },
    maybeSingle: () => { single = true; return b },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  }
  return b
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => query(t),
    storage: { from: () => ({
      createSignedUploadUrl: async (p: string) => { signed.push(p); return { data: { token: 't' }, error: null } },
      createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://signed/${p}` }, error: null }),
    }) },
  }),
}))
vi.mock('@/lib/farmer-session', () => ({ getFarmerSessionFromRequest: () => (session ? { farmerId: session } : null) }))
vi.mock('@/lib/moderator-session', () => ({ isModeratorRequest: () => moderatorZone !== null, getModeratorZone: () => moderatorZone, getModeratorId: () => null }))

const bill = await import('@/app/api/farmer/orders/[id]/transport-bill/route')
const upload = await import('@/app/api/farmer/orders/[id]/transport-bill/upload/route')
const paid = await import('@/app/api/farmer/orders/[id]/transport-paid/route')
const view = await import('@/app/api/orders/[id]/cargo-bill/route')

const req = (body?: unknown) => new NextRequest('http://localhost/x', { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', cookie: 'yff_lang=en' }, body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = { params: Promise.resolve({ id: OID }) }

beforeEach(() => {
  orders = [{ id: OID, farmer_id: SELLER, buyer_aggregator_id: BUYER, order_type: 'wholesale', status: 'approved', shipped_at: '2026-11-05T05:00:00Z', transport_mode: 'per_km', transport_rate: 5, transport_km: null, transport_bill_amount: null, transport_bill_path: null, transport_billed_at: null, transport_paid_at: null }]
  session = SELLER; moderatorZone = null; signed.length = 0
})

describe('send the transport bill', () => {
  it('the seller sends 20 km → ₹100', async () => {
    const r = await bill.POST(req({ km: 20 }), ctx)
    expect(r.status).toBe(200)
    expect(orders[0]).toMatchObject({ transport_km: 20, transport_bill_amount: 100 })
  })
  it('the buyer, another seller and a logged-out caller cannot', async () => {
    for (const s of [BUYER, OTHER, null]) {
      session = s
      expect((await bill.POST(req({ km: 20 }), ctx)).status).toBe(403)
    }
    expect(orders[0].transport_billed_at).toBeNull()
  })
  it('not before the order is shipped', async () => {
    orders[0].shipped_at = null
    expect((await bill.POST(req({ km: 20 }), ctx)).status).toBe(400)
  })
  it('the upload link is for this order folder only, and only for the seller', async () => {
    expect((await upload.POST(req({ ext: 'pdf' }), ctx)).status).toBe(200)
    expect(signed[0].startsWith(`${OID}/bill-`)).toBe(true)
    session = BUYER
    expect((await upload.POST(req({ ext: 'pdf' }), ctx)).status).toBe(403)
  })
})

describe('mark transport paid', () => {
  it('only after a bill, only by the seller', async () => {
    expect((await paid.POST(req({ paid: true }), ctx)).status).toBe(409)
    await bill.POST(req({ km: 20 }), ctx)
    session = BUYER
    expect((await paid.POST(req({ paid: true }), ctx)).status).toBe(403)
    session = SELLER
    expect((await paid.POST(req({ paid: true }), ctx)).status).toBe(200)
    expect(orders[0].transport_paid_at).not.toBeNull()
    // A paid bill cannot be changed any more.
    expect((await bill.POST(req({ km: 30 }), ctx)).status).toBe(400)
  })
})

describe('open the cargo bill', () => {
  beforeEach(() => { orders[0].transport_bill_path = `${OID}/bill-1-a.pdf` })
  it('buyer, seller and the zone moderator get a short-lived link', async () => {
    for (const s of [BUYER, SELLER]) {
      session = s
      const r = await view.GET(req(), ctx)
      expect(r.status).toBe(200)
      expect((await r.json()).url).toBe(`https://signed/${OID}/bill-1-a.pdf`)
    }
    session = null; moderatorZone = 'tpg'
    expect((await view.GET(req(), ctx)).status).toBe(200)
  })
  it('anyone else is refused', async () => {
    session = OTHER
    expect((await view.GET(req(), ctx)).status).toBe(403)
    session = null; moderatorZone = 'elsewhere'
    expect((await view.GET(req(), ctx)).status).toBe(403)
  })
})

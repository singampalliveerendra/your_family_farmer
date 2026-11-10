import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// The moderator subscription routes end to end against an in-memory Supabase:
// plans (list / edit the two fixed plans) and aggregator grants (list / activate / switch
// off). The rules themselves are unit-tested in tests/lib/subscriptionPlans.test.ts.

type Row = Record<string, unknown>
const AGG = '11111111-1111-4111-8111-111111111111'
const FARMER = '22222222-2222-4222-8222-222222222222'
const MOD = '99999999-9999-4999-8999-999999999999'

const db = {
  tables: {} as Record<string, Row[]>,
  failTable: '' as string,
}

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let updateSet: Row | null = null
  let insertRow: Row | null = null
  let single = false
  const run = () => {
    if (db.failTable === table) return { data: null, error: { message: 'relation does not exist' } }
    const rows = (db.tables[table] ??= [])
    if (insertRow) {
      const row = { id: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, '0')}`, created_at: new Date().toISOString(), ...insertRow }
      rows.push(row)
      return { data: single ? { ...row } : [{ ...row }], error: null }
    }
    const hit = rows.filter((r) => filters.every((f) => f(r)))
    if (updateSet) {
      for (const r of hit) Object.assign(r, updateSet)
      return { data: single ? (hit[0] ? { ...hit[0] } : null) : hit, error: null }
    }
    return { data: single ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r })), error: null }
  }
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b },
    in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b },
    is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b },
    order: () => b,
    update: (s: Row) => { updateSet = s; return b },
    insert: (r: Row) => { insertRow = r; return b },
    maybeSingle: () => { single = true; return b },
    single: () => { single = true; return b },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  }
  return b
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => query(t) }) }))

let loggedIn = true
vi.mock('@/lib/moderator-session', () => ({
  isModeratorRequest: () => loggedIn,
  getModeratorId: () => (loggedIn ? MOD : null),
}))

const plans = await import('@/app/api/moderator/subscription-plans/route')
const plan = await import('@/app/api/moderator/subscription-plans/[id]/route')
const subs = await import('@/app/api/moderator/aggregator-subscriptions/route')
const sub = await import('@/app/api/moderator/aggregator-subscriptions/[id]/route')

const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/x', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

const GOOD = { kind: 'buying', name_en: 'Bulk buyer', duration_days: 30, actual_price: 999, offer_enabled: true, offer_price: 599, offer_ends_at: '2099-01-01T00:00:00Z' }

beforeEach(() => {
  loggedIn = true
  db.failTable = ''
  db.tables = {
    subscription_plans: [],
    aggregator_subscriptions: [],
    farmers: [
      { id: AGG, name: 'GoDhan', village: 'Tadepalligudem', phone: '9000000001', active: true, account_type: 'aggregator' },
      { id: FARMER, name: 'Ravi', village: 'Pentapadu', phone: '9000000002', active: true, account_type: 'farmer' },
    ],
  }
})

describe('every route needs a moderator login', () => {
  it.each([
    ['GET plans', () => plans.GET(req('GET'))],
    ['POST plan', () => plans.POST(req('POST', GOOD))],
    ['PUT plan', () => plan.PUT(req('PUT', GOOD), params('00000000-0000-4000-8000-000000000001'))],
    ['GET subscriptions', () => subs.GET(req('GET'))],
    ['POST grant', () => subs.POST(req('POST', { aggregatorId: AGG, kind: 'buying', days: 30 }))],
    ['DELETE grant', () => sub.DELETE(req('DELETE'), params('00000000-0000-4000-8000-000000000001'))],
  ])('%s → 401 and nothing written', async (_n, call) => {
    loggedIn = false
    const res = await call()
    expect(res.status).toBe(401)
    expect(db.tables.subscription_plans).toHaveLength(0)
    expect(db.tables.aggregator_subscriptions).toHaveLength(0)
  })
})

// Three fixed plans since 2026-11-10 (scripts/fixed-plans-migration.sql):
// seeded rows, edited in place, never added.
const BUY_ID = '00000000-0000-4000-8000-0000000000b1'
const SELL_ID = '00000000-0000-4000-8000-0000000000s1'.replace('s1', 'c1')
const BOTH_ID = '00000000-0000-4000-8000-0000000000d1'
const seedThree = () => db.tables.subscription_plans.push(
  { id: BOTH_ID, kind: 'combined', name_en: 'Buying + Selling plan', duration_days: 30, actual_price: 0, active: false },
  { id: SELL_ID, kind: 'selling', name_en: 'Selling plan', duration_days: 30, actual_price: 0, active: false },
  { id: BUY_ID, kind: 'buying', name_en: 'Buying plan', duration_days: 30, actual_price: 0, active: false },
)

describe('plans', () => {
  it('no adding plans: POST is refused and nothing is saved', async () => {
    const res = await plans.POST(req('POST', GOOD))
    expect(res.status).toBe(405)
    expect((await res.json()).error).toMatch(/plans are fixed/)
    expect(db.tables.subscription_plans).toHaveLength(0)
  })
  it('list: Buying, Selling, then Buying + Selling, hidden ones too', async () => {
    seedThree()
    const j = await (await plans.GET(req('GET'))).json()
    expect(j.plans.map((p: Row) => p.kind)).toEqual(['buying', 'selling', 'combined'])
    expect(j.configured).toBe(true)
  })
  it('a plan missing → configured=false (migration not run)', async () => {
    db.tables.subscription_plans.push({ id: BUY_ID, kind: 'buying', active: false })
    expect((await (await plans.GET(req('GET'))).json()).configured).toBe(false)
  })
  it('before the migration: empty list, configured=false', async () => {
    db.failTable = 'subscription_plans'
    expect(await (await plans.GET(req('GET'))).json()).toEqual({ plans: [], configured: false })
  })
  it('edit: moderator sets price, duration and offer; who changed it is kept', async () => {
    seedThree()
    const res = await plan.PUT(req('PUT', { ...GOOD, name_en: '  Buying plan  ', duration_days: 365, active: true }), params(BUY_ID))
    expect(res.status).toBe(200)
    expect(db.tables.subscription_plans.find((p) => p.id === BUY_ID)).toMatchObject({
      kind: 'buying', name_en: 'Buying plan', duration_days: 365, actual_price: 999, offer_price: 599, offer_enabled: true, active: true, updated_by: MOD,
    })
  })
  it('edit can never change a plan into the other kind', async () => {
    seedThree()
    await plan.PUT(req('PUT', { ...GOOD, kind: 'selling' }), params(BUY_ID))
    expect(db.tables.subscription_plans.filter((p) => p.kind === 'buying')).toHaveLength(1)
    expect(db.tables.subscription_plans.find((p) => p.id === BUY_ID)?.kind).toBe('buying')
  })
  it('the Buying + Selling plan has the same edit options: price, duration, offer, show', async () => {
    seedThree()
    const res = await plan.PUT(req('PUT', { ...GOOD, kind: 'combined', duration_days: 90, active: true }), params(BOTH_ID))
    expect(res.status).toBe(200)
    expect(db.tables.subscription_plans.find((p) => p.id === BOTH_ID)).toMatchObject({
      kind: 'combined', duration_days: 90, actual_price: 999, offer_price: 599, active: true, updated_by: MOD,
    })
  })
  it('an unknown kind cannot be saved', async () => {
    seedThree()
    expect((await plan.PUT(req('PUT', { ...GOOD, kind: 'gold' }), params(BUY_ID))).status).toBe(400)
  })
  it('edit: switch the offer off, keep its price', async () => {
    seedThree()
    await plan.PUT(req('PUT', GOOD), params(BUY_ID))
    const res = await plan.PUT(req('PUT', { ...GOOD, offer_enabled: false }), params(BUY_ID))
    expect(res.status).toBe(200)
    expect(db.tables.subscription_plans.find((p) => p.id === BUY_ID)).toMatchObject({ offer_enabled: false, offer_price: 599 })
  })
  it('edit: hide a plan', async () => {
    seedThree()
    await plan.PUT(req('PUT', { ...GOOD, active: true }), params(SELL_ID))
    await plan.PUT(req('PUT', { ...GOOD, active: false }), params(SELL_ID))
    expect(db.tables.subscription_plans.find((p) => p.id === SELL_ID)?.active).toBe(false)
  })
  it('edit: bad values refused with a plain message, the plan unchanged', async () => {
    seedThree()
    const res = await plan.PUT(req('PUT', { ...GOOD, offer_price: 1200 }), params(BUY_ID))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/lower than the actual/)
    expect((await plan.PUT(req('PUT', { ...GOOD, duration_days: 0 }), params(BUY_ID))).status).toBe(400)
    expect(db.tables.subscription_plans.find((p) => p.id === BUY_ID)).toMatchObject({ duration_days: 30, actual_price: 0 })
  })
  it('junk body → 400', async () => {
    const r = new NextRequest('http://localhost/api/x', { method: 'PUT', body: 'not json' })
    expect((await plan.PUT(r, params(BUY_ID))).status).toBe(400)
  })
  it('edit: unknown or malformed id', async () => {
    expect((await plan.PUT(req('PUT', GOOD), params('00000000-0000-4000-8000-000000000999'))).status).toBe(404)
    expect((await plan.PUT(req('PUT', GOOD), params('nope'))).status).toBe(400)
  })
})

describe('aggregator grants', () => {
  it('lists aggregators only, with their rows', async () => {
    db.tables.aggregator_subscriptions.push({ id: 's1', aggregator_id: AGG, kind: 'combined', source: 'free_forever', status: 'active', ends_at: null })
    const j = await (await subs.GET(req('GET'))).json()
    expect(j.aggregators.map((a: Row) => a.id)).toEqual([AGG])
    expect(j.subscriptions).toHaveLength(1)
    expect(j.configured).toBe(true)
  })
  it('activate for 30 days', async () => {
    const res = await subs.POST(req('POST', { aggregatorId: AGG, kind: 'buying', days: 30, note: 'trial' }))
    expect(res.status).toBe(200)
    const row = db.tables.aggregator_subscriptions[0]
    expect(row).toMatchObject({ aggregator_id: AGG, kind: 'buying', source: 'manual', status: 'active', amount_paid: 0, granted_by: MOD, note: 'trial' })
    const days = (new Date(row.ends_at as string).getTime() - new Date(row.starts_at as string).getTime()) / 86_400_000
    expect(days).toBe(30)
  })
  it('free forever', async () => {
    await subs.POST(req('POST', { aggregatorId: AGG, kind: 'combined', forever: true }))
    expect(db.tables.aggregator_subscriptions[0]).toMatchObject({ source: 'free_forever', ends_at: null })
  })
  it('a farmer can never get one (farmers are free)', async () => {
    const res = await subs.POST(req('POST', { aggregatorId: FARMER, kind: 'buying', days: 30 }))
    expect(res.status).toBe(404)
    expect(db.tables.aggregator_subscriptions).toHaveLength(0)
  })
  it.each([
    [{ aggregatorId: 'x', kind: 'buying', days: 30 }, 400],
    [{ aggregatorId: AGG, kind: 'gold', days: 30 }, 400],
    [{ aggregatorId: AGG, kind: 'buying' }, 400],
    [{ aggregatorId: '33333333-3333-4333-8333-333333333333', kind: 'buying', days: 30 }, 404],
  ])('refuses %o', async (body, status) => {
    expect((await subs.POST(req('POST', body))).status).toBe(status)
    expect(db.tables.aggregator_subscriptions).toHaveLength(0)
  })
  it('switch off = cancelled, kept as a record; twice → 404', async () => {
    await subs.POST(req('POST', { aggregatorId: AGG, kind: 'buying', days: 30 }))
    const id = db.tables.aggregator_subscriptions[0].id as string
    expect((await sub.DELETE(req('DELETE'), params(id))).status).toBe(200)
    expect(db.tables.aggregator_subscriptions[0].status).toBe('cancelled')
    expect(db.tables.aggregator_subscriptions).toHaveLength(1)
    expect((await sub.DELETE(req('DELETE'), params(id))).status).toBe(404)
  })
  it('before the migration the list still loads (configured=false)', async () => {
    db.failTable = 'aggregator_subscriptions'
    const j = await (await subs.GET(req('GET'))).json()
    expect(j).toMatchObject({ subscriptions: [], configured: false })
    expect(j.aggregators).toHaveLength(1)
  })
})

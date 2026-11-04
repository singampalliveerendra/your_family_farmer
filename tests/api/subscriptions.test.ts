import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// The moderator subscription routes end to end against an in-memory Supabase:
// plans (list / add / edit) and aggregator grants (list / activate / switch
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

describe('plans', () => {
  it('add a plan: cleaned columns + who changed it', async () => {
    const res = await plans.POST(req('POST', { ...GOOD, name_en: '  Bulk buyer  ' }))
    expect(res.status).toBe(200)
    expect(db.tables.subscription_plans[0]).toMatchObject({ name_en: 'Bulk buyer', actual_price: 999, offer_price: 599, offer_enabled: true, updated_by: MOD, active: true })
  })
  it('a bad plan is refused with a plain message, nothing saved', async () => {
    const res = await plans.POST(req('POST', { ...GOOD, offer_price: 1200 }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/lower than the actual/)
    expect(db.tables.subscription_plans).toHaveLength(0)
  })
  it('junk body → 400', async () => {
    const r = new NextRequest('http://localhost/api/x', { method: 'POST', body: 'not json' })
    expect((await plans.POST(r)).status).toBe(400)
  })
  it('list shows hidden plans too (moderator view)', async () => {
    db.tables.subscription_plans.push({ id: 'a', active: true }, { id: 'b', active: false })
    expect((await (await plans.GET(req('GET'))).json()).plans).toHaveLength(2)
  })
  it('before the migration: empty list, configured=false; saving says why', async () => {
    db.failTable = 'subscription_plans'
    expect(await (await plans.GET(req('GET'))).json()).toEqual({ plans: [], configured: false })
    const res = await plans.POST(req('POST', GOOD))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/subscription-migration/)
  })
  it('edit: switch the offer off, keep its price', async () => {
    await plans.POST(req('POST', GOOD))
    const id = db.tables.subscription_plans[0].id as string
    const res = await plan.PUT(req('PUT', { ...GOOD, offer_enabled: false }), params(id))
    expect(res.status).toBe(200)
    expect(db.tables.subscription_plans[0]).toMatchObject({ offer_enabled: false, offer_price: 599 })
  })
  it('edit: hide a plan', async () => {
    await plans.POST(req('POST', GOOD))
    const id = db.tables.subscription_plans[0].id as string
    await plan.PUT(req('PUT', { ...GOOD, active: false }), params(id))
    expect(db.tables.subscription_plans[0].active).toBe(false)
  })
  it('edit: bad values refused, the plan unchanged', async () => {
    await plans.POST(req('POST', GOOD))
    const id = db.tables.subscription_plans[0].id as string
    const res = await plan.PUT(req('PUT', { ...GOOD, duration_days: 0 }), params(id))
    expect(res.status).toBe(400)
    expect(db.tables.subscription_plans[0].duration_days).toBe(30)
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

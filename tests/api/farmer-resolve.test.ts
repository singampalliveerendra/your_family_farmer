import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// /api/farmer/orders/[id]/resolve end to end against an in-memory Supabase,
// same harness shape as tests/api/orders-place.test.ts. The rules themselves
// are unit-tested in tests/lib/farmerResolve.test.ts; this checks the route
// applies them, writes the right row, logs it and tells the buyer.

const FARMER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_FARMER_ID = '22222222-2222-4222-8222-222222222222'
const ORDER_ID = '33333333-3333-4333-8333-333333333333'

type Row = Record<string, unknown>

const db = {
  orders: [] as Row[],
  events: [] as Row[],
  // Simulates a database without scripts/farmer-resolve-migration.sql.
  missingColumn: false,
  failEventInsert: false,
}

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let updateSet: Row | null = null
  let insertRow: Row | null = null
  let single = false

  const run = () => {
    if (table === 'order_events' && insertRow) {
      if (db.failEventInsert) return { data: null, error: { message: 'boom' } }
      db.events.push(insertRow)
      return { data: null, error: null }
    }
    const rows = db.orders.filter((r) => filters.every((f) => f(r)))
    if (updateSet) {
      if (db.missingColumn && 'farmer_resolved_at' in updateSet) {
        return { data: null, error: { code: 'PGRST204', message: "Could not find the 'farmer_resolved_at' column of 'orders' in the schema cache" } }
      }
      for (const r of rows) Object.assign(r, updateSet)
      return { data: rows.map((r) => ({ ...r })), error: null }
    }
    if (single) return { data: rows[0] ?? null, error: null }
    return { data: rows, error: null }
  }

  const b: Record<string, unknown> = {
    select: () => b,
    eq: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return b },
    is: (col: string, v: unknown) => { filters.push((r) => (r[col] ?? null) === v); return b },
    update: (set: Row) => { updateSet = set; return b },
    insert: (row: Row) => { insertRow = row; return b },
    maybeSingle: () => { single = true; return b },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  }
  return b
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => query(t) }) }))

let sessionFarmerId: string | null = FARMER_ID
vi.mock('@/lib/farmer-session', () => ({
  getFarmerSessionFromRequest: () => (sessionFarmerId ? { farmerId: sessionFarmerId } : null),
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => true }))
const notifyOrdersDelivered = vi.fn()
vi.mock('@/lib/orderNotify', () => ({ notifyOrdersDelivered: (...a: unknown[]) => notifyOrdersDelivered(...a) }))

const { POST } = await import('@/app/api/farmer/orders/[id]/resolve/route')

function resolve(id = ORDER_ID, body: unknown = {}) {
  return POST(
    new NextRequest(`http://localhost/api/farmer/orders/${id}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
}

function seed(o: Row = {}) {
  db.orders = [{
    id: ORDER_ID, farmer_id: FARMER_ID, status: 'approved', delivery_type: 'self_pickup',
    delivery_status: null, shipped_at: null, collected_at: null, received_at: null, farmer_resolved_at: null,
    ...o,
  }]
}

beforeEach(() => {
  db.events = []
  db.missingColumn = false
  db.failEventInsert = false
  sessionFarmerId = FARMER_ID
  notifyOrdersDelivered.mockClear()
  seed()
})

describe('resolving an order', () => {
  // USE: the request — a pickup the buyer never confirmed leaves Active.
  it('closes an approved self-pickup', async () => {
    const res = await resolve()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(db.orders[0].collected_at).toEqual(expect.any(String))
    expect(db.orders[0].farmer_resolved_at).toBe(db.orders[0].collected_at)
    expect(db.orders[0].received_at).toBeNull()
    expect(json.order.farmer_resolved_at).toBe(db.orders[0].farmer_resolved_at)
  })

  it('closes a shipped courier order on received_at', async () => {
    seed({ delivery_type: 'courier', shipped_at: '2026-10-14T09:00:00.000Z' })
    expect((await resolve()).status).toBe(200)
    expect(db.orders[0].received_at).toEqual(expect.any(String))
    expect(db.orders[0].shipped_at).toBe('2026-10-14T09:00:00.000Z')
    expect(db.orders[0].collected_at).toBeNull()
  })

  it('stamps shipped_at on a farmer delivery never marked shipped', async () => {
    seed({ delivery_type: 'home_delivery', delivery_status: 'unassigned' })
    expect((await resolve()).status).toBe(200)
    expect(db.orders[0].shipped_at).toEqual(expect.any(String))
    expect(db.orders[0].received_at).toEqual(expect.any(String))
  })

  // USE: status tracking — who closed it and why is on the record.
  it('records the farmer and their note in order_events', async () => {
    await resolve(ORDER_ID, { note: '  gave it to   his wife ' })
    expect(db.events).toEqual([expect.objectContaining({
      order_id: ORDER_ID,
      event_type: 'farmer_resolved',
      actor_type: 'farmer',
      actor_id: FARMER_ID,
      note: 'gave it to his wife',
      metadata: { closed_column: 'collected_at', delivery_type: 'self_pickup' },
    })])
  })

  it('stores no note when none is given', async () => {
    await resolve()
    expect(db.events[0].note).toBeNull()
  })

  it('still succeeds if the audit row cannot be written', async () => {
    db.failEventInsert = true
    expect((await resolve()).status).toBe(200)
    expect(db.orders[0].farmer_resolved_at).toEqual(expect.any(String))
  })

  // USE: the buyer hears about it, with the Rate button, as for a code handover.
  it('sends the buyer the delivered message', async () => {
    await resolve()
    expect(notifyOrdersDelivered).toHaveBeenCalledWith(expect.anything(), [ORDER_ID])
  })
})

describe('validation', () => {
  it('needs a farmer session', async () => {
    sessionFarmerId = null
    expect((await resolve()).status).toBe(401)
  })

  it('rejects a malformed id', async () => {
    expect((await resolve('not-a-uuid')).status).toBe(400)
  })

  it('404s an unknown order', async () => {
    db.orders = []
    expect((await resolve()).status).toBe(404)
  })

  it("refuses another farmer's order and changes nothing", async () => {
    sessionFarmerId = OTHER_FARMER_ID
    expect((await resolve()).status).toBe(403)
    expect(db.orders[0].collected_at).toBeNull()
  })

  it.each([
    ['pending', { status: 'pending' }],
    ['declined', { status: 'declined' }],
    ['cancelled', { status: 'cancelled' }],
    ['already collected', { collected_at: '2026-10-14T09:00:00.000Z' }],
    ['rider on the way', { delivery_type: 'home_delivery', delivery_status: 'out_for_delivery' }],
  ])('refuses a %s order without writing', async (_l, o) => {
    seed(o)
    const before = { ...db.orders[0] }
    const res = await resolve()
    expect(res.status).toBe(409)
    expect(db.orders[0]).toEqual(before)
    expect(db.events).toHaveLength(0)
    expect(notifyOrdersDelivered).not.toHaveBeenCalled()
  })

  // USE: a second tap (or two devices) must not close it twice.
  it('a second resolve is refused', async () => {
    expect((await resolve()).status).toBe(200)
    expect((await resolve()).status).toBe(409)
    expect(db.events).toHaveLength(1)
  })

  // USE: without the migration, refuse instead of telling the buyer a code was used.
  it('refuses with 503 when the column is missing, leaving the order open', async () => {
    db.missingColumn = true
    const res = await resolve()
    expect(res.status).toBe(503)
    expect(db.orders[0].collected_at).toBeNull()
    expect(notifyOrdersDelivered).not.toHaveBeenCalled()
  })
})

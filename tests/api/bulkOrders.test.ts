import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Phase 6 end to end against an in-memory Supabase and a fake Cashfree:
// placing a bulk order (who may, what it costs, the order row, the stock),
// verifying the payment, abandoning an unpaid checkout, "My bulk orders",
// and the moderator's bulk fee.

type Row = Record<string, unknown>
const ME = '11111111-1111-4111-8111-111111111111'
const FARMER = '22222222-2222-4222-8222-222222222222'
const OTHER = '44444444-4444-4444-8444-444444444444'
const LOT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

const db = { tables: {} as Record<string, Row[]>, seq: 0, insertFails: false }
function query(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let updateSet: Row | null = null
  let insertRow: Row | null = null
  let upsertRow: Row | null = null
  let single = false
  const run = () => {
    const rows = (db.tables[table] ??= [])
    if (upsertRow) {
      const found = rows.find((r) => r.id === upsertRow!.id)
      if (found) Object.assign(found, upsertRow); else rows.push({ ...upsertRow })
      return { data: null, error: null }
    }
    if (insertRow) {
      if (db.insertFails && table === 'orders') return { data: null, error: { message: 'boom' } }
      db.seq += 1
      const row = { id: `00000000-0000-4000-8000-${String(db.seq).padStart(12, '0')}`, order_code: `YFF-TEST-${db.seq}`, created_at: new Date().toISOString(), ...insertRow }
      rows.push(row)
      return { data: single ? { ...row } : [{ ...row }], error: null }
    }
    const hit = rows.filter((r) => filters.every((f) => f(r)))
    if (updateSet) {
      for (const r of hit) Object.assign(r, updateSet)
      return { data: hit.map((r) => ({ ...r })), error: null }
    }
    const out = hit.map((r) => ({ ...r }))
    return { data: single ? out[0] ?? null : out, error: null }
  }
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b },
    in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b },
    order: () => b,
    limit: () => b,
    update: (s: Row) => { updateSet = s; return b },
    insert: (r: Row) => { insertRow = r; return b },
    upsert: (r: Row) => { upsertRow = r; return b },
    maybeSingle: () => { single = true; return b },
    single: () => { single = true; return b },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  }
  return b
}
const rpc = async (fn: string, args: Record<string, unknown>) => {
  const table = fn.includes('harvest') ? 'harvests' : 'produce_listings'
  const id = (args.p_harvest_id ?? args.p_listing_id) as string
  const row = db.tables[table].find((r) => r.id === id)
  if (!row) return { data: false, error: null }
  const qty = Number(args.p_qty)
  if (fn.startsWith('decrement')) {
    if (row.stock_qty != null && Number(row.stock_qty) < qty) return { data: false, error: null }
    if (row.stock_qty != null) row.stock_qty = Number(row.stock_qty) - qty
    return { data: true, error: null }
  }
  if (row.stock_qty != null) row.stock_qty = Number(row.stock_qty) + qty
  return { data: true, error: null }
}
const client = { from: (t: string) => query(t), rpc }
vi.mock('@supabase/supabase-js', () => ({ createClient: () => client }))

let session: string | null = ME
vi.mock('@/lib/farmer-session', () => ({ getFarmerSessionFromRequest: () => (session ? { farmerId: session, issuedAt: 0 } : null) }))
let moderator = true
vi.mock('@/lib/moderator-session', () => ({ isModeratorRequest: () => moderator, getModeratorId: () => null }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => true }))
const lowStock = vi.fn()
vi.mock('@/lib/wholesaleLowStockAlert', () => ({ scheduleWholesaleLowStockCheck: (...a: unknown[]) => lowStock(...a) }))

const cf = {
  createFails: false,
  created: [] as Array<{ orderId: string; amountRupees: number }>,
  state: new Map<string, { paid: true; paymentId: string; label: null } | { paid: false; orderStatus: string; inFlight: boolean }>(),
  terminated: [] as string[],
}
vi.mock('@/lib/cashfree', () => ({
  cashfreeMode: () => 'sandbox',
  makeCashfreeOrderId: (id: string) => `gg_${id.replace(/-/g, '')}_t1`,
  createCashfreeOrder: async (a: { orderId: string; amountRupees: number }) => {
    if (cf.createFails) throw new Error('down')
    cf.created.push(a)
    return { order_id: a.orderId, order_amount: a.amountRupees, order_status: 'ACTIVE', payment_session_id: `sess_${a.orderId}` }
  },
  getSettlement: async (id: string) => cf.state.get(id) ?? { paid: false, orderStatus: 'ACTIVE', inFlight: false },
  terminateCashfreeOrder: async (id: string) => {
    cf.terminated.push(id)
    const s = cf.state.get(id)
    if (!s || !s.paid) cf.state.set(id, { paid: false, orderStatus: 'TERMINATED', inFlight: false })
    return true
  },
  isSafeToAbandon: (s: { paid: boolean; inFlight?: boolean; orderStatus?: string }) => !s.paid && !s.inFlight && s.orderStatus !== 'ACTIVE',
}))
const markCashfreePaid = vi.fn(async (_s: unknown, a: { cashfreeOrderId: string }) => {
  for (const o of db.tables.orders) if (o.cashfree_order_id === a.cashfreeOrderId) o.payment_status = 'paid'
  return null
})
vi.mock('@/lib/cashfree-settle', () => ({
  ABANDON_REASON: 'Payment not completed',
  markCashfreePaid: (...a: unknown[]) => markCashfreePaid(...(a as [unknown, { cashfreeOrderId: string }])),
}))

const place = await import('@/app/api/aggregator/bulk-orders/place/route')
const verify = await import('@/app/api/aggregator/bulk-orders/verify/route')
const abandon = await import('@/app/api/aggregator/bulk-orders/abandon/route')
const list = await import('@/app/api/aggregator/bulk-orders/route')
const fee = await import('@/app/api/moderator/bulk-fee/route')

const post = (body: unknown) => new NextRequest('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const order = (x: Row = {}) => place.POST(post({ listingId: LOT, qty: 200, delivery: 'pickup', ...x }))
const ADDRESS = { line: '12-3 Main Road, Near Temple', city: 'Tadepalligudem', pincode: '534101', landmark: '' }
const orders = () => db.tables.orders
const harvest = (id: string) => db.tables.harvests.find((h) => h.id === id)!

beforeEach(() => {
  session = ME
  moderator = true
  cf.createFails = false
  cf.created = []
  cf.state.clear()
  cf.terminated = []
  markCashfreePaid.mockClear()
  lowStock.mockClear()
  db.insertFails = false
  db.seq = 0
  db.tables = {
    farmers: [
      { id: ME, name: 'GoDhan', phone: '9000000001', account_type: 'aggregator', active: true },
      { id: FARMER, name: 'Ravi', village: 'Pentapadu', district: 'West Godavari', phone: '9000000002', farm_address: 'Door 4, Canal road', pickup_locations: ['Farm gate, Pentapadu'], account_type: 'farmer', active: true },
      { id: OTHER, name: 'Other', phone: '9000000003', account_type: 'aggregator', active: true },
    ],
    produce_listings: [{
      id: LOT, farmer_id: FARMER, name: 'Tomato', unit: 'kg', status: 'available', sale_mode: 'wholesale', sale_step: 1, stock_qty: null,
      wholesale_price: 30, wholesale_min_qty: 100, wholesale_pack_size: 25, wholesale_transport_states: ['AP', 'TG'],
      wholesale_transport_rates: { AP: { mode: 'per_order', amount: 500, free_above: 1000 } },
    }],
    harvests: [
      { id: 'h-old', produce_listing_id: LOT, stock_qty: 900, paused: false, harvested_at: day(-5) },
      { id: 'h-new', produce_listing_id: LOT, stock_qty: 250, paused: false, harvested_at: day(-1) },
    ],
    aggregator_subscriptions: [{ id: 's', aggregator_id: ME, kind: 'buying', source: 'payment', status: 'active', starts_at: day(-1), ends_at: day(29) }],
    platform_settings: [],
    orders: [],
  }
})

describe('who may order', () => {
  it('logged out / a farmer → 401', async () => {
    session = null
    expect((await order()).status).toBe(401)
    session = FARMER
    expect((await order()).status).toBe(401)
  })
  it('no Buying plan → 403, nothing claimed', async () => {
    db.tables.aggregator_subscriptions = [{ id: 's', aggregator_id: ME, kind: 'selling', source: 'payment', status: 'active', starts_at: day(-1), ends_at: day(29) }]
    expect((await order()).status).toBe(403)
    expect(orders()).toHaveLength(0)
    expect(harvest('h-new').stock_qty).toBe(250)
  })
  it('an expired plan → 403', async () => {
    db.tables.aggregator_subscriptions[0].ends_at = day(-1)
    expect((await order()).status).toBe(403)
  })
  it('my own lot → 409', async () => {
    db.tables.produce_listings[0].farmer_id = ME
    expect((await order()).status).toBe(409)
  })
  it('a retail lot → 409', async () => {
    db.tables.produce_listings[0].sale_mode = 'retail'
    expect((await order()).status).toBe(409)
  })
})

describe('placing a pickup order', () => {
  it('an ordinary wholesale orders row, priced by the server, stock claimed from the newest pick', async () => {
    const res = await order()
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j).toMatchObject({ ok: true, mode: 'sandbox', goods: 6000, transport: 0, fee: 0, total: 6000 })
    expect(j.cashfreeOrderId).toMatch(/^gg_/)
    expect(orders()[0]).toMatchObject({
      farmer_id: FARMER, produce_listing_id: LOT, harvest_id: 'h-new', quantity: 200, total_price: 6000, platform_fee: 0,
      transport_charge: 0, transport_state: null, order_type: 'wholesale', buyer_aggregator_id: ME, consumer_id: null,
      buyer_name: 'GoDhan', buyer_phone: '9000000001', status: 'pending', payment_method: 'cashfree', payment_status: 'pending',
      delivery_type: 'self_pickup', pickup_location: 'Farm gate, Pentapadu', cashfree_order_id: j.cashfreeOrderId,
    })
    expect(String(orders()[0].handover_otp)).toMatch(/^\d{4}$/)
    expect(harvest('h-new').stock_qty).toBe(50)
    expect(cf.created[0].amountRupees).toBe(6000)
    expect(lowStock).toHaveBeenCalledWith(expect.anything(), [{ listingId: LOT, harvestId: 'h-new', qty: 200 }])
  })
  it('the browser cannot set the price', async () => {
    await order({ price: 1, total: 1, amount: 1 })
    expect(cf.created[0].amountRupees).toBe(6000)
  })
  it('too big for the newest pick → the older pick that holds it all', async () => {
    await order({ qty: 500 })
    expect(orders()[0].harvest_id).toBe('h-old')
    expect(harvest('h-old').stock_qty).toBe(400)
  })
  it('no single pick holds it → 409 with the most you can order', async () => {
    const res = await order({ qty: 1000 })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/up to 900 kg/)
    expect(orders()).toHaveLength(0)
  })
  it.each([
    [{ qty: 75 }, /at least 100 kg/],
    [{ qty: 110 }, /packs of 25 kg/],
    [{ listingId: 'nope' }, /Invalid listing/],
    [{ qty: -5 }, /Invalid quantity/],
  ])('refuses %o — nothing claimed', async (x, msg) => {
    const res = await order(x)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(msg)
    expect(harvest('h-new').stock_qty).toBe(250)
  })
})

describe('delivery and fees', () => {
  it('delivery to AP: per-order transport included in total_price; address on the row', async () => {
    const j = await (await order({ delivery: 'AP', address: ADDRESS })).json()
    expect(j).toMatchObject({ goods: 6000, transport: 500, total: 6500 })
    expect(orders()[0]).toMatchObject({ delivery_type: 'courier', transport_charge: 500, transport_state: 'AP', total_price: 6500, delivery_address: ADDRESS.line, delivery_pincode: '534101', pickup_location: null })
    expect(cf.created[0].amountRupees).toBe(6500)
  })
  it('delivery needs an address', async () => {
    const res = await order({ delivery: 'AP' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/address/)
  })
  it('a state they deliver to but never priced → refused (never free)', async () => {
    const res = await order({ delivery: 'TG', address: ADDRESS })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Choose pickup/)
  })
  it('the moderator fee is on the produce only, added to what Cashfree charges', async () => {
    db.tables.platform_settings = [{ id: 1, bulk_fee_percent: 2 }]
    const j = await (await order({ delivery: 'AP', address: ADDRESS })).json()
    expect(j).toMatchObject({ goods: 6000, transport: 500, fee: 120, total: 6620 })
    expect(orders()[0]).toMatchObject({ platform_fee: 120, total_price: 6500 })
    expect(cf.created[0].amountRupees).toBe(6620)
  })
})

describe('when something fails', () => {
  it('Cashfree down → order cancelled and the stock given back', async () => {
    cf.createFails = true
    expect((await order()).status).toBe(502)
    expect(orders()[0]).toMatchObject({ status: 'cancelled' })
    expect(harvest('h-new').stock_qty).toBe(250)
  })
  it('the insert fails → the stock is given back', async () => {
    db.insertFails = true
    expect((await order()).status).toBe(500)
    expect(harvest('h-new').stock_qty).toBe(250)
  })
})

describe('verify', () => {
  const begin = async () => (await (await order()).json()).cashfreeOrderId as string
  it('not paid yet → paid:false, still pending', async () => {
    const id = await begin()
    cf.state.set(id, { paid: false, orderStatus: 'ACTIVE', inFlight: true })
    expect(await (await verify.POST(post({ cashfreeOrderId: id }))).json()).toEqual({ ok: false, paid: false, pending: true, orderStatus: 'ACTIVE' })
  })
  it('paid → recorded through the shop’s markCashfreePaid', async () => {
    const id = await begin()
    cf.state.set(id, { paid: true, paymentId: 'pay1', label: null })
    expect(await (await verify.POST(post({ cashfreeOrderId: id }))).json()).toMatchObject({ ok: true, paid: true, paymentId: 'pay1' })
    expect(markCashfreePaid).toHaveBeenCalledTimes(1)
    expect(orders()[0].payment_status).toBe('paid')
  })
  it('someone else’s payment → 404; junk → 400', async () => {
    const id = await begin()
    session = OTHER
    expect((await verify.POST(post({ cashfreeOrderId: id }))).status).toBe(404)
    expect((await verify.POST(post({ cashfreeOrderId: 'gs_x' }))).status).toBe(400)
  })
})

describe('abandon', () => {
  const begin = async () => (await (await order()).json()).cashfreeOrderId as string
  it('closed without paying → terminated, cancelled, stock back', async () => {
    const id = await begin()
    expect(await (await abandon.POST(post({ cashfreeOrderId: id }))).json()).toEqual({ ok: true, cancelled: 1, paid: false, processing: false })
    expect(cf.terminated).toEqual([id])
    expect(orders()[0]).toMatchObject({ status: 'cancelled', decline_reason: 'Payment not completed' })
    expect(harvest('h-new').stock_qty).toBe(250)
  })
  it('actually paid (UPI late) → recorded as paid, never cancelled', async () => {
    const id = await begin()
    cf.state.set(id, { paid: true, paymentId: 'late', label: null })
    expect(await (await abandon.POST(post({ cashfreeOrderId: id }))).json()).toMatchObject({ paid: true, cancelled: 0 })
    expect(orders()[0].status).toBe('pending')
    expect(orders()[0].payment_status).toBe('paid')
  })
  it('payment still in flight → left alone', async () => {
    const id = await begin()
    cf.state.set(id, { paid: false, orderStatus: 'ACTIVE', inFlight: true })
    expect(await (await abandon.POST(post({ cashfreeOrderId: id }))).json()).toMatchObject({ processing: true, cancelled: 0 })
    expect(harvest('h-new').stock_qty).toBe(50)
  })
  it('twice → the stock is given back once', async () => {
    const id = await begin()
    await abandon.POST(post({ cashfreeOrderId: id }))
    await abandon.POST(post({ cashfreeOrderId: id }))
    expect(harvest('h-new').stock_qty).toBe(250)
  })
  it('someone else cannot abandon my order', async () => {
    const id = await begin()
    session = OTHER
    expect(await (await abandon.POST(post({ cashfreeOrderId: id }))).json()).toMatchObject({ cancelled: 0 })
    expect(orders()[0].status).toBe('pending')
  })
})

describe('My bulk orders', () => {
  it('only mine, with the seller attached', async () => {
    await order()
    orders().push({ id: 'x', buyer_aggregator_id: OTHER, farmer_id: FARMER, created_at: day(0) })
    const j = await (await list.GET(new NextRequest('http://localhost/x'))).json()
    expect(j.orders).toHaveLength(1)
    expect(j.orders[0].seller).toMatchObject({ name: 'Ravi', phone: '9000000002' })
  })
  it('needs an aggregator', async () => {
    session = FARMER
    expect((await list.GET(new NextRequest('http://localhost/x'))).status).toBe(401)
  })
})

describe('moderator bulk fee', () => {
  it('defaults to 0, saves a new value', async () => {
    expect(await (await fee.GET(new NextRequest('http://localhost/x'))).json()).toEqual({ feePercent: 0, configured: true })
    expect(await (await fee.POST(post({ feePercent: '2.5' }))).json()).toEqual({ ok: true, feePercent: 2.5 })
    expect(db.tables.platform_settings[0]).toMatchObject({ id: 1, bulk_fee_percent: 2.5 })
  })
  it.each([[-1], [101], ['abc'], [''], [null]])('refuses %o', async (v) => {
    expect((await fee.POST(post({ feePercent: v }))).status).toBe(400)
  })
  it('needs a moderator', async () => {
    moderator = false
    expect((await fee.POST(post({ feePercent: 1 }))).status).toBe(401)
  })
})

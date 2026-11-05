import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// /api/orders/place, run end to end against an in-memory stand-in for
// Supabase. Pure helpers are covered in tests/lib; this file is about the
// route's own decisions — who may order, what gets written, what stock moves —
// which no helper test can see.
//
// Hermetic like the rest of the suite: createClient is mocked, so nothing here
// touches a database or the network.

const FARMER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_FARMER_ID = '22222222-2222-4222-8222-222222222222'
const LISTING_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_LISTING_ID = '44444444-4444-4444-8444-444444444444'
const CONSUMER_ID = '55555555-5555-4555-8555-555555555555'

const FARMER_PHONE = '9876543210'
const BUYER_PHONE = '9123456789'

type Row = Record<string, unknown>

// ── Fake database ──────────────────────────────────────────────────────────
const db = {
  consumers: [] as Row[],
  farmers: [] as Row[],
  listings: [] as Row[],
  orders: [] as Row[],
  // Simulates a database that has not run scripts/self-order-migration.sql.
  missingSelfOrderColumn: false,
  // Simulates a database that has not run scripts/wholesale-migration.sql.
  missingSaleModeColumn: false,
  insertAttempts: [] as Row[][],
}

function resetDb() {
  db.consumers = [{ id: CONSUMER_ID, name: 'Asha', phone: BUYER_PHONE }]
  db.farmers = [
    { id: FARMER_ID, phone: `+91 ${FARMER_PHONE}`, cod_enabled: true, pickup_location_phones: null },
    { id: OTHER_FARMER_ID, phone: '9000000000', cod_enabled: false, pickup_location_phones: null },
  ]
  db.listings = [
    {
      id: LISTING_ID, name: 'Tomato', unit: 'kg', stock_qty: 10, status: 'available', farmer_id: FARMER_ID,
      sale_step: 0.5, price_tier_1_qty: 1000, price_tier_1_price: 40, price_tier_2_qty: null,
      price_tier_2_price: null, price_tier_3_price: null,
    },
    {
      id: OTHER_LISTING_ID, name: 'Brinjal', unit: 'kg', stock_qty: 5, status: 'available', farmer_id: OTHER_FARMER_ID,
      sale_step: 1, price_tier_1_qty: 1000, price_tier_1_price: 30, price_tier_2_qty: null,
      price_tier_2_price: null, price_tier_3_price: null,
    },
  ]
  db.orders = []
  db.missingSelfOrderColumn = false
  db.missingSaleModeColumn = false
  db.insertAttempts = []
}

function tableRows(table: string): Row[] {
  if (table === 'consumers_auth') return db.consumers
  if (table === 'farmers') return db.farmers
  if (table === 'produce_listings') return db.listings
  if (table === 'orders') return db.orders
  return []
}

// A minimal PostgREST-ish builder: records filters, resolves when awaited.
function query(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let insertRows: Row[] | null = null
  let single: 'maybe' | 'one' | null = null
  let selectCols = ''

  const run = () => {
    if (db.missingSaleModeColumn && table === 'produce_listings' && selectCols.includes('sale_mode')) {
      return { data: null, error: { message: 'column produce_listings.sale_mode does not exist' } }
    }
    if (table === 'platform_settings') {
      // No fee, no deposit, launch delivery defaults — the plain checkout.
      return { data: { fee_percent: 0, cod_deposit_percent: 0, delivery_base_fee: 30, delivery_extra_fee: 15 }, error: null }
    }
    if (insertRows) {
      db.insertAttempts.push(insertRows)
      if (db.missingSelfOrderColumn && insertRows.some((r) => 'is_self_order' in r)) {
        return { data: null, error: { message: "Could not find the 'is_self_order' column of 'orders' in the schema cache" } }
      }
      const saved = insertRows.map((r, i) => ({ ...r, id: `order-${db.orders.length + i + 1}`, order_code: `YFF-${db.orders.length + i + 1}` }))
      db.orders.push(...saved)
      return { data: saved.map((r) => ({ id: r.id, order_code: r.order_code })), error: null }
    }
    const rows = tableRows(table).filter((r) => filters.every((f) => f(r)))
    if (single) return { data: rows[0] ?? null, error: null }
    return { data: rows, error: null }
  }

  const b: Record<string, unknown> = {
    select: (cols?: string) => { selectCols = cols ?? ''; return b },
    order: () => b,
    limit: () => b,
    eq: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return b },
    is: (col: string, v: unknown) => { filters.push((r) => (r[col] ?? null) === v); return b },
    in: (col: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[col])); return b },
    insert: (rows: Row[]) => { insertRows = rows; return b },
    maybeSingle: () => { single = 'maybe'; return b },
    single: () => { single = 'one'; return b },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  }
  return b
}

const fakeSupabase = {
  from: (table: string) => query(table),
  rpc: async (fn: string, args: { p_listing_id: string; p_qty: number }) => {
    const listing = db.listings.find((l) => l.id === args.p_listing_id)
    if (!listing) return { data: false, error: null }
    if (fn === 'decrement_stock') {
      if ((listing.stock_qty as number) < args.p_qty) return { data: false, error: null }
      listing.stock_qty = (listing.stock_qty as number) - args.p_qty
      return { data: true, error: null }
    }
    if (fn === 'increment_stock') {
      listing.stock_qty = (listing.stock_qty as number) + args.p_qty
      return { data: true, error: null }
    }
    return { data: null, error: { message: `unexpected rpc ${fn}` } }
  },
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabase }))

let sessionConsumerId: string | null = CONSUMER_ID
vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  getConsumerSessionFromRequest: () => (sessionConsumerId ? { consumerId: sessionConsumerId } : null),
}))
vi.mock('@/lib/orderNotify', () => ({ notifyOrdersPlaced: vi.fn() }))
// The wholesale low-stock check runs in after(), which needs a real request
// scope; here we only check the route hands it the right claims.
const scheduleWholesaleLowStockCheck = vi.fn()
vi.mock('@/lib/wholesaleLowStockAlert', () => ({
  scheduleWholesaleLowStockCheck: (...a: unknown[]) => scheduleWholesaleLowStockCheck(...a),
}))

const { POST } = await import('@/app/api/orders/place/route')

// Each request gets its own IP so the route's rate limiter never interferes.
let ipCounter = 0
function place(body: Record<string, unknown>) {
  ipCounter += 1
  return POST(new NextRequest('http://localhost/api/orders/place', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${ipCounter}` },
    body: JSON.stringify(body),
  }))
}

const order = (overrides: Record<string, unknown> = {}) => ({
  farmerId: FARMER_ID,
  paymentMethod: 'cod',
  deliveryType: 'self_pickup',
  pickupLocation: 'Farm gate',
  items: [{ listingId: LISTING_ID, qty: 2 }],
  ...overrides,
})

// The farmer shopping from their own buyer account (same phone, any format).
function asFarmer() {
  db.consumers.push({ id: 'farmer-as-buyer', name: 'Ravi (farmer)', phone: FARMER_PHONE })
  sessionConsumerId = 'farmer-as-buyer'
}

beforeEach(() => {
  resetDb()
  sessionConsumerId = CONSUMER_ID
})

describe('a farmer ordering their own produce', () => {
  // USE: the restriction this change removes. Before, this returned 400 "This
  // is your own listing. You cannot place an order with yourself."
  it('is accepted instead of refused', async () => {
    asFarmer()
    const res = await place(order())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.orderIds).toHaveLength(1)
    expect(json.total).toBe(80)
  })

  // USE: the farmer's quantity tracking depends on the flag being written.
  it('is recorded as a self-order', async () => {
    asFarmer()
    await place(order())
    expect(db.orders).toHaveLength(1)
    expect(db.orders[0]).toMatchObject({
      farmer_id: FARMER_ID,
      buyer_phone: FARMER_PHONE,
      quantity: 2,
      status: 'pending',
      is_self_order: true,
    })
  })

  // USE: a self-order comes out of the same stock as any sale — otherwise the
  // farmer could "order" more than they have and the shelf would lie.
  it('claims stock exactly like a buyer order', async () => {
    asFarmer()
    await place(order({ items: [{ listingId: LISTING_ID, qty: 3.5 }] }))
    expect(db.listings[0].stock_qty).toBe(6.5)
  })

  it('still cannot take more than is in stock', async () => {
    asFarmer()
    const res = await place(order({ items: [{ listingId: LISTING_ID, qty: 11 }] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/just sold out/)
    expect(db.listings[0].stock_qty).toBe(10)
    expect(db.orders).toHaveLength(0)
  })

  it('still respects the sale step', async () => {
    asFarmer()
    const res = await place(order({ items: [{ listingId: LISTING_ID, qty: 0.3 }] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/multiples of 0.5/)
  })

  // USE: on a database where scripts/self-order-migration.sql hasn't run, the
  // farmer's order must still go through — it only loses the badge.
  it('is placed without the flag when the column does not exist yet', async () => {
    asFarmer()
    db.missingSelfOrderColumn = true
    const res = await place(order())
    expect(res.status).toBe(200)
    expect(db.insertAttempts).toHaveLength(2)
    expect(db.orders).toHaveLength(1)
    expect(db.orders[0]).not.toHaveProperty('is_self_order')
    // Stock was claimed once, not twice and not reverted.
    expect(db.listings[0].stock_qty).toBe(8)
  })

  // USE: a guest checkout using the farmer's number is the same person.
  it('is recognised for a guest checkout with the farmer\'s phone', async () => {
    sessionConsumerId = null
    const res = await place(order({
      guest: { name: 'Ravi', email: 'ravi@example.com', phone: `0${FARMER_PHONE}` },
      deliveryAddress: 'Door 4, Main street, Tadepalligudem',
    }))
    expect(res.status).toBe(200)
    expect(db.orders[0].is_self_order).toBe(true)
  })
})

describe('ordinary buyer orders are unchanged', () => {
  it('places the order and claims stock', async () => {
    const res = await place(order())
    expect(res.status).toBe(200)
    expect(db.orders).toHaveLength(1)
    expect(db.orders[0]).toMatchObject({ consumer_id: CONSUMER_ID, buyer_phone: BUYER_PHONE, quantity: 2, total_price: 80 })
    expect(db.listings[0].stock_qty).toBe(8)
  })

  // USE: an ordinary checkout must never name the new column, so it keeps
  // working on a database that has not run the migration.
  it('never names is_self_order', async () => {
    db.missingSelfOrderColumn = true
    const res = await place(order())
    expect(res.status).toBe(200)
    expect(db.insertAttempts).toHaveLength(1)
    expect(db.orders[0]).not.toHaveProperty('is_self_order')
  })

  it('rejects an item from a different farmer', async () => {
    const res = await place(order({ items: [{ listingId: LISTING_ID, qty: 1 }, { listingId: OTHER_LISTING_ID, qty: 1 }] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/same farmer/)
    expect(db.orders).toHaveLength(0)
  })

  it('rejects a paused listing', async () => {
    db.listings[0].status = 'paused'
    const res = await place(order())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no longer available/)
  })

  it('rejects COD when the farmer does not take it', async () => {
    const res = await place(order({ farmerId: OTHER_FARMER_ID, items: [{ listingId: OTHER_LISTING_ID, qty: 1 }] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Cash on Delivery/)
  })

  it.each([
    [{ items: [] }, /Cart is empty/],
    [{ items: [{ listingId: LISTING_ID, qty: 0 }] }, /Invalid quantity/],
    [{ items: [{ listingId: LISTING_ID, qty: -1 }] }, /Invalid quantity/],
    [{ items: [{ listingId: 'not-a-uuid', qty: 1 }] }, /Invalid listing id/],
    [{ paymentMethod: 'bitcoin' }, /Invalid payment method/],
    [{ farmerId: 'nope' }, /Invalid farmer/],
  ])('validates the request (%#)', async (overrides, message) => {
    const res = await place(order(overrides))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(message)
    expect(db.orders).toHaveLength(0)
  })

  it('requires a full address for home delivery', async () => {
    const res = await place(order({ deliveryType: 'home_delivery', deliveryAddress: 'short' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/too short/)
  })
})

describe('wholesale — the household checkout', () => {
  beforeEach(() => scheduleWholesaleLowStockCheck.mockClear())

  it('refuses wholesale-only produce, takes no stock and writes nothing', async () => {
    db.listings[0].sale_mode = 'wholesale'
    const res = await place(order())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no longer available/)
    expect(db.orders).toHaveLength(0)
    expect(db.listings[0].stock_qty).toBe(10)
    expect(scheduleWholesaleLowStockCheck).not.toHaveBeenCalled()
  })

  it('sells a "both" produce at its retail price', async () => {
    Object.assign(db.listings[0], { sale_mode: 'both', wholesale_price: 25, wholesale_min_qty: 5 })
    const res = await place(order())
    expect(res.status).toBe(200)
    expect(db.orders[0]).toMatchObject({ quantity: 2, total_price: 80 }) // 2 × ₹40 retail, not ₹25
    expect(db.listings[0].stock_qty).toBe(8)
  })

  it('hands the stock it took to the wholesale low-stock check', async () => {
    Object.assign(db.listings[0], { sale_mode: 'both' })
    await place(order())
    expect(scheduleWholesaleLowStockCheck).toHaveBeenCalledTimes(1)
    expect(scheduleWholesaleLowStockCheck.mock.calls[0][1]).toEqual([{ listingId: LISTING_ID, harvestId: null, qty: 2 }])
  })

  it('a refused order never reaches the low-stock check', async () => {
    db.listings[0].stock_qty = 1 // asks for 2
    const res = await place(order())
    expect(res.status).toBe(400)
    expect(scheduleWholesaleLowStockCheck).not.toHaveBeenCalled()
  })

  it('works on a database without the wholesale columns (retries without sale_mode)', async () => {
    db.missingSaleModeColumn = true
    const res = await place(order())
    expect(res.status).toBe(200)
    expect(db.orders).toHaveLength(1)
  })

  it('a pre-migration row with no sale_mode is retail', async () => {
    const res = await place(order())
    expect(res.status).toBe(200)
  })
})

describe('wholesale — bulk is for aggregators only (decision 2026-11-04)', () => {
  const WS = { sale_mode: 'both', wholesale_price: 30, wholesale_min_qty: 4, wholesale_pack_size: 2, wholesale_transport_states: ['AP'] }
  const ADDRESS = { deliveryAddress: '12-3 Main Road, Near Temple', deliveryCity: 'Tadepalligudem', deliveryPincode: '534101' }
  beforeEach(() => {
    Object.assign(db.listings[0], WS) // Tomato: retail ₹40, wholesale ₹30, min 4, packs of 2, stock 10
    scheduleWholesaleLowStockCheck.mockClear()
  })

  it('a bulk line is refused: no order, no stock taken, no low-stock check', async () => {
    const res = await place(order({ items: [{ listingId: LISTING_ID, qty: 6, wholesale: true, deliveryType: 'self_pickup' }] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/only for aggregators/)
    expect(db.orders).toHaveLength(0)
    expect(db.listings[0].stock_qty).toBe(10)
    expect(scheduleWholesaleLowStockCheck).not.toHaveBeenCalled()
  })

  it('a cart mixing a retail and a bulk line is refused whole (the retail line is not placed)', async () => {
    const res = await place(order({ items: [
      { listingId: LISTING_ID, qty: 1 },
      { listingId: LISTING_ID, qty: 4, wholesale: true },
    ] }))
    expect(res.status).toBe(400)
    expect(db.orders).toHaveLength(0)
    expect(db.listings[0].stock_qty).toBe(10)
  })

  it.each([
    ['with delivery', { ...ADDRESS, deliveryType: 'home_delivery', items: [{ listingId: LISTING_ID, qty: 4, wholesale: true, deliveryType: 'home_delivery' }] }],
    ['as a pre-order', { items: [{ listingId: LISTING_ID, qty: 4, wholesale: true, preorder: true }] }],
    ['with a crafted price', { items: [{ listingId: LISTING_ID, qty: 4, wholesale: true, price: 1, pricePerKg: 1 }] }],
    ['on wholesale-only produce', { items: [{ listingId: LISTING_ID, qty: 4, wholesale: true }] }],
  ])('refused %s too', async (name, overrides) => {
    if (name === 'on wholesale-only produce') db.listings[0].sale_mode = 'wholesale'
    const res = await place(order(overrides as Record<string, unknown>))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/only for aggregators/)
    expect(db.orders).toHaveLength(0)
  })

  it('a guest is refused the same way', async () => {
    sessionConsumerId = null
    const res = await place(order({
      guest: { name: 'Ravi', email: 'ravi@example.com', phone: '9123456780' },
      deliveryAddress: 'Door 4, Main street, Tadepalligudem',
      items: [{ listingId: LISTING_ID, qty: 4, wholesale: true }],
    }))
    expect(res.status).toBe(400)
    expect(db.orders).toHaveLength(0)
  })

  it('wholesale: false (or absent) is an ordinary retail line at the retail price', async () => {
    const res = await place(order({ items: [{ listingId: LISTING_ID, qty: 4, wholesale: false }] }))
    expect(res.status).toBe(200)
    expect(db.orders[0]).toMatchObject({ quantity: 4, total_price: 160 }) // 4 × ₹40, never ₹30
  })

  it('a retail order never names order_type (works before the migration)', async () => {
    const res = await place(order())
    expect(res.status).toBe(200)
    expect(db.orders[0]).not.toHaveProperty('order_type')
  })

  it('a retail order of a "both" produce still goes to the low-stock check', async () => {
    await place(order({ items: [{ listingId: LISTING_ID, qty: 4 }] }))
    expect(scheduleWholesaleLowStockCheck.mock.calls[0][1]).toEqual([{ listingId: LISTING_ID, harvestId: null, qty: 4 }])
  })

  it('"courier" on a retail line is honoured per line since 2026-11-05 (transportable produce) — and needs an address', async () => {
    const noAddress = await place(order({ items: [{ listingId: LISTING_ID, qty: 2, deliveryType: 'courier' }] }))
    expect(noAddress.status).toBe(400)
    const res = await place(order({ items: [{ listingId: LISTING_ID, qty: 2, deliveryType: 'courier' }], deliveryAddress: '12 Main Road', deliveryCity: 'Eluru', deliveryPincode: '534001' }))
    expect(res.status).toBe(200)
    expect(db.orders[0].delivery_type).toBe('courier')
  })
})

describe('two lines on one produce (regression)', () => {
  it('two harvests of the same produce in one cart are not refused', async () => {
    const res = await place(order({ items: [{ listingId: LISTING_ID, qty: 1 }, { listingId: LISTING_ID, qty: 2 }] }))
    expect(res.status).toBe(200)
    expect(db.orders).toHaveLength(2)
    expect(db.listings[0].stock_qty).toBe(7)
  })
  it('a really missing produce is still refused', async () => {
    const res = await place(order({ items: [{ listingId: LISTING_ID, qty: 1 }, { listingId: '99999999-9999-4999-8999-999999999999', qty: 1 }] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no longer available/)
  })
})

// ---------------------------------------------------------------------------
// Transportable retail produce (2026-11-05): a courier line of a produce the
// farmer transports across AP / TG carries that state's charge (from the
// delivery pincode), once per farmer order, inside total_price.
describe('transportable produce by courier', () => {
  const courier = (pincode: string, extra: Record<string, unknown> = {}) => order({
    paymentMethod: 'cod',
    deliveryType: 'courier',
    items: [{ listingId: LISTING_ID, qty: 2, deliveryType: 'courier' }],
    deliveryAddress: '12 Main Road', deliveryCity: 'Gajuwaka', deliveryPincode: pincode,
    ...extra,
  })
  const transportable = () => Object.assign(db.listings[0], { retail_reach: 'transport', retail_transport_rates: { AP: 80, TG: 120 } })

  it('adds the AP charge for an AP pincode, once, inside total_price', async () => {
    transportable()
    const r = await place(courier('530026'))
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.transportCharge).toBe(80)
    expect(j.total).toBe(80 + 80) // 2 kg × ₹40 + ₹80 transport
    expect(db.orders[0]).toMatchObject({ transport_charge: 80, transport_state: 'AP', total_price: 160, delivery_type: 'courier' })
  })
  it('uses the Telangana charge for a Telangana pincode', async () => {
    transportable()
    const j = await (await place(courier('500072'))).json()
    expect(j.transportCharge).toBe(120)
  })
  it('refuses a state the farmer does not send to', async () => {
    Object.assign(db.listings[0], { retail_reach: 'transport', retail_transport_rates: { AP: 80 } })
    const r = await place(courier('500072'))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/not delivered to Telangana/)
    expect(db.orders).toHaveLength(0)
  })
  it('a plain local courier line has no transport charge (as before)', async () => {
    const j = await (await place(courier('534101'))).json()
    expect(j.transportCharge).toBe(0)
    expect(db.orders[0]).not.toHaveProperty('transport_charge')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// The three routes that save produce, end to end against an in-memory
// Supabase: the farmer/aggregator edit (/api/farmer/update-listing) and the
// moderator create + edit (/api/moderator/listings, /[id]). The wholesale rules
// themselves are unit-tested in tests/lib/wholesale.test.ts; this checks each
// route applies them, writes the right columns, and behaves on a server where
// scripts/wholesale-migration.sql has not run yet.

const FARMER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_FARMER_ID = '22222222-2222-4222-8222-222222222222'
const LISTING_ID = '33333333-3333-4333-8333-333333333333'
const ZONE = 'tadepalligudem'

type Row = Record<string, unknown>

const WHOLESALE_KEYS = ['sale_mode', 'wholesale_price', 'wholesale_min_qty', 'wholesale_pack_size', 'wholesale_transport_states']

const db = {
  tables: {} as Record<string, Row[]>,
  // Simulates a database without scripts/wholesale-migration.sql.
  noWholesaleColumns: false,
  // Simulates the Phase 7 selling-lock trigger refusing the write.
  sellingLock: false,
  writes: [] as Array<{ table: string; kind: 'insert' | 'update'; row: Row }>,
}

function missingColumn(row: Row) {
  const key = WHOLESALE_KEYS.find((k) => k in row)
  return key && db.noWholesaleColumns
    ? { code: 'PGRST204', message: `Could not find the '${key}' column of 'produce_listings' in the schema cache` }
    : null
}

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let updateSet: Row | null = null
  let insertRow: Row | null = null
  let single = false

  const run = () => {
    const rows = (db.tables[table] ??= [])
    if (insertRow) {
      if (db.sellingLock) return { data: null, error: { message: 'SELLING_PLAN_REQUIRED: a Selling plan is needed to put produce on sale.' } }
      const err = missingColumn(insertRow)
      if (err) return { data: null, error: err }
      const row = { id: `new-${rows.length + 1}`, ...insertRow }
      rows.push(row)
      db.writes.push({ table, kind: 'insert', row: insertRow })
      return { data: single ? { ...row } : [{ ...row }], error: null }
    }
    const hit = rows.filter((r) => filters.every((f) => f(r)))
    if (updateSet) {
      if (db.sellingLock && table === 'produce_listings') return { data: null, error: { message: 'SELLING_PLAN_REQUIRED: a Selling plan is needed to put produce on sale.' } }
      const err = missingColumn(updateSet)
      if (err) return { data: null, error: err }
      for (const r of hit) Object.assign(r, updateSet)
      db.writes.push({ table, kind: 'update', row: updateSet })
      return { data: single ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r })), error: null }
    }
    if (single) return { data: hit[0] ? { ...hit[0] } : null, error: null }
    return { data: hit.map((r) => ({ ...r })), error: null }
  }

  const b: Record<string, unknown> = {
    select: () => b,
    eq: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return b },
    in: (col: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[col])); return b },
    order: () => b,
    limit: () => b,
    update: (set: Row) => { updateSet = set; return b },
    insert: (row: Row) => { insertRow = row; return b },
    maybeSingle: () => { single = true; return b },
    single: () => { single = true; return b },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  }
  return b
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => query(t) }) }))

let sessionFarmerId: string | null = FARMER_ID
vi.mock('@/lib/farmer-session', () => ({
  getFarmerSessionFromRequest: () => (sessionFarmerId ? { farmerId: sessionFarmerId } : null),
}))
let isModerator = true
vi.mock('@/lib/moderator-session', () => ({
  isModeratorRequest: () => isModerator,
  getModeratorZone: () => ZONE,
}))
vi.mock('@/lib/purchaseCounts', () => ({ purchaseCountsFor: async () => ({}) }))

const updateListing = (await import('@/app/api/farmer/update-listing/route')).POST
const moderatorCreate = (await import('@/app/api/moderator/listings/route')).POST
const moderatorEdit = (await import('@/app/api/moderator/listings/[id]/route')).PUT

function req(url: string, body: unknown, method = 'POST', lang?: 'en' | 'te') {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...(lang ? { cookie: `yff_lang=${lang}` } : {}) },
    body: JSON.stringify(body),
  })
}

const listing = () => db.tables.produce_listings.find((r) => r.id === LISTING_ID) as Row
const lastListingWrite = () => [...db.writes].reverse().find((w) => w.table === 'produce_listings')?.row

beforeEach(() => {
  db.noWholesaleColumns = false
  db.sellingLock = false
  db.writes = []
  sessionFarmerId = FARMER_ID
  isModerator = true
  db.tables = {
    farmers: [{ id: FARMER_ID, region_slug: ZONE }, { id: OTHER_FARMER_ID, region_slug: 'elsewhere' }],
    produce_listings: [{
      id: LISTING_ID, farmer_id: FARMER_ID, name: 'Tomato', unit: 'kg', status: 'available', stock_qty: 50,
      sale_mode: 'retail', wholesale_price: null, wholesale_min_qty: null, wholesale_pack_size: null,
      wholesale_transport_states: [],
    }],
    harvests: [],
  }
})

// ---------------------------------------------------------------------------
describe('/api/farmer/update-listing — wholesale', () => {
  const edit = (payload: Row, lang?: 'en' | 'te') =>
    updateListing(req('/api/farmer/update-listing', { listingId: LISTING_ID, payload }, 'POST', lang))

  it('an edit without wholesale fields leaves them alone (regression)', async () => {
    listing().sale_mode = 'both'
    listing().wholesale_price = 30
    const res = await edit({ name: 'Tomato', stock_qty: 40 })
    expect(res.status).toBe(200)
    expect(listing()).toMatchObject({ sale_mode: 'both', wholesale_price: 30, stock_qty: 40 })
    expect(Object.keys(lastListingWrite()!)).not.toContain('sale_mode')
  })

  it('saves Both with normalised columns', async () => {
    const res = await edit({
      sale_mode: 'both', wholesale_price: 30.456, wholesale_min_qty: 100, wholesale_pack_size: 25,
      wholesale_transport_states: ['TG', 'AP'],
    })
    expect(res.status).toBe(200)
    // A pack (2026-11-10): the minimum is one pack; pack price = price × pack.
    expect(listing()).toMatchObject({
      sale_mode: 'both', wholesale_price: 30.46, wholesale_min_qty: 25, wholesale_pack_size: 25, wholesale_pack_price: 761.4,
      wholesale_transport_states: ['AP', 'TG'],
    })
  })

  it('switching back to retail keeps the saved wholesale values', async () => {
    Object.assign(listing(), { sale_mode: 'wholesale', wholesale_price: 30, wholesale_min_qty: 100 })
    const res = await edit({ sale_mode: 'retail' })
    expect(res.status).toBe(200)
    expect(listing()).toMatchObject({ sale_mode: 'retail', wholesale_price: 30, wholesale_min_qty: 100 })
  })

  it('refuses a broken wholesale entry, in Telugu by default, and writes nothing', async () => {
    const res = await edit({ sale_mode: 'wholesale', wholesale_price: 0, wholesale_min_qty: 10 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/[ఀ-౿]/)
    expect(lastListingWrite()).toBeUndefined()
    expect(listing().sale_mode).toBe('retail')
  })

  it('error is in English when the buyer chose English', async () => {
    const res = await edit({ sale_mode: 'wholesale', wholesale_price: 0, wholesale_min_qty: 10 }, 'en')
    expect((await res.json()).error).toMatch(/above 0/)
  })

  it('refuses a wholesale price change without sale_mode', async () => {
    const res = await edit({ wholesale_price: 1 })
    expect(res.status).toBe(400)
    expect(listing().wholesale_price).toBeNull()
  })

  it('checks whole numbers against the unit in the same payload', async () => {
    const res = await edit({ unit: 'piece', sale_mode: 'wholesale', wholesale_price: 5, wholesale_min_qty: 1.5 })
    expect(res.status).toBe(400)
  })

  it('checks whole numbers against the saved unit when the payload has none', async () => {
    listing().unit = 'dozen'
    const res = await edit({ sale_mode: 'wholesale', wholesale_price: 5, wholesale_min_qty: 2.5 })
    expect(res.status).toBe(400)
  })

  it("another farmer's listing is still refused (403)", async () => {
    sessionFarmerId = OTHER_FARMER_ID
    const res = await edit({ sale_mode: 'both', wholesale_price: 30, wholesale_min_qty: 10, wholesale_transport_states: [] })
    expect(res.status).toBe(403)
    expect(listing().sale_mode).toBe('retail')
  })

  it('no session → 401', async () => {
    sessionFarmerId = null
    expect((await edit({ sale_mode: 'retail' })).status).toBe(401)
  })

  it('farmer_id cannot be changed alongside wholesale fields (regression)', async () => {
    await edit({ farmer_id: OTHER_FARMER_ID, sale_mode: 'both', wholesale_price: 30, wholesale_min_qty: 10, wholesale_transport_states: [] })
    expect(listing().farmer_id).toBe(FARMER_ID)
  })

  it('stock ↔ sold-out sync still runs with wholesale fields (regression)', async () => {
    const res = await edit({ stock_qty: 0, sale_mode: 'both', wholesale_price: 30, wholesale_min_qty: 10, wholesale_transport_states: [] })
    expect(res.status).toBe(200)
    expect(listing().status).toBe('sold_out')
  })
})

// ---------------------------------------------------------------------------
const createBody = (extra: Row = {}) => ({
  farmer_id: FARMER_ID, name: 'Mirchi', unit: 'kg', shelf_life_days: '5',
  harvest_date: '2026-11-03T08:00', delivery_mode: 'pickup', price_tier_1_price: '40', stock_qty: '200',
  ...extra,
})
const wholesaleBody = (extra: Row = {}) => ({
  sale_mode: 'both', wholesale_price: '30', wholesale_min_qty: '100', wholesale_pack_size: '25',
  wholesale_transport: true, wholesale_transport_states: ['AP'], ...extra,
})

describe('/api/moderator/listings POST — wholesale', () => {
  const create = (body: Row) => moderatorCreate(req('/api/moderator/listings', body))
  const created = () => db.writes.find((w) => w.table === 'produce_listings' && w.kind === 'insert')?.row

  it('retail sends no wholesale column (works before the migration)', async () => {
    db.noWholesaleColumns = true
    const res = await create(createBody())
    expect(res.status).toBe(200)
    expect(Object.keys(created()!).filter((k) => WHOLESALE_KEYS.includes(k))).toEqual([])
  })

  it('an explicit retail choice also sends none', async () => {
    const res = await create(createBody({ sale_mode: 'retail', wholesale_price: 'junk' }))
    expect(res.status).toBe(200)
    expect(created()).not.toHaveProperty('sale_mode')
  })

  it('Both is saved with every wholesale column', async () => {
    const res = await create(createBody(wholesaleBody()))
    expect(res.status).toBe(200)
    expect(created()).toMatchObject({
      sale_mode: 'both', wholesale_price: 30, wholesale_min_qty: 25, wholesale_pack_size: 25, wholesale_pack_price: 750,
      wholesale_transport_states: ['AP'],
    })
  })

  it('wholesale only without a retail price is accepted', async () => {
    const res = await create(createBody({ ...wholesaleBody({ sale_mode: 'wholesale' }), price_tier_1_price: '' }))
    expect(res.status).toBe(200)
    expect(created()).toMatchObject({ sale_mode: 'wholesale' })
    expect(created()).not.toHaveProperty('price_tier_1_price')
  })

  it('transport No saves an empty state list', async () => {
    await create(createBody(wholesaleBody({ wholesale_transport: false })))
    expect(created()).toMatchObject({ wholesale_transport_states: [] })
  })

  it.each([
    ['no price', { wholesale_price: '' }, /price of one pack/],
    ['no pack or minimum', { wholesale_min_qty: '', wholesale_pack_size: '' }, /pack size or the minimum/],
    ['a bad pack price', { wholesale_pack_price: '0' }, /pack price must be a number above 0/],
    ['transport not answered', { wholesale_transport: null }, /Yes or No/],
    ['transport Yes, no region', { wholesale_transport_states: [] }, /Choose Yes or No for transport/],
  ])('refuses %s with a 400 and creates nothing', async (_name, patch, msg) => {
    const res = await create(createBody(wholesaleBody(patch)))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(msg)
    expect(created()).toBeUndefined()
    expect(db.tables.harvests).toHaveLength(0)
  })

  it('wholesale on a server without the migration → 503, nothing created', async () => {
    db.noWholesaleColumns = true
    const res = await create(createBody(wholesaleBody()))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/not switched on/)
    expect(db.tables.harvests).toHaveLength(0)
  })

  it('the first harvest is still created (regression)', async () => {
    await create(createBody(wholesaleBody()))
    expect(db.tables.harvests).toHaveLength(1)
  })

  it('needs a moderator', async () => {
    isModerator = false
    expect((await create(createBody(wholesaleBody()))).status).toBe(401)
  })

  it('farmer outside the zone is still refused (regression)', async () => {
    const res = await create(createBody({ ...wholesaleBody(), farmer_id: OTHER_FARMER_ID }))
    expect(res.status).toBe(400)
    expect(created()).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
describe('/api/moderator/listings/[id] PUT — wholesale', () => {
  const edit = (body: Row) =>
    moderatorEdit(req(`/api/moderator/listings/${LISTING_ID}`, body, 'PUT'), { params: Promise.resolve({ id: LISTING_ID }) })
  const editBody = (extra: Row = {}) => ({
    name: 'Tomato', unit: 'kg', shelf_life_days: '5', delivery_mode: 'pickup', price_tier_1_price: '40', stock_qty: '50', ...extra,
  })

  it('an old caller without sale_mode leaves wholesale alone (regression)', async () => {
    Object.assign(listing(), { sale_mode: 'wholesale', wholesale_price: 30 })
    const res = await edit(editBody())
    expect(res.status).toBe(200)
    expect(listing()).toMatchObject({ sale_mode: 'wholesale', wholesale_price: 30 })
  })

  it('saves Both', async () => {
    const res = await edit(editBody(wholesaleBody()))
    expect(res.status).toBe(200)
    expect(listing()).toMatchObject({ sale_mode: 'both', wholesale_price: 30, wholesale_min_qty: 25, wholesale_pack_price: 750, wholesale_transport_states: ['AP'] })
  })

  it('back to retail writes only sale_mode', async () => {
    Object.assign(listing(), { sale_mode: 'both', wholesale_price: 30 })
    const res = await edit(editBody({ sale_mode: 'retail' }))
    expect(res.status).toBe(200)
    expect(listing()).toMatchObject({ sale_mode: 'retail', wholesale_price: 30 })
  })

  it('refuses a broken entry and changes nothing', async () => {
    const res = await edit(editBody(wholesaleBody({ wholesale_price: '-1' })))
    expect(res.status).toBe(400)
    expect(listing().sale_mode).toBe('retail')
    expect(lastListingWrite()).toBeUndefined()
  })

  it('retail on a server without the migration retries without the columns', async () => {
    db.noWholesaleColumns = true
    const res = await edit(editBody({ sale_mode: 'retail', stock_qty: '45' }))
    expect(res.status).toBe(200)
    expect(listing().stock_qty).toBe(45)
  })

  it('wholesale on a server without the migration → 503, nothing saved', async () => {
    db.noWholesaleColumns = true
    const res = await edit(editBody({ ...wholesaleBody(), stock_qty: '45' }))
    expect(res.status).toBe(503)
    expect(listing().stock_qty).toBe(50)
  })

  it('listing outside the zone → 404', async () => {
    listing().farmer_id = OTHER_FARMER_ID
    expect((await edit(editBody(wholesaleBody()))).status).toBe(404)
  })

  it('needs a moderator', async () => {
    isModerator = false
    expect((await edit(editBody(wholesaleBody()))).status).toBe(401)
  })
})

describe('the selling lock (Phase 7) is explained, not dumped', () => {
  it('farmer/aggregator edit → 403 in plain words (Telugu by default), with a code', async () => {
    db.sellingLock = true
    const res = await updateListing(req('/api/farmer/update-listing', { listingId: LISTING_ID, payload: { status: 'available' } }))
    expect(res.status).toBe(403)
    const j = await res.json()
    expect(j.code).toBe('SELLING_PLAN_REQUIRED')
    expect(j.error).toMatch(/[ఀ-౿]/)
    expect(j.error).not.toMatch(/SELLING_PLAN_REQUIRED/)
  })
  it('in English when chosen', async () => {
    db.sellingLock = true
    const j = await (await updateListing(req('/api/farmer/update-listing', { listingId: LISTING_ID, payload: { status: 'available' } }, 'POST', 'en'))).json()
    expect(j.error).toMatch(/Selling plan is needed/)
  })
  it('moderator create → 403 telling them to activate a plan', async () => {
    db.sellingLock = true
    const res = await moderatorCreate(req('/api/moderator/listings', createBody()))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/Activate a plan/)
  })
  it('moderator edit → 403 the same way', async () => {
    db.sellingLock = true
    const res = await moderatorEdit(
      req(`/api/moderator/listings/${LISTING_ID}`, { name: 'Tomato', unit: 'kg', shelf_life_days: '5', delivery_mode: 'pickup', price_tier_1_price: '40', stock_qty: '50' }, 'PUT'),
      { params: Promise.resolve({ id: LISTING_ID }) },
    )
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('SELLING_PLAN_REQUIRED')
  })
})

// ---------------------------------------------------------------------------
// Decision 2026-11-05: with Both, the wholesale price must be LOWER than every
// retail price — the save is blocked otherwise, on every route.
describe('Both: wholesale must be cheaper than retail', () => {
  const edit = (payload: Row) =>
    updateListing(req('/api/farmer/update-listing', { listingId: LISTING_ID, payload }, 'POST', 'en'))
  const both = (extra: Row = {}) => ({
    sale_mode: 'both', wholesale_price: 30, wholesale_min_qty: 100, wholesale_pack_size: null,
    wholesale_transport_states: [], ...extra,
  })

  it('farmer edit: wholesale equal to retail is refused, nothing saved', async () => {
    const res = await edit({ ...both({ wholesale_price: 40 }), price_tier_1_price: 40 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/lower than your retail price \(₹40\)/)
    expect(listing().sale_mode).toBe('retail')
  })
  it('farmer edit: compared with the LOWEST retail tier', async () => {
    const res = await edit({ ...both({ wholesale_price: 35 }), price_tier_1_price: 40, price_tier_3_price: 32 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/₹32/)
  })
  it('farmer edit: cheaper wholesale saves', async () => {
    expect((await edit({ ...both(), price_tier_1_price: 40 })).status).toBe(200)
    expect(listing()).toMatchObject({ sale_mode: 'both', wholesale_price: 30 })
  })
  it('farmer edit: raising only the retail-side gap is checked against the saved wholesale price', async () => {
    Object.assign(listing(), { sale_mode: 'both', wholesale_price: 30, price_tier_1_price: 40 })
    const res = await edit({ price_tier_1_price: 25 })
    expect(res.status).toBe(400)
    expect(listing().price_tier_1_price).toBe(40)
  })
  it('farmer edit: a status-only change never trips over an older listing', async () => {
    Object.assign(listing(), { sale_mode: 'both', wholesale_price: 50, price_tier_1_price: 40 })
    expect((await edit({ status: 'paused' })).status).toBe(200)
  })
  it('moderator create: refused when wholesale is not cheaper', async () => {
    const res = await moderatorCreate(req('/api/moderator/listings', createBody(wholesaleBody({ wholesale_price: '45' }))))
    expect(res.status).toBe(400)
    expect(db.writes.filter((w) => w.table === 'produce_listings')).toEqual([])
  })
  it('moderator edit: refused using the saved Both mode when sale_mode is not sent', async () => {
    Object.assign(listing(), { sale_mode: 'both', wholesale_price: 30, price_tier_1_price: 40 })
    const res = await moderatorEdit(
      req(`/api/moderator/listings/${LISTING_ID}`, { name: 'Tomato', unit: 'kg', shelf_life_days: '5', delivery_mode: 'pickup', price_tier_1_price: '28', stock_qty: '50' }, 'PUT'),
      { params: Promise.resolve({ id: LISTING_ID }) },
    )
    expect(res.status).toBe(400)
    expect(listing().price_tier_1_price).toBe(40)
  })
  it('retail-only and wholesale-only are never checked', async () => {
    expect((await edit({ sale_mode: 'retail', price_tier_1_price: 10 })).status).toBe(200)
    expect((await edit({ sale_mode: 'wholesale', wholesale_price: 90, wholesale_min_qty: 100, wholesale_pack_size: null, wholesale_transport_states: [], price_tier_1_price: 10 })).status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Retail packs (client card 2026-11-10): the routes apply the form's rules and
// derive the per-unit columns from the pack, whatever the request sent.
describe('retail packs through the save routes', () => {
  const PACK = { retail_pack_size: 0.25, retail_pack_price: 25, retail_pack_tiers: [{ min_packs: 4, price: 22 }] }

  it('farmer edit: pack saved, step = one pack, ₹/kg derived (a crafted ₹/kg is overwritten)', async () => {
    const res = await updateListing(req('/api/farmer/update-listing', { listingId: LISTING_ID, payload: { ...PACK, price_tier_1_price: 1, sale_step: 1 } }))
    expect(res.status).toBe(200)
    expect(listing()).toMatchObject({ ...PACK, sale_step: 0.25, price_tier_1_price: 100, price_tier_1_qty: 0.75, price_tier_3_price: 88 })
  })
  it('farmer edit: a pack size not on the list is refused, nothing written', async () => {
    const res = await updateListing(req('/api/farmer/update-listing', { listingId: LISTING_ID, payload: { ...PACK, retail_pack_size: 0.3 } }, 'POST', 'en'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/from the list/)
    expect(listing()).not.toHaveProperty('retail_pack_size')
  })
  it('farmer edit: a pack on a piece unit is refused', async () => {
    const res = await updateListing(req('/api/farmer/update-listing', { listingId: LISTING_ID, payload: { ...PACK, unit: 'piece' } }, 'POST', 'en'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/kg or gram/)
  })
  it('farmer edit: clearing the pack (loose again) clears all three', async () => {
    Object.assign(listing(), PACK)
    const res = await updateListing(req('/api/farmer/update-listing', { listingId: LISTING_ID, payload: { retail_pack_size: null, retail_pack_price: null, retail_pack_tiers: [], price_tier_1_price: 90 } }))
    expect(res.status).toBe(200)
    expect(listing()).toMatchObject({ retail_pack_size: null, retail_pack_price: null, retail_pack_tiers: [], price_tier_1_price: 90 })
  })
  it('farmer edit without pack fields leaves them alone (regression)', async () => {
    Object.assign(listing(), PACK)
    await updateListing(req('/api/farmer/update-listing', { listingId: LISTING_ID, payload: { stock_qty: 30 } }))
    expect(listing()).toMatchObject(PACK)
  })
  it('moderator create: pack saved with the derived per-unit columns', async () => {
    const res = await moderatorCreate(req('/api/moderator/listings', createBody({ ...PACK, price_tier_1_price: '1' })))
    expect(res.status).toBe(200)
    const row = db.writes.find((w) => w.table === 'produce_listings' && w.kind === 'insert')?.row
    expect(row).toMatchObject({ ...PACK, sale_step: 0.25, price_tier_1_price: 100 })
  })
  it('moderator create: a bad pack is refused, nothing created', async () => {
    const res = await moderatorCreate(req('/api/moderator/listings', createBody({ ...PACK, retail_pack_price: '' })))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/price of one pack/)
    expect(db.writes.find((w) => w.table === 'produce_listings' && w.kind === 'insert')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Delivery step (client card 2026-11-10): courier type, cargo services, who pays.
describe('delivery choices through the save routes', () => {
  const farmerEdit = (payload: Row, lang: 'en' | 'te' = 'en') =>
    updateListing(req('/api/farmer/update-listing', { listingId: LISTING_ID, payload }, 'POST', lang))

  it('cargo (ToPay): services saved, nothing charged online, offered across AP and TG', async () => {
    const res = await farmerEdit({ delivery_mode: 'courier', courier_type: 'cargo', cargo_services: ['VRL Logistics', ' Sri Durga Parcels '], delivery_paid_by: 'buyer', delivery_charge: 400 })
    expect(res.status).toBe(200)
    expect(listing()).toMatchObject({
      courier_type: 'cargo', cargo_services: ['VRL Logistics', 'Sri Durga Parcels'], delivery_paid_by: 'buyer',
      delivery_charge: 0, retail_reach: 'transport', retail_transport_rates: { AP: 0, TG: 0 },
    })
  })
  it('local, buyer pays: the charge is kept', async () => {
    const res = await farmerEdit({ delivery_mode: 'both', courier_type: 'local', delivery_paid_by: 'buyer', delivery_charge: 40, delivery_radius_km: 12 })
    expect(res.status).toBe(200)
    expect(listing()).toMatchObject({ courier_type: 'local', delivery_paid_by: 'buyer', delivery_charge: 40, delivery_radius_km: 12, retail_reach: 'local' })
  })
  it('local, farmer pays: free for the buyer', async () => {
    await farmerEdit({ delivery_mode: 'courier', courier_type: 'local', delivery_paid_by: 'farmer', delivery_charge: 40 })
    expect(listing()).toMatchObject({ delivery_paid_by: 'farmer', delivery_charge: 0 })
  })
  it('pickup only clears the courier fields', async () => {
    Object.assign(listing(), { courier_type: 'cargo', cargo_services: ['VRL Logistics'], delivery_paid_by: 'buyer' })
    const res = await farmerEdit({ delivery_mode: 'pickup', courier_type: null, cargo_services: [], delivery_paid_by: null })
    expect(res.status).toBe(200)
    expect(listing()).toMatchObject({ courier_type: null, cargo_services: [], delivery_paid_by: null, retail_reach: 'local' })
  })
  it('cargo without a service is refused, nothing written', async () => {
    const res = await farmerEdit({ delivery_mode: 'courier', courier_type: 'cargo', cargo_services: [], delivery_paid_by: 'buyer' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/at least one cargo service/)
    expect(listing()).not.toHaveProperty('courier_type')
  })
  it('the error is in Telugu by default', async () => {
    const res = await farmerEdit({ delivery_mode: 'courier', courier_type: 'local' }, 'te')
    expect((await res.json()).error).toMatch(/[ఀ-౿]/)
  })
  it('an edit without delivery fields leaves them alone (regression)', async () => {
    Object.assign(listing(), { courier_type: 'cargo', cargo_services: ['VRL Logistics'], delivery_paid_by: 'buyer' })
    await farmerEdit({ stock_qty: 20 })
    expect(listing()).toMatchObject({ courier_type: 'cargo', cargo_services: ['VRL Logistics'] })
  })
  it('moderator create: cargo saved the same way', async () => {
    const res = await moderatorCreate(req('/api/moderator/listings', createBody({
      delivery_mode: 'courier', courier_type: 'cargo', cargo_services: ['APSRTC Cargo'], delivery_paid_by: 'farmer', delivery_charge: '99',
    })))
    expect(res.status).toBe(200)
    const row = db.writes.find((w) => w.table === 'produce_listings' && w.kind === 'insert')?.row
    expect(row).toMatchObject({ courier_type: 'cargo', cargo_services: ['APSRTC Cargo'], delivery_paid_by: 'farmer', delivery_charge: 0, retail_reach: 'transport' })
  })
  it('moderator create: local without "who pays" is refused', async () => {
    const res = await moderatorCreate(req('/api/moderator/listings', createBody({ delivery_mode: 'courier', courier_type: 'local' })))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Who pays/)
  })
})

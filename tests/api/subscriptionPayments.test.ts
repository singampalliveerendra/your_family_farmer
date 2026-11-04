import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Phase 4 end to end against an in-memory Supabase and a fake Cashfree:
// starting a plan (₹0 and paid), verifying the payment, the shared webhook
// routing "gs_" orders to subscriptions, settling exactly once, the
// moderator's hide / restore after 10 days, and the 3-day reminder.

type Row = Record<string, unknown>
const AGG = '11111111-1111-4111-8111-111111111111'
const OTHER_AGG = '44444444-4444-4444-8444-444444444444'
const FARMER = '22222222-2222-4222-8222-222222222222'
const PLAN_ID = '33333333-3333-4333-8333-333333333333'
const MOD = '99999999-9999-4999-8999-999999999999'
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

const db = { tables: {} as Record<string, Row[]>, seq: 0 }

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let updateSet: Row | null = null
  let insertRows: Row[] | null = null
  let single = false
  let selected = false
  const run = () => {
    const rows = (db.tables[table] ??= [])
    if (insertRows) {
      const made = insertRows.map((r) => {
        db.seq += 1
        const row = { id: `00000000-0000-4000-8000-${String(db.seq).padStart(12, '0')}`, created_at: new Date().toISOString(), status: 'active', ...r }
        rows.push(row)
        return { ...row }
      })
      return { data: single ? made[0] : made, error: null }
    }
    const hit = rows.filter((r) => filters.every((f) => f(r)))
    if (updateSet) {
      for (const r of hit) Object.assign(r, updateSet)
      const out = hit.map((r) => ({ ...r }))
      return { data: single ? out[0] ?? null : selected ? out : null, error: null }
    }
    return { data: single ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r })), error: null }
  }
  const b: Record<string, unknown> = {
    select: () => { selected = true; return b },
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b },
    neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return b },
    in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b },
    is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b },
    not: (c: string, _op: string, v: unknown) => { filters.push((r) => (r[c] ?? null) !== v); return b },
    lt: (c: string, v: string) => { filters.push((r) => String(r[c]) < v); return b },
    gt: (c: string, v: string) => { filters.push((r) => r[c] != null && String(r[c]) > v); return b },
    lte: (c: string, v: string) => { filters.push((r) => r[c] != null && String(r[c]) <= v); return b },
    order: () => b,
    limit: () => b,
    update: (s: Row) => { updateSet = s; return b },
    insert: (r: Row | Row[]) => { insertRows = Array.isArray(r) ? r : [r]; return b },
    maybeSingle: () => { single = true; return b },
    single: () => { single = true; return b },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  }
  return b
}
const client = { from: (t: string) => query(t) }
vi.mock('@supabase/supabase-js', () => ({ createClient: () => client }))

let session: string | null = AGG
vi.mock('@/lib/farmer-session', () => ({ getFarmerSessionFromRequest: () => (session ? { farmerId: session, issuedAt: 0 } : null) }))
let moderator = true
vi.mock('@/lib/moderator-session', () => ({ isModeratorRequest: () => moderator, getModeratorId: () => MOD }))

const cf = {
  createFails: false,
  created: [] as Array<{ orderId: string; amountRupees: number; customerPhone: string }>,
  settled: new Map<string, { paid: true; paymentId: string; label: string | null } | { paid: false; orderStatus: string; inFlight: boolean }>(),
}
vi.mock('@/lib/cashfree', () => ({
  cashfreeMode: () => 'sandbox',
  createCashfreeOrder: async (a: { orderId: string; amountRupees: number; customerPhone: string }) => {
    if (cf.createFails) throw new Error('down')
    cf.created.push(a)
    return { order_id: a.orderId, order_amount: a.amountRupees, order_status: 'ACTIVE', payment_session_id: `sess_${a.orderId}` }
  },
  getSettlement: async (id: string) => cf.settled.get(id) ?? { paid: false, orderStatus: 'ACTIVE', inFlight: false },
  verifyWebhookSignature: () => true,
}))
const markCashfreePaid = vi.fn(async () => null)
vi.mock('@/lib/cashfree-settle', () => ({ markCashfreePaid: (...a: unknown[]) => markCashfreePaid(...(a as [])) }))
const queueAndSend = vi.fn(async () => {})
vi.mock('@/lib/notify', () => ({ queueAndSend: (...a: unknown[]) => queueAndSend(...(a as [])) }))

const start = await import('@/app/api/aggregator/subscription/start/route')
const verify = await import('@/app/api/aggregator/subscription/verify/route')
const mine = await import('@/app/api/aggregator/subscription/route')
const webhook = await import('@/app/api/orders/cashfree/webhook/route')
const listings = await import('@/app/api/moderator/aggregator-subscriptions/listings/route')
const { settleSubscriptionPayment } = await import('@/lib/subscriptionSettle')
const { sendSubscriptionReminders } = await import('@/lib/subscriptionReminders')
const cron = await import('@/app/api/cron/subscription-reminders/route')

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
const subs = () => db.tables.aggregator_subscriptions
const PLAN = (x: Row = {}) => ({
  id: PLAN_ID, kind: 'buying', name_en: 'Bulk Buyer', duration_days: 30, actual_price: 999,
  offer_enabled: true, offer_price: 599, offer_ends_at: day(10), active: true, sort_order: 0, ...x,
})

beforeEach(() => {
  session = AGG
  moderator = true
  cf.createFails = false
  cf.created = []
  cf.settled.clear()
  markCashfreePaid.mockClear()
  queueAndSend.mockClear()
  delete process.env.SUBSCRIPTION_REMINDER_WHATSAPP
  db.seq = 0
  db.tables = {
    farmers: [
      { id: AGG, name: 'GoDhan', phone: '9000000001', account_type: 'aggregator' },
      { id: OTHER_AGG, name: 'Other', phone: '9000000003', account_type: 'aggregator' },
      { id: FARMER, name: 'Ravi', phone: '9000000002', account_type: 'farmer' },
    ],
    subscription_plans: [PLAN()],
    aggregator_subscriptions: [],
    produce_listings: [],
    subscription_listing_holds: [],
  }
})

describe('start a plan', () => {
  it('needs an aggregator login (a farmer is refused — farmers are free)', async () => {
    session = FARMER
    expect((await start.POST(post({ planId: PLAN_ID }))).status).toBe(401)
    session = null
    expect((await start.POST(post({ planId: PLAN_ID }))).status).toBe(401)
    expect(subs()).toHaveLength(0)
  })

  it('paid plan: a pending row at the OFFER price, a Cashfree order, nothing active yet', async () => {
    const res = await start.POST(post({ planId: PLAN_ID, startMode: 'now' }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j).toMatchObject({ ok: true, free: false, mode: 'sandbox', amount: 599 })
    expect(j.cashfreeOrderId).toMatch(/^gs_/)
    expect(j.paymentSessionId).toBe(`sess_${j.cashfreeOrderId}`)
    expect(subs()[0]).toMatchObject({ source: 'payment', status: 'pending', amount_paid: 599, price_actual: 999, duration_days: 30, cashfree_order_id: j.cashfreeOrderId })
    expect(cf.created[0]).toMatchObject({ amountRupees: 599, customerPhone: '9000000001' })
  })

  it('the browser cannot set the price', async () => {
    await start.POST(post({ planId: PLAN_ID, amount: 1, price: 1 }))
    expect(cf.created[0].amountRupees).toBe(599)
  })

  it('an offer that has ended is charged at the actual price', async () => {
    db.tables.subscription_plans = [PLAN({ offer_ends_at: day(-1) })]
    await start.POST(post({ planId: PLAN_ID }))
    expect(cf.created[0].amountRupees).toBe(999)
  })

  it('₹0 plan: active at once, with a receipt, no Cashfree', async () => {
    db.tables.subscription_plans = [PLAN({ actual_price: 0, offer_enabled: false, offer_price: null })]
    const j = await (await start.POST(post({ planId: PLAN_ID }))).json()
    expect(j).toMatchObject({ ok: true, free: true })
    expect(subs()[0]).toMatchObject({ source: 'free_plan', status: 'active', amount_paid: 0 })
    expect(subs()[0].receipt_no).toMatch(/^GGS-\d{8}-[0-9A-F]{6}$/)
    expect(cf.created).toHaveLength(0)
  })

  it('Cashfree down → the row is cancelled and the aggregator told to retry', async () => {
    cf.createFails = true
    const res = await start.POST(post({ planId: PLAN_ID }))
    expect(res.status).toBe(502)
    expect(subs()[0].status).toBe('cancelled')
  })

  it.each([
    [{ planId: 'nope' }, 400],
    [{ planId: '55555555-5555-4555-8555-555555555555' }, 404],
  ])('refuses %o', async (body, status) => {
    expect((await start.POST(post(body))).status).toBe(status)
  })

  it('a hidden plan cannot be bought', async () => {
    db.tables.subscription_plans = [PLAN({ active: false })]
    expect((await start.POST(post({ planId: PLAN_ID }))).status).toBe(400)
  })

  it('free forever already → nothing to buy', async () => {
    subs().push({ id: 'f', aggregator_id: AGG, kind: 'combined', source: 'free_forever', status: 'active', starts_at: day(-30), ends_at: null })
    const res = await start.POST(post({ planId: PLAN_ID }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/free, forever/)
  })

  it('"after_current" keeps the days already paid for', async () => {
    subs().push({ id: 'c', aggregator_id: AGG, kind: 'buying', source: 'payment', status: 'active', starts_at: day(-20), ends_at: day(10) })
    await start.POST(post({ planId: PLAN_ID, startMode: 'after_current' }))
    const row = subs().find((r) => r.status === 'pending')!
    expect(row.start_mode).toBe('after_current')
    expect(String(row.starts_at).slice(0, 16)).toBe(day(10).slice(0, 16))
  })
})

describe('verify + settle', () => {
  const begin = async () => (await (await start.POST(post({ planId: PLAN_ID }))).json()).cashfreeOrderId as string

  it('not paid yet → paid:false, the plan stays pending', async () => {
    const id = await begin()
    cf.settled.set(id, { paid: false, orderStatus: 'ACTIVE', inFlight: true })
    const j = await (await verify.POST(post({ cashfreeOrderId: id }))).json()
    expect(j).toEqual({ ok: false, paid: false, pending: true, orderStatus: 'ACTIVE' })
    expect(subs()[0].status).toBe('pending')
  })

  it('paid in full → active, dates from now, receipt, payment details', async () => {
    const id = await begin()
    cf.settled.set(id, { paid: true, paymentId: 'pay_1', label: 'UPI · PhonePe' })
    const j = await (await verify.POST(post({ cashfreeOrderId: id }))).json()
    expect(j).toMatchObject({ ok: true, paid: true, paymentId: 'pay_1' })
    expect(subs()[0]).toMatchObject({ status: 'active', payment_ref: 'pay_1', payment_label: 'UPI · PhonePe' })
    expect(subs()[0].receipt_no).toMatch(/^GGS-/)
    const span = (new Date(subs()[0].ends_at as string).getTime() - new Date(subs()[0].starts_at as string).getTime()) / 86_400_000
    expect(span).toBe(30)
  })

  it('another aggregator cannot verify (or even see) my payment', async () => {
    const id = await begin()
    session = OTHER_AGG
    expect((await verify.POST(post({ cashfreeOrderId: id }))).status).toBe(404)
  })

  it('a shop order id is refused here', async () => {
    expect((await verify.POST(post({ cashfreeOrderId: 'gg_3f2a9c10111142228333444455556666_abc' }))).status).toBe(400)
  })

  it('settles exactly once, however many paths arrive', async () => {
    const id = await begin()
    const a = await settleSubscriptionPayment(client as never, { cashfreeOrderId: id, paymentId: 'p', label: null })
    const b = await settleSubscriptionPayment(client as never, { cashfreeOrderId: id, paymentId: 'p2', label: null })
    expect(a).toMatchObject({ ok: true, alreadyActive: false })
    expect(b).toMatchObject({ ok: true, alreadyActive: true })
    expect(subs()[0].payment_ref).toBe('p')
  })

  it('a cancelled attempt is never activated', async () => {
    const id = await begin()
    subs()[0].status = 'cancelled'
    expect(await settleSubscriptionPayment(client as never, { cashfreeOrderId: id, paymentId: 'p', label: null })).toMatchObject({ ok: false })
  })

  it('my screen lists my rows only', async () => {
    await begin()
    subs().push({ id: 'x', aggregator_id: OTHER_AGG, kind: 'buying', source: 'manual', status: 'active', starts_at: day(-1), ends_at: day(5) })
    const j = await (await mine.GET(new NextRequest('http://localhost/x'))).json()
    expect(j.subscriptions.map((s: Row) => s.aggregator_id)).toEqual([AGG])
    expect(j.plans).toHaveLength(1)
  })
})

describe('shared Cashfree webhook', () => {
  const event = (orderId: string, type = 'PAYMENT_SUCCESS_WEBHOOK') =>
    new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ type, data: { order: { order_id: orderId } } }) })

  it('a "gs_" payment activates the plan and never touches shop orders', async () => {
    const id = (await (await start.POST(post({ planId: PLAN_ID }))).json()).cashfreeOrderId as string
    cf.settled.set(id, { paid: true, paymentId: 'pay_w', label: null })
    expect((await webhook.POST(event(id))).status).toBe(200)
    expect(subs()[0].status).toBe('active')
    expect(markCashfreePaid).not.toHaveBeenCalled()
  })

  it('a failed "gs_" attempt leaves the plan pending (they can retry)', async () => {
    const id = (await (await start.POST(post({ planId: PLAN_ID }))).json()).cashfreeOrderId as string
    await webhook.POST(event(id, 'PAYMENT_FAILED_WEBHOOK'))
    expect(subs()[0].status).toBe('pending')
  })

  it('shop orders ("gg_") still go the old way', async () => {
    const gg = 'gg_3f2a9c10111142228333444455556666_abc'
    cf.settled.set(gg, { paid: true, paymentId: 'pay_o', label: null })
    await webhook.POST(event(gg))
    expect(markCashfreePaid).toHaveBeenCalledTimes(1)
  })
})

describe('moderator: hide / restore listings after 10 days', () => {
  beforeEach(() => {
    db.tables.produce_listings = [
      { id: 'l1', farmer_id: AGG, status: 'available' },
      { id: 'l2', farmer_id: AGG, status: 'sold_out' },
      { id: 'l3', farmer_id: AGG, status: 'paused' }, // already off the shelf
      { id: 'l4', farmer_id: FARMER, status: 'available' }, // someone else
    ]
  })
  const act = (action: string, aggregatorId = AGG) => listings.POST(post({ aggregatorId, action }))

  it('refused before the 10 days are up', async () => {
    subs().push({ id: 's', aggregator_id: AGG, kind: 'selling', source: 'payment', status: 'active', starts_at: day(-40), ends_at: day(-9) })
    const res = await act('hide')
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/10 days/)
    expect(db.tables.produce_listings[0].status).toBe('available')
  })

  it('from day 10: visible listings hidden, each remembering its status', async () => {
    subs().push({ id: 's', aggregator_id: AGG, kind: 'selling', source: 'payment', status: 'active', starts_at: day(-40), ends_at: day(-10) })
    const j = await (await act('hide')).json()
    expect(j).toEqual({ ok: true, hidden: 2 })
    expect(db.tables.produce_listings.map((l) => l.status)).toEqual(['suspended', 'suspended', 'paused', 'available'])
    expect(db.tables.subscription_listing_holds.map((h) => [h.listing_id, h.previous_status, h.held_by])).toEqual([['l1', 'available', MOD], ['l2', 'sold_out', MOD]])
  })

  it('restore puts back exactly what was there — but not a listing changed since', async () => {
    subs().push({ id: 's', aggregator_id: AGG, kind: 'selling', source: 'payment', status: 'active', starts_at: day(-40), ends_at: day(-10) })
    await act('hide')
    db.tables.produce_listings[1].status = 'paused' // the aggregator paused l2 meanwhile
    expect(await (await act('restore')).json()).toEqual({ ok: true, restored: 1 })
    expect(db.tables.produce_listings.map((l) => l.status)).toEqual(['available', 'paused', 'paused', 'available'])
    expect(db.tables.subscription_listing_holds.every((h) => h.released_at)).toBe(true)
  })

  it('paying for selling again brings the listings back by itself', async () => {
    subs().push({ id: 's', aggregator_id: AGG, kind: 'selling', source: 'payment', status: 'active', starts_at: day(-40), ends_at: day(-10) })
    await act('hide')
    db.tables.subscription_plans = [PLAN({ kind: 'selling' })]
    const id = (await (await start.POST(post({ planId: PLAN_ID }))).json()).cashfreeOrderId as string
    await settleSubscriptionPayment(client as never, { cashfreeOrderId: id, paymentId: 'p', label: null })
    expect(db.tables.produce_listings.slice(0, 2).map((l) => l.status)).toEqual(['available', 'sold_out'])
  })

  it('free forever / still selling / farmers → never hidden', async () => {
    subs().push({ id: 'f', aggregator_id: AGG, kind: 'combined', source: 'free_forever', status: 'active', starts_at: day(-40), ends_at: null })
    expect((await act('hide')).status).toBe(409)
    expect((await act('hide', FARMER)).status).toBe(404)
  })

  it('needs a moderator, and a real action', async () => {
    moderator = false
    expect((await act('hide')).status).toBe(401)
    moderator = true
    expect((await act('delete')).status).toBe(400)
    expect((await act('hide', 'x')).status).toBe(400)
  })
})

describe('3-day reminder', () => {
  beforeEach(() => {
    subs().push(
      { id: 'a', aggregator_id: AGG, kind: 'buying', source: 'payment', status: 'active', starts_at: day(-28), ends_at: day(2), plan_name: 'Bulk Buyer' },
      { id: 'b', aggregator_id: OTHER_AGG, kind: 'buying', source: 'payment', status: 'active', starts_at: day(-28), ends_at: day(2) },
      { id: 'b2', aggregator_id: OTHER_AGG, kind: 'buying', source: 'payment', status: 'active', starts_at: day(2), ends_at: day(32) }, // renewed
    )
  })

  it('finds who is due; sends nothing until the template is approved', async () => {
    expect(await sendSubscriptionReminders(client as never, { send: queueAndSend as never })).toEqual({ due: ['a'], sent: 0 })
    expect(queueAndSend).not.toHaveBeenCalled()
  })

  it('switched on: one WhatsApp per plan, deduped', async () => {
    process.env.SUBSCRIPTION_REMINDER_WHATSAPP = '1'
    expect(await sendSubscriptionReminders(client as never, { send: queueAndSend as never })).toEqual({ due: ['a'], sent: 1 })
    const call = queueAndSend.mock.calls[0] as unknown as [unknown, Row]
    expect(call[1]).toMatchObject({ phone: '9000000001', event: 'aggregator_subscription_expiring', dedupeKey: 'sub_expiring:a' })
    expect((call[1].body as string[])[0]).toBe('Bulk Buyer')
  })

  it('cron needs CRON_SECRET', async () => {
    delete process.env.CRON_SECRET
    expect((await cron.GET(new NextRequest('http://localhost/x'))).status).toBe(500)
    process.env.CRON_SECRET = 's3'
    expect((await cron.GET(new NextRequest('http://localhost/x'))).status).toBe(401)
    expect((await cron.GET(new NextRequest('http://localhost/x', { headers: { authorization: 'Bearer s3' } }))).status).toBe(200)
    delete process.env.CRON_SECRET
  })
})

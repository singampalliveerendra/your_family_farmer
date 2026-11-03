import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// alertWholesaleLowStock against an in-memory Supabase: which produce it
// alerts on, to whom, how often, and that it never throws.

vi.mock('@/lib/notify', () => ({ queueAndSend: vi.fn() }))

const { alertWholesaleLowStock, lowStockDedupeKey, lowStockWhatsAppEnabled, scheduleWholesaleLowStockCheck } =
  await import('@/lib/wholesaleLowStockAlert')

type Row = Record<string, unknown>
const db = { listings: [] as Row[], harvests: [] as Row[], farmers: [] as Row[], failListings: false, throwOn: '' }

function fake(): SupabaseClient {
  const from = (table: string) => {
    if (db.throwOn === table) throw new Error('boom')
    const filters: Array<(r: Row) => boolean> = []
    let single = false
    const rows = () => (table === 'produce_listings' ? db.listings : table === 'harvests' ? db.harvests : table === 'farmers' ? db.farmers : [])
    const run = () => {
      if (table === 'produce_listings' && db.failListings) return { data: null, error: { message: 'down' } }
      const hit = rows().filter((r) => filters.every((f) => f(r)))
      return { data: single ? hit[0] ?? null : hit, error: null }
    }
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b },
      maybeSingle: () => { single = true; return b },
      then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
    }
    return b
  }
  return { from } as unknown as SupabaseClient
}

const send = vi.fn()
const NOW = new Date('2026-11-03T10:00:00Z')

beforeEach(() => {
  send.mockReset()
  process.env.WHOLESALE_LOW_STOCK_WHATSAPP = '1'
  db.failListings = false
  db.throwOn = ''
  db.farmers = [{ id: 'f1', phone: '9876543210' }]
  db.listings = [
    { id: 'L1', farmer_id: 'f1', name: 'Tomato', unit: 'kg', stock_qty: null, sale_mode: 'both', wholesale_min_qty: 100, wholesale_pack_size: 25 },
    { id: 'L2', farmer_id: 'f1', name: 'Rice', unit: 'kg', stock_qty: null, sale_mode: 'retail', wholesale_min_qty: null },
  ]
  // State AFTER the order: 110 → 80 on h1.
  db.harvests = [
    { id: 'h1', produce_listing_id: 'L1', stock_qty: 80, paused: false },
    { id: 'h9', produce_listing_id: 'L1', stock_qty: 500, paused: true }, // paused: never counts
    { id: 'h2', produce_listing_id: 'L2', stock_qty: 1, paused: false },
  ]
})
afterEach(() => { delete process.env.WHOLESALE_LOW_STOCK_WHATSAPP })

describe('alertWholesaleLowStock', () => {
  it('alerts the farmer when the order crossed below the minimum', async () => {
    const out = await alertWholesaleLowStock(fake(), [{ listingId: 'L1', harvestId: 'h1', qty: 30 }], { now: NOW, send })
    expect(out).toEqual(['L1'])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][1]).toEqual({
      phone: '9876543210',
      event: 'farmer_wholesale_low_stock',
      lang: 'en',
      body: ['Tomato', '80 kg', '100 kg'],
      dedupeKey: 'wholesale_low_stock:L1:2026-11-03',
    })
  })

  it('no alert when it was already below before this order', async () => {
    db.harvests[0].stock_qty = 50 // 60 → 50
    expect(await alertWholesaleLowStock(fake(), [{ listingId: 'L1', harvestId: 'h1', qty: 10 }], { now: NOW, send })).toEqual([])
    expect(send).not.toHaveBeenCalled()
  })

  it('no alert while still at or above the minimum', async () => {
    db.harvests[0].stock_qty = 100
    expect(await alertWholesaleLowStock(fake(), [{ listingId: 'L1', harvestId: 'h1', qty: 5 }], { now: NOW, send })).toEqual([])
  })

  it('a paused harvest does not keep it listed', async () => {
    // h9 has 500 but is paused — L1 is still low after the order.
    expect(await alertWholesaleLowStock(fake(), [{ listingId: 'L1', harvestId: 'h1', qty: 30 }], { now: NOW, send })).toEqual(['L1'])
  })

  it('retail produce is never checked', async () => {
    expect(await alertWholesaleLowStock(fake(), [{ listingId: 'L2', harvestId: 'h2', qty: 500 }], { now: NOW, send })).toEqual([])
    expect(send).not.toHaveBeenCalled()
  })

  it('legacy order on the produce itself (no harvest)', async () => {
    db.harvests = []
    db.listings[0].stock_qty = 80
    expect(await alertWholesaleLowStock(fake(), [{ listingId: 'L1', qty: 30 }], { now: NOW, send })).toEqual(['L1'])
  })

  it('switched off → finds it but sends nothing', async () => {
    delete process.env.WHOLESALE_LOW_STOCK_WHATSAPP
    expect(await alertWholesaleLowStock(fake(), [{ listingId: 'L1', harvestId: 'h1', qty: 30 }], { now: NOW, send })).toEqual(['L1'])
    expect(send).not.toHaveBeenCalled()
  })

  it('several produce in one order: only the one that crossed', async () => {
    db.listings.push({ id: 'L3', farmer_id: 'f1', name: 'Onion', unit: 'kg', stock_qty: null, sale_mode: 'wholesale', wholesale_min_qty: 50 })
    db.harvests.push({ id: 'h3', produce_listing_id: 'L3', stock_qty: 200, paused: false })
    const out = await alertWholesaleLowStock(fake(), [
      { listingId: 'L1', harvestId: 'h1', qty: 30 },
      { listingId: 'L3', harvestId: 'h3', qty: 10 },
    ], { now: NOW, send })
    expect(out).toEqual(['L1'])
  })

  it('nothing to check → no database work', async () => {
    db.throwOn = 'produce_listings'
    expect(await alertWholesaleLowStock(fake(), [], { send })).toEqual([])
    expect(await alertWholesaleLowStock(fake(), [{ listingId: 'L1', qty: 0 }], { send })).toEqual([])
  })

  it('a failed read is quiet', async () => {
    db.failListings = true
    expect(await alertWholesaleLowStock(fake(), [{ listingId: 'L1', harvestId: 'h1', qty: 30 }], { send })).toEqual([])
  })

  it('never throws, even when the database client does', async () => {
    db.throwOn = 'harvests'
    await expect(alertWholesaleLowStock(fake(), [{ listingId: 'L1', harvestId: 'h1', qty: 30 }], { send })).resolves.toEqual([])
  })

  it('a farmer with no phone is still handled (queue skips it)', async () => {
    db.farmers = []
    expect(await alertWholesaleLowStock(fake(), [{ listingId: 'L1', harvestId: 'h1', qty: 30 }], { now: NOW, send })).toEqual(['L1'])
    expect(send.mock.calls[0][1].phone).toBeUndefined()
  })

  it('a server without the wholesale columns: rows read as retail, nothing happens', async () => {
    for (const l of db.listings) { delete l.sale_mode; delete l.wholesale_min_qty }
    expect(await alertWholesaleLowStock(fake(), [{ listingId: 'L1', harvestId: 'h1', qty: 30 }], { send })).toEqual([])
  })
})

describe('lowStockDedupeKey / switch', () => {
  it('one key per produce per day', () => {
    expect(lowStockDedupeKey('L1', new Date('2026-11-03T23:59:00Z'))).toBe('wholesale_low_stock:L1:2026-11-03')
    expect(lowStockDedupeKey('L1', new Date('2026-11-04T00:00:01Z'))).toBe('wholesale_low_stock:L1:2026-11-04')
    expect(lowStockDedupeKey('L2', NOW)).not.toBe(lowStockDedupeKey('L1', NOW))
  })
  it('WhatsApp sending is off unless set to exactly 1', () => {
    process.env.WHOLESALE_LOW_STOCK_WHATSAPP = 'true'
    expect(lowStockWhatsAppEnabled()).toBe(false)
    process.env.WHOLESALE_LOW_STOCK_WHATSAPP = '1'
    expect(lowStockWhatsAppEnabled()).toBe(true)
  })
  it('schedule does nothing (not even after()) when no stock moved', () => {
    expect(() => scheduleWholesaleLowStockCheck(fake(), [])).not.toThrow()
    expect(() => scheduleWholesaleLowStockCheck(fake(), [{ listingId: 'L1', qty: 0 }])).not.toThrow()
  })
})

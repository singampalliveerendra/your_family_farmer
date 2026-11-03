import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const notified: string[][] = []
vi.mock('@/lib/orderNotify', () => ({
  notifyOrdersPlaced: (_s: unknown, ids: string[]) => { notified.push(ids) },
}))

import { ABANDON_REASON, markCashfreePaid, reviveAbandonedOrders } from '@/lib/cashfree-settle'

type Row = Record<string, unknown>

// Just enough of the Supabase query builder for cashfree-settle: select /
// update with eq / neq / not-in filters, and the two stock RPCs. Rows live in
// memory so the test can look at what really changed.
function fakeDb(orders: Row[], stock: Record<string, number>) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const from = () => {
    let patch: Row | null = null
    const filters: Array<(r: Row) => boolean> = []
    const run = () => {
      const hit = orders.filter((r) => filters.every((f) => f(r)))
      if (patch) for (const r of hit) Object.assign(r, patch)
      return { data: hit.map((r) => ({ ...r })), error: null }
    }
    const q = {
      select: () => q,
      update: (p: Row) => { patch = p; return q },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return q },
      not: (c: string, _op: string, list: string) => {
        const vals = list.replace(/[()"]/g, '').split(',')
        filters.push((r) => !vals.includes(String(r[c])))
        return q
      },
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    }
    return q
  }
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args })
    const id = String(args.p_harvest_id ?? args.p_listing_id)
    const qty = Number(args.p_qty)
    if ((stock[id] ?? 0) < qty) return { data: false, error: null }
    stock[id] -= qty
    return { data: true, error: null }
  }
  return { db: { from, rpc } as unknown as SupabaseClient, rpcCalls }
}

const abandoned = (over: Row = {}): Row => ({
  id: 'o1',
  cashfree_order_id: 'gg_1',
  status: 'cancelled',
  decline_reason: ABANDON_REASON,
  acknowledged_at: null,
  payment_status: 'pending',
  payment_method: 'cashfree',
  quantity: 1,
  harvest_id: 'h1',
  produce_listing_id: 'l1',
  ...over,
})

beforeEach(() => { notified.length = 0 })

describe('reviveAbandonedOrders', () => {
  // USE: YFF-20261029-0383 — abandon cancelled it and put 1 kg back; then the
  // UPI payment landed. The order must come back and the 1 kg go out again.
  it('puts an abandoned order back to pending and re-reserves its stock', async () => {
    const rows = [abandoned()]
    const stock = { h1: 5 }
    const { db } = fakeDb(rows, stock)
    expect(await reviveAbandonedOrders(db, 'gg_1')).toEqual(['o1'])
    expect(rows[0]).toMatchObject({ status: 'pending', decline_reason: null, acknowledged_at: null })
    expect(stock.h1).toBe(4)
  })

  // USE: the farmer already tapped "Acknowledge" on the cancelled card — it
  // must reappear on their list, which filters on acknowledged_at.
  it('clears the farmer acknowledgement', async () => {
    const rows = [abandoned({ acknowledged_at: '2026-10-30T00:00:00Z' })]
    const { db } = fakeDb(rows, { h1: 5 })
    await reviveAbandonedOrders(db, 'gg_1')
    expect(rows[0].acknowledged_at).toBeNull()
  })

  // USE: a buyer's own cancel or a farmer decline is a decision, not a payment
  // glitch — a payment arriving must never undo it.
  it('leaves orders cancelled for any other reason alone', async () => {
    const rows = [abandoned({ decline_reason: 'Changed my mind' }), abandoned({ id: 'o2', status: 'declined' })]
    const stock = { h1: 5 }
    const { db, rpcCalls } = fakeDb(rows, stock)
    expect(await reviveAbandonedOrders(db, 'gg_1')).toEqual([])
    expect(rows[0].status).toBe('cancelled')
    expect(rows[1].status).toBe('declined')
    expect(rpcCalls).toEqual([])
  })

  // USE: webhook, /verify and the cron can all run for one payment. The second
  // run must not take the stock out twice.
  it('revives and takes stock only once when run twice', async () => {
    const rows = [abandoned()]
    const stock = { h1: 5 }
    const { db } = fakeDb(rows, stock)
    await reviveAbandonedOrders(db, 'gg_1')
    expect(await reviveAbandonedOrders(db, 'gg_1')).toEqual([])
    expect(stock.h1).toBe(4)
  })

  // USE: someone bought the released stock meanwhile. The buyer still paid,
  // so the order comes back anyway; the farmer can decline (which refunds).
  it('still revives when the stock has run out', async () => {
    const rows = [abandoned({ quantity: 3 })]
    const stock = { h1: 1 }
    const { db } = fakeDb(rows, stock)
    expect(await reviveAbandonedOrders(db, 'gg_1')).toEqual(['o1'])
    expect(rows[0].status).toBe('pending')
    expect(stock.h1).toBe(1)
  })

  // USE: legacy rows with no harvest take stock from the listing.
  it('uses the listing stock for an order with no harvest', async () => {
    const rows = [abandoned({ harvest_id: null })]
    const { db, rpcCalls } = fakeDb(rows, { l1: 2 })
    await reviveAbandonedOrders(db, 'gg_1')
    expect(rpcCalls).toEqual([{ fn: 'decrement_stock', args: { p_listing_id: 'l1', p_qty: 1 } }])
  })
})

describe('markCashfreePaid', () => {
  // USE: the whole late-payment path in one go — the order is back, marked
  // paid, and the farmer finally gets the new-order alert.
  it('revives, marks paid and notifies an abandoned-then-paid order', async () => {
    const rows = [abandoned()]
    const { db } = fakeDb(rows, { h1: 5 })
    expect(await markCashfreePaid(db, { cashfreeOrderId: 'gg_1', paymentId: '6862236548', label: 'PhonePe' })).toBeNull()
    expect(rows[0]).toMatchObject({ status: 'pending', payment_status: 'paid', cashfree_payment_id: '6862236548' })
    expect(notified).toEqual([['o1']])
  })

  // USE: the webhook had already recorded the money on the cancelled row (the
  // exact state of YFF-20261029-0383). A later run must still revive it.
  it('revives a row that was already marked paid but left cancelled', async () => {
    const rows = [abandoned({ payment_status: 'paid' })]
    const { db } = fakeDb(rows, { h1: 5 })
    await markCashfreePaid(db, { cashfreeOrderId: 'gg_1', paymentId: '1', label: null })
    expect(rows[0].status).toBe('pending')
    expect(notified).toEqual([['o1']])
  })
})

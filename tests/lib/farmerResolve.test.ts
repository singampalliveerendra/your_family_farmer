import { describe, it, expect } from 'vitest'
import {
  attachFarmerResolved,
  canFarmerResolve,
  cleanResolveNote,
  closingColumn,
  farmerResolveBlock,
  farmerResolveUpdate,
  isMissingResolveColumn,
  isOrderClosed,
  RESOLVE_NOTE_MAX,
} from '@/lib/farmerResolve'
import { isResolved as farmerIsResolved, type FarmerOrder } from '@/components/farmer/OrderCard'
import { isResolved as buyerIsResolved, type ConsumerOrder } from '@/components/consumer/OrderCard'
import { isOrderCompleted } from '@/lib/orderFeedback'
import { orderBucket } from '@/lib/orderSearch'
import type { SupabaseClient } from '@supabase/supabase-js'

const NOW = '2026-10-15T10:00:00.000Z'

const approved = (o: Record<string, unknown> = {}) => ({ status: 'approved', delivery_type: 'self_pickup', ...o })

describe('farmerResolveBlock — which orders the farmer may close', () => {
  // USE: the whole point — an approved pickup, courier or farmer delivery that
  // the buyer never confirmed can be closed by the farmer.
  it.each([
    ['self-pickup', approved()],
    ['courier, shipped', approved({ delivery_type: 'courier', shipped_at: NOW })],
    ['courier, not yet shipped', approved({ delivery_type: 'courier' })],
    ['farmer home delivery, shipped', approved({ delivery_type: 'home_delivery', delivery_status: 'unassigned', shipped_at: NOW })],
    ['farmer home delivery, no delivery_status', approved({ delivery_type: 'home_delivery', delivery_status: null })],
    ['legacy order with no delivery_type', approved({ delivery_type: null })],
  ])('allows %s', (_label, o) => {
    expect(farmerResolveBlock(o)).toBeNull()
    expect(canFarmerResolve(o)).toBe(true)
  })

  it('refuses a pending order — approve or decline it first', () => {
    expect(farmerResolveBlock({ status: 'pending' })?.error).toMatch(/Approve this order first/)
  })

  it.each(['declined', 'cancelled'])('refuses a %s order', (status) => {
    expect(farmerResolveBlock({ status })?.status).toBe(409)
  })

  it('refuses an unknown status', () => {
    expect(farmerResolveBlock({ status: 'weird' })).not.toBeNull()
  })

  // USE: no double close — the buyer's code (or the rider) already finished it.
  it.each([
    ['collected', approved({ collected_at: NOW })],
    ['received', approved({ delivery_type: 'courier', received_at: NOW })],
    ['rider delivered', approved({ delivery_type: 'home_delivery', delivery_status: 'delivered' })],
  ])('refuses an order already %s', (_l, o) => {
    expect(farmerResolveBlock(o)?.error).toMatch(/already completed/)
  })

  // USE: a rider is mid-delivery; the farmer must not close it over them.
  it.each(['assigned', 'picked_up', 'out_for_delivery'])('refuses a rider order that is %s', (ds) => {
    expect(farmerResolveBlock(approved({ delivery_type: 'home_delivery', delivery_status: ds }))?.error)
      .toMatch(/delivery agent/)
  })
})

describe('closingColumn / farmerResolveUpdate — what gets stamped', () => {
  it('a pickup closes on collected_at', () => {
    expect(closingColumn(approved())).toBe('collected_at')
    expect(farmerResolveUpdate(approved(), NOW)).toEqual({ collected_at: NOW, farmer_resolved_at: NOW })
  })

  it('a shipped courier closes on received_at and keeps its shipped time', () => {
    const o = approved({ delivery_type: 'courier', shipped_at: '2026-10-14T09:00:00.000Z' })
    expect(farmerResolveUpdate(o, NOW)).toEqual({ received_at: NOW, farmer_resolved_at: NOW })
  })

  // USE: the tracker would otherwise show "Delivered" after an unreached "Shipped".
  it('an unshipped delivery also gets shipped_at', () => {
    const o = approved({ delivery_type: 'home_delivery', delivery_status: 'unassigned' })
    expect(farmerResolveUpdate(o, NOW)).toEqual({ received_at: NOW, shipped_at: NOW, farmer_resolved_at: NOW })
  })
})

describe('a resolved order reads as completed everywhere', () => {
  // USE: the requirement "status updates correctly across both dashboards" —
  // every existing completed-check must agree once the update is applied.
  it.each([
    ['self_pickup', {}],
    ['courier', { shipped_at: NOW }],
    ['home_delivery', { delivery_status: 'unassigned' }],
  ])('%s', (deliveryType, extra) => {
    const before = { id: 'o1', status: 'approved' as const, delivery_type: deliveryType, created_at: NOW, ...extra }
    const after = { ...before, ...farmerResolveUpdate(before, NOW) }

    expect(farmerIsResolved(before as unknown as FarmerOrder)).toBe(false)
    expect(farmerIsResolved(after as unknown as FarmerOrder)).toBe(true)
    expect(buyerIsResolved(before as unknown as ConsumerOrder)).toBe(false)
    expect(buyerIsResolved(after as unknown as ConsumerOrder)).toBe(true)
    expect(isOrderCompleted(after)).toBe(true)
    expect(orderBucket(after)).toBe('completed')
    expect(isOrderClosed(after)).toBe(true)
    expect(canFarmerResolve(after)).toBe(false)
  })
})

describe('cleanResolveNote', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanResolveNote('  handed to   his\nbrother ')).toBe('handed to his brother')
  })
  it('caps the length', () => {
    expect(cleanResolveNote('x'.repeat(500))).toHaveLength(RESOLVE_NOTE_MAX)
  })
  it.each([undefined, null, 42, {}])('ignores a non-string (%s)', (v) => {
    expect(cleanResolveNote(v)).toBe('')
  })
})

describe('isMissingResolveColumn', () => {
  it('spots an undefined column', () => {
    expect(isMissingResolveColumn({ code: '42703', message: 'column orders.farmer_resolved_at does not exist' })).toBe(true)
    expect(isMissingResolveColumn({ code: 'PGRST204', message: "Could not find the 'farmer_resolved_at' column" })).toBe(true)
  })
  it('does not mistake other errors for it', () => {
    expect(isMissingResolveColumn({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isMissingResolveColumn(null)).toBe(false)
  })
})

describe('attachFarmerResolved', () => {
  const fake = (result: { data: unknown; error: unknown }) => ({
    from: () => ({ select: () => ({ in: async () => result }) }),
  }) as unknown as SupabaseClient

  it('merges the timestamp onto each order', async () => {
    const out = await attachFarmerResolved(
      fake({ data: [{ id: 'a', farmer_resolved_at: NOW }, { id: 'b', farmer_resolved_at: null }], error: null }),
      [{ id: 'a', x: 1 }, { id: 'b', x: 2 }],
    )
    expect(out).toEqual([{ id: 'a', x: 1, farmer_resolved_at: NOW }, { id: 'b', x: 2, farmer_resolved_at: null }])
  })

  // USE: before the migration runs, the order lists must keep working.
  it('returns the orders untouched when the column is missing', async () => {
    const orders = [{ id: 'a' }]
    const out = await attachFarmerResolved(fake({ data: null, error: { code: '42703', message: 'no column' } }), orders)
    expect(out).toEqual([{ id: 'a' }])
  })

  it('skips the read for an empty list', async () => {
    const supabase = { from: () => { throw new Error('should not query') } } as unknown as SupabaseClient
    expect(await attachFarmerResolved(supabase, [])).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { attachCargo } from '@/lib/orderType'

// The farmer's order card shows the cargo service the buyer picked (2026-11-10).
const fake = (result: { data: unknown; error: unknown }) =>
  ({ from: () => ({ select: () => ({ in: async () => result }) }) }) as unknown as SupabaseClient

describe('attachCargo', () => {
  const orders = [{ id: 'a' }, { id: 'b' }]
  it('adds the service and who pays to cargo orders only', async () => {
    const out = await attachCargo(fake({ data: [{ id: 'a', cargo_service: 'SRMT', cargo_paid_by: 'buyer' }, { id: 'b', cargo_service: null, cargo_paid_by: null }], error: null }), orders)
    expect(out).toEqual([{ id: 'a', cargo_service: 'SRMT', cargo_paid_by: 'buyer' }, { id: 'b' }])
  })
  it('before the migration (missing columns): orders unchanged', async () => {
    expect(await attachCargo(fake({ data: null, error: { message: 'column orders.cargo_service does not exist' } }), orders)).toEqual(orders)
  })
  it('no orders → no query', async () => {
    expect(await attachCargo(fake({ data: null, error: null }), [])).toEqual([])
  })
})

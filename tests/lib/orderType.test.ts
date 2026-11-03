import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { attachOrderType, isWholesaleOrder } from '@/lib/orderType'

// attachOrderType must add retail/wholesale when the column exists and leave
// the orders untouched (never empty, never throw) when it doesn't.

type Row = Record<string, unknown>
function fake(rows: Row[], mode: 'ok' | 'error' | 'throw' = 'ok') {
  const calls: string[] = []
  const client = {
    from: (t: string) => {
      if (mode === 'throw') throw new Error('boom')
      calls.push(t)
      const filters: Array<(r: Row) => boolean> = []
      const b: Record<string, unknown> = {
        select: () => b,
        in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b },
        then: (res: (v: unknown) => unknown) => Promise.resolve(mode === 'error'
          ? { data: null, error: { message: 'column orders.order_type does not exist' } }
          : { data: rows.filter((r) => filters.every((f) => f(r))), error: null }).then(res),
      }
      return b
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const DB = [
  { id: 'o1', order_type: 'wholesale' },
  { id: 'o2', order_type: 'retail' },
  { id: 'o3', order_type: null },
]

describe('attachOrderType', () => {
  it('adds the type to each order, keeping every other field', async () => {
    const { client } = fake(DB)
    const out = await attachOrderType(client, [{ id: 'o1', produce_name: 'Tomato' }, { id: 'o2', produce_name: 'Rice' }])
    expect(out).toEqual([
      { id: 'o1', produce_name: 'Tomato', order_type: 'wholesale' },
      { id: 'o2', produce_name: 'Rice', order_type: 'retail' },
    ])
  })
  it('a null or unknown type reads as retail', async () => {
    const { client } = fake([...DB, { id: 'o4', order_type: 'bulk' }])
    const out = await attachOrderType(client, [{ id: 'o3' }, { id: 'o4' }])
    expect(out.map((o) => o.order_type)).toEqual(['retail', 'retail'])
  })
  it('an order the read did not return is left as it was', async () => {
    const { client } = fake(DB)
    const out = await attachOrderType(client, [{ id: 'missing' }])
    expect(out).toEqual([{ id: 'missing' }])
  })
  it('no orders → no database call', async () => {
    const { client, calls } = fake(DB)
    expect(await attachOrderType(client, [])).toEqual([])
    expect(calls).toEqual([])
  })
  it('a database without the column: orders come back unchanged', async () => {
    const { client } = fake(DB, 'error')
    const orders = [{ id: 'o1', x: 1 }]
    expect(await attachOrderType(client, orders)).toEqual(orders)
  })
  it('never throws', async () => {
    const { client } = fake(DB, 'throw')
    await expect(attachOrderType(client, [{ id: 'o1' }])).resolves.toEqual([{ id: 'o1' }])
  })
})

describe('isWholesaleOrder', () => {
  it('only an explicit wholesale', () => {
    expect(isWholesaleOrder({ order_type: 'wholesale' })).toBe(true)
    for (const o of [{ order_type: 'retail' }, { order_type: null }, {}, null, undefined, { order_type: 'WHOLESALE' }]) {
      expect(isWholesaleOrder(o as never)).toBe(false)
    }
  })
})

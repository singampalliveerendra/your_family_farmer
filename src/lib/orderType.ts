import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Retail or wholesale, per order row (orders.order_type, from
 * scripts/wholesale-migration.sql).
 *
 * Read on its own and tolerantly, exactly like attachFarmerResolved
 * (src/lib/farmerResolve.ts): on a database without the column this read fails
 * and the orders go out unchanged — a missing column must never empty an order
 * list. Screens treat a missing order_type as retail.
 */
export async function attachOrderType<T extends { id: string }>(
  supabase: SupabaseClient,
  orders: T[],
): Promise<Array<T & { order_type?: 'retail' | 'wholesale' }>> {
  if (orders.length === 0) return orders
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_type')
      .in('id', orders.map((o) => o.id))
    if (error || !data) return orders
    const type = new Map<string, 'retail' | 'wholesale'>()
    for (const r of data as Array<{ id: string; order_type?: string | null }>) {
      type.set(r.id, r.order_type === 'wholesale' ? 'wholesale' : 'retail')
    }
    return orders.map((o) => (type.has(o.id) ? { ...o, order_type: type.get(o.id) } : o))
  } catch {
    return orders
  }
}

/** A wholesale order? Missing / unknown reads as retail. */
export function isWholesaleOrder(o: { order_type?: unknown } | null | undefined): boolean {
  return o?.order_type === 'wholesale'
}

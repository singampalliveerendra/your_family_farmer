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

/**
 * A bulk order's transport charge and destination (orders.transport_charge /
 * transport_state, scripts/bulk-orders-migration.sql). Read tolerantly like
 * attachOrderType: before that migration the orders go out unchanged.
 * transport_charge is INCLUDED in total_price — this only lets screens and
 * receipts show it as its own line.
 */
export async function attachTransport<T extends { id: string }>(
  supabase: SupabaseClient,
  orders: T[],
): Promise<Array<T & { transport_charge?: number; transport_state?: string | null }>> {
  if (orders.length === 0) return orders
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, transport_charge, transport_state')
      .in('id', orders.map((o) => o.id))
    if (error || !data) return orders
    const by = new Map((data as Array<{ id: string; transport_charge?: unknown; transport_state?: string | null }>).map((r) => [r.id, r]))
    return orders.map((o) => {
      const r = by.get(o.id)
      if (!r) return o
      const t = Number(r.transport_charge)
      return { ...o, transport_charge: Number.isFinite(t) && t > 0 ? t : 0, transport_state: r.transport_state ?? null }
    })
  } catch {
    return orders
  }
}

/**
 * A cargo parcel's service and who pays it (orders.cargo_service /
 * cargo_paid_by, scripts/courier-options-migration.sql, 2026-11-10). Read
 * tolerantly like attachTransport: before that migration orders go out as-is.
 */
export async function attachCargo<T extends { id: string }>(
  supabase: SupabaseClient,
  orders: T[],
): Promise<Array<T & { cargo_service?: string | null; cargo_paid_by?: string | null }>> {
  if (orders.length === 0) return orders
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, cargo_service, cargo_paid_by')
      .in('id', orders.map((o) => o.id))
    if (error || !data) return orders
    const by = new Map((data as Array<{ id: string; cargo_service?: string | null; cargo_paid_by?: string | null }>).map((r) => [r.id, r]))
    return orders.map((o) => {
      const r = by.get(o.id)
      return r && r.cargo_service ? { ...o, cargo_service: r.cargo_service, cargo_paid_by: r.cargo_paid_by ?? null } : o
    })
  } catch {
    return orders
  }
}

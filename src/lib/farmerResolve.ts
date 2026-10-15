import type { SupabaseClient } from '@supabase/supabase-js'

// The farmer / aggregator closing an order themselves ("Mark as resolved").
//
// Normally the buyer's side closes an order: the buyer reads their 4-digit
// handover code to the farmer (self-pickup → collected_at, farmer delivery /
// courier → received_at), or a rider closes it at the door (delivery_status
// 'delivered'). When the buyer can't be reached to read the code, the order
// sat in Active forever even though the produce had changed hands.
//
// Resolving stamps the SAME closing column the code would have stamped, so
// every screen that already knows "completed" (both Orders pages, history,
// reports, search, ratings) moves the order without a single change. It ALSO
// stamps orders.farmer_resolved_at, so nobody is told "the farmer confirmed it
// with your code" when no code was given — the buyer sees "Marked completed by
// the farmer" instead. An order_events row records who did it and why.
//
// Shared by /api/farmer/orders/[id]/resolve and the farmer's order card.

export type ResolvableOrder = {
  status: string
  delivery_type?: string | null
  delivery_status?: string | null
  shipped_at?: string | null
  collected_at?: string | null
  received_at?: string | null
}

export type ResolveBlock = { status: number; error: string }

/** Longest note the farmer may attach. */
export const RESOLVE_NOTE_MAX = 200

const riderHandling = (o: ResolvableOrder) =>
  o.delivery_type === 'home_delivery'
  && o.delivery_status != null
  && o.delivery_status !== 'unassigned'

/** Already completed by any route: code, rider, or an earlier resolve. */
export const isOrderClosed = (o: ResolvableOrder) =>
  o.delivery_status === 'delivered' || !!o.collected_at || !!o.received_at

/**
 * Why this order can't be marked resolved, or null if it can.
 *
 * Only an APPROVED order qualifies: a pending one hasn't been accepted (approve
 * or decline it), and declined / cancelled orders are already finished and
 * their money has gone back. A rider-handled home delivery is closed by the
 * rider at the door, so the farmer can't close it over them.
 */
export function farmerResolveBlock(o: ResolvableOrder): ResolveBlock | null {
  if (o.status === 'pending') {
    return { status: 409, error: 'Approve this order first. A pending order cannot be marked resolved.' }
  }
  if (o.status === 'declined' || o.status === 'cancelled') {
    return { status: 409, error: 'This order was declined or cancelled. It cannot be marked resolved.' }
  }
  if (o.status !== 'approved') {
    return { status: 409, error: 'This order cannot be marked resolved.' }
  }
  if (isOrderClosed(o)) {
    return { status: 409, error: 'This order is already completed.' }
  }
  if (riderHandling(o)) {
    return { status: 409, error: 'A delivery agent is handling this order — they confirm it.' }
  }
  return null
}

/** Can the card show the button? Same rule as the route. */
export const canFarmerResolve = (o: ResolvableOrder) => farmerResolveBlock(o) === null

/** The closing column the buyer's code would have stamped for this order. */
export function closingColumn(o: ResolvableOrder): 'collected_at' | 'received_at' {
  return o.delivery_type === 'home_delivery' || o.delivery_type === 'courier' ? 'received_at' : 'collected_at'
}

/**
 * The columns to write. A delivery / courier order the farmer never marked
 * Shipped gets shipped_at too, so the tracker on both sides doesn't show
 * "Delivered" with an unreached "Shipped" step before it.
 */
export function farmerResolveUpdate(o: ResolvableOrder, nowIso: string): Record<string, string> {
  const col = closingColumn(o)
  const update: Record<string, string> = { [col]: nowIso, farmer_resolved_at: nowIso }
  if (col === 'received_at' && !o.shipped_at) update.shipped_at = nowIso
  return update
}

/** The farmer's optional note: trimmed, single-spaced, capped. */
export function cleanResolveNote(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, RESOLVE_NOTE_MAX)
}

/** Postgres "undefined column" — the migration hasn't run on this database. */
export function isMissingResolveColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === '42703' || err.code === 'PGRST204' || /farmer_resolved_at/.test(err.message ?? '')
}

/**
 * Add farmer_resolved_at to rows already loaded, with one extra read. Kept
 * out of the main select on purpose: on a database without
 * scripts/farmer-resolve-migration.sql that select would fail outright and
 * blank the whole order list. Here a missing column just leaves the field off.
 */
export async function attachFarmerResolved<T extends { id: string }>(
  supabase: SupabaseClient,
  orders: T[],
): Promise<Array<T & { farmer_resolved_at?: string | null }>> {
  if (orders.length === 0) return orders
  const { data, error } = await supabase
    .from('orders')
    .select('id, farmer_resolved_at')
    .in('id', orders.map((o) => o.id))
  if (error || !data) return orders
  const at = new Map<string, string | null>()
  for (const r of data as Array<{ id: string; farmer_resolved_at: string | null }>) at.set(r.id, r.farmer_resolved_at ?? null)
  return orders.map((o) => (at.has(o.id) ? { ...o, farmer_resolved_at: at.get(o.id) ?? null } : o))
}

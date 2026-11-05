import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'
import { getModeratorZone, isModeratorRequest } from '@/lib/moderator-session'
import { isMissingColumnError } from '@/lib/missingColumn'
import { billView, type BillView } from '@/lib/transportBill'

/* Server side of the transport bill (2026-11-05). One loader so every route
 * reads the same columns and treats a database without
 * scripts/transport-bill-migration.sql the same way (503, not a crash). */

export const CARGO_BUCKET = 'cargo-bills'
export const BILL_COLUMNS =
  'id, farmer_id, buyer_aggregator_id, order_type, status, shipped_at, transport_mode, transport_rate, transport_km, transport_bill_amount, transport_bill_path, transport_billed_at, transport_paid_at'

export type BillRow = {
  id: string
  farmer_id: string
  buyer_aggregator_id: string | null
  order_type: string | null
  status: string | null
  shipped_at: string | null
  transport_mode: string | null
  transport_rate: number | string | null
  transport_km: number | string | null
  transport_bill_amount: number | string | null
  transport_bill_path: string | null
  transport_billed_at: string | null
  transport_paid_at: string | null
}

export async function loadBillOrder(supabase: SupabaseClient, id: string):
  Promise<{ row: BillRow | null; notReady: boolean }> {
  const { data, error } = await supabase.from('orders').select(BILL_COLUMNS).eq('id', id).maybeSingle()
  if (error) return { row: null, notReady: isMissingColumnError(error.message, 'transport_mode') || /transport_/.test(error.message) }
  return { row: (data as BillRow | null) ?? null, notReady: false }
}

/** Who is asking about this order's bill: its seller, its buyer, a moderator of the seller's zone — or nobody. */
export async function billRole(supabase: SupabaseClient, req: NextRequest, row: BillRow): Promise<'seller' | 'buyer' | 'moderator' | null> {
  const s = getFarmerSessionFromRequest(req)
  if (s?.farmerId && s.farmerId === row.farmer_id) return 'seller'
  if (s?.farmerId && row.buyer_aggregator_id && s.farmerId === row.buyer_aggregator_id) return 'buyer'
  if (isModeratorRequest(req)) {
    const { data } = await supabase.from('farmers').select('region_slug').eq('id', row.farmer_id).maybeSingle()
    if (data && (data as { region_slug?: string | null }).region_slug === getModeratorZone(req)) return 'moderator'
  }
  return null
}

/**
 * Add `transport_bill` (what both sides see — see billView) to orders. Read
 * tolerantly: before scripts/transport-bill-migration.sql the orders go out
 * unchanged. The bill's file path never leaves the server — only `hasFile`.
 */
export async function attachTransportBill<T extends { id: string }>(
  supabase: SupabaseClient,
  orders: T[],
): Promise<Array<T & { transport_bill?: BillView }>> {
  if (orders.length === 0) return orders
  try {
    const { data, error } = await supabase.from('orders').select(BILL_COLUMNS).in('id', orders.map((o) => o.id))
    if (error || !data) return orders
    const by = new Map((data as BillRow[]).map((r) => [r.id, r]))
    return orders.map((o) => {
      const r = by.get(o.id)
      return r ? { ...o, transport_bill: billView(r) } : o
    })
  } catch {
    return orders
  }
}

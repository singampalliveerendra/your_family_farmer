// Grouping cart lines into rider delivery JOBS.
//
// /api/orders/place writes one `orders` row per cart line, so a buyer who takes
// three things from one farmer produces three rows. For the rider that is still
// ONE piece of work: one bag collected at one farm, carried to one door, handed
// over against one code. Left ungrouped it shows up as three jobs to accept and
// three status pipelines to walk, and — worse — two riders can each claim a
// different line of the same bag.
//
// A job is therefore every home-delivery row sharing (checkout_id, farmer_id):
//   - same checkout  → same buyer, same address, same handover_otp
//   - same farmer    → same pickup point
// NOT checkout_id alone: a second farmer is a genuinely separate pickup stop,
// which is exactly what the +extra delivery charge pays for (see delivery-fee.ts).
//
// Money already follows this shape. place/route.ts stamps the farmer's whole
// delivery share (and rider_payout) on ONE row of the batch and 0 on its
// siblings, so a job's earning is the SUM over its rows — which is why an
// ungrouped list showed "₹30" on one card and nothing on the rest.
//
// Legacy rows predate checkout_id and carry NULL. Those can't be grouped by key,
// so each becomes a job of one — exactly today's behaviour, nothing regresses.

import type { SupabaseClient } from '@supabase/supabase-js'

export type JobRow = {
  id: string
  farmer_id?: string | null
  checkout_id?: string | null
}

// Stable identity for the job a row belongs to.
export function jobKeyOf(row: JobRow): string {
  const checkout = row.checkout_id ?? null
  if (!checkout || !row.farmer_id) return `solo:${row.id}`
  return `job:${checkout}:${row.farmer_id}`
}

// Bucket rows into jobs, preserving the order rows arrived in (the caller's
// query is already sorted, and the first row of each job anchors it).
export function groupByJob<T extends JobRow>(rows: T[]): Array<{ key: string; rows: T[] }> {
  const byKey = new Map<string, T[]>()
  const order: string[] = []
  for (const row of rows) {
    const key = jobKeyOf(row)
    const bucket = byKey.get(key)
    if (bucket) {
      bucket.push(row)
    } else {
      byKey.set(key, [row])
      order.push(key)
    }
  }
  return order.map((key) => ({ key, rows: byKey.get(key) as T[] }))
}

// Every order id in the same job as `anchorId`, resolved SERVER-SIDE from the
// anchor's own checkout_id/farmer_id. The rider's client never sends the id
// list: it may be stale (a farmer can decline one line after the list loaded)
// and it must not be a lever for touching rows outside the job. Callers apply
// their own state guards to the returned ids — this only answers "which rows
// belong together".
//
// Returns null when the anchor doesn't exist. Always includes the anchor id.
export async function resolveJobOrderIds(
  supabase: SupabaseClient,
  anchorId: string,
): Promise<string[] | null> {
  const { data: anchor, error } = await supabase
    .from('orders')
    .select('id, farmer_id, checkout_id')
    .eq('id', anchorId)
    .maybeSingle() as { data: JobRow | null; error: { message: string } | null }

  // checkout_id not migrated yet → treat the order as a job of one rather than
  // failing the rider's tap.
  if (error) {
    console.warn('[YFF rider-jobs] job resolve fell back to single order:', error.message)
    return [anchorId]
  }
  if (!anchor) return null
  if (!anchor.checkout_id || !anchor.farmer_id) return [anchorId]

  const { data: siblings, error: sibErr } = await supabase
    .from('orders')
    .select('id')
    .eq('checkout_id', anchor.checkout_id)
    .eq('farmer_id', anchor.farmer_id)
    .eq('delivery_type', 'home_delivery') as { data: Array<{ id: string }> | null; error: { message: string } | null }

  if (sibErr || !siblings || siblings.length === 0) {
    if (sibErr) console.warn('[YFF rider-jobs] sibling lookup failed:', sibErr.message)
    return [anchorId]
  }

  const ids = siblings.map((r) => r.id)
  return ids.includes(anchorId) ? ids : [anchorId, ...ids]
}

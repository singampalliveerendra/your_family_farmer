import { createClient } from '@supabase/supabase-js'

// Popularity signal for the "sort by Purchases" harvest sort. Counts the orders
// placed against each produce listing, excluding cancelled/declined ones (those
// never became real purchases). Uses the service role so orders-table RLS never
// hides rows from this aggregate — only the resulting count is exposed, never
// any order detail. Best-effort: any failure yields an empty map so listing
// pages keep working (every listing just reads as 0 purchases).
export async function purchaseCountsFor(listingIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(listingIds.filter(Boolean))]
  if (ids.length === 0) return {}
  try {
    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data } = await svc
      .from('orders')
      .select('produce_listing_id')
      .in('produce_listing_id', ids)
      .not('status', 'in', '("cancelled","declined")')
    const counts: Record<string, number> = {}
    for (const o of (data ?? []) as { produce_listing_id: string | null }[]) {
      const id = o.produce_listing_id
      if (id) counts[id] = (counts[id] ?? 0) + 1
    }
    return counts
  } catch {
    return {}
  }
}

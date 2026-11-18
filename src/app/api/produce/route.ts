import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { farmAreas } from '@/lib/farmArea'
import { purchaseCountsFor } from '@/lib/purchaseCounts'
import { CONSUMER_VISIBLE_STATUSES, FEED_STATUSES } from '@/lib/produceStatus'
import { retailRows } from '@/lib/wholesaleVisibility'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// The public feed is identical for every visitor, and every open consumer tab
// refetches it (on load, on tab focus, and on each realtime listing change).
// A short shared-cache window lets Vercel's CDN answer a burst of those from
// one function run. Kept short because stock/price must look current; orders
// re-check stock server-side, so a few seconds of staleness cannot oversell.
//
// stale-while-revalidate: at today's traffic most visits come more than 15 s
// apart, so 88% of feed calls missed the cache and waited ~0.8 s for a fresh
// run (vercel metrics, 2026-11-10..18). Now the CDN answers at once with the
// last copy and refreshes it in the background, so the next visitor gets the
// new one. A served copy is as old as the previous visit, never over 5 min.
// (Not exported: Next.js rejects unknown exports from a route file.)
const FEED_CACHE = 'public, s-maxage=15, stale-while-revalidate=300'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'available'

  // "available" means "what a buyer may see", which includes sold-out produce —
  // the grid renders those greyed with a disabled CTA. See CONSUMER_VISIBLE_STATUSES.
  // Any other explicit status (coming_soon, …) is returned as asked for.
  // "feed" is the home page's one request for both shelves (buyer-visible +
  // coming soon), split client-side by splitFeed().
  const wanted = status === 'available' ? [...CONSUMER_VISIBLE_STATUSES]
    : status === 'feed' ? [...FEED_STATUSES]
    : [status]

  const { data: allProduce, error } = await supabase
    .from('produce_listings')
    .select('*')
    .in('status', wanted)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Household buyers only (web feed + Android app): wholesale-only produce is
  // dropped and "both" loses its wholesale price (src/lib/wholesaleVisibility.ts).
  const produce = retailRows(allProduce)
  if (!produce?.length) return NextResponse.json([], { headers: { 'Cache-Control': FEED_CACHE } })

  const farmerIds = [...new Set(produce.map((p) => p.farmer_id))]

  const { data: farmers } = await supabase
    .from('farmers')
    // No phone, pickup-point phones or exact location: since the security fix
    // (2026-11-04) those are not public. Distance uses the village instead.
    .select('id, name, village, slug, method, region_slug, pickup_locations, pickup_slots, account_type')
    .in('id', farmerIds)
    .eq('active', true)

  // A rough farm point (~5 km grid, never the exact farm) for the buyer's
  // distance and "delivers here?" — src/lib/farmArea.ts (2026-11-05).
  const areas = await farmAreas((farmers ?? []).map((f) => f.id as string))
  const farmerMap = Object.fromEntries((farmers ?? []).map((f) => [f.id, { ...f, area: areas[f.id as string] ?? null }]))

  const result = produce
    .map((p) => ({ ...p, farmer: farmerMap[p.farmer_id] ?? null }))
    .filter((p) => p.farmer !== null)

  // Popularity count for the consumer "sort by Purchases" option.
  const counts = await purchaseCountsFor(result.map((p) => p.id as string))
  const withCounts = result.map((p) => ({ ...p, purchase_count: counts[p.id as string] ?? 0 }))

  return NextResponse.json(withCounts, { headers: { 'Cache-Control': FEED_CACHE } })
}

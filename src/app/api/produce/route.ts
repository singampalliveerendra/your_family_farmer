import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { purchaseCountsFor } from '@/lib/purchaseCounts'
import { CONSUMER_VISIBLE_STATUSES, FEED_STATUSES } from '@/lib/produceStatus'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// The public feed is identical for every visitor, and every open consumer tab
// refetches it (on load, on tab focus, and on each realtime listing change).
// A short shared-cache window lets Vercel's CDN answer a burst of those from
// one function run. Kept short because stock/price must look current; orders
// re-check stock server-side, so a few seconds of staleness cannot oversell.
const FEED_CACHE = 'public, s-maxage=15'

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

  const { data: produce, error } = await supabase
    .from('produce_listings')
    .select('*')
    .in('status', wanted)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!produce?.length) return NextResponse.json([], { headers: { 'Cache-Control': FEED_CACHE } })

  const farmerIds = [...new Set(produce.map((p) => p.farmer_id))]

  const { data: farmers } = await supabase
    .from('farmers')
    .select('id, name, village, slug, phone, method, region_slug, pickup_locations, pickup_slots, pickup_location_phones, lat, lng, account_type')
    .in('id', farmerIds)
    .eq('active', true)

  const farmerMap = Object.fromEntries((farmers ?? []).map((f) => [f.id, f]))

  const result = produce
    .map((p) => ({ ...p, farmer: farmerMap[p.farmer_id] ?? null }))
    .filter((p) => p.farmer !== null)

  // Popularity count for the consumer "sort by Purchases" option.
  const counts = await purchaseCountsFor(result.map((p) => p.id as string))
  const withCounts = result.map((p) => ({ ...p, purchase_count: counts[p.id as string] ?? 0 }))

  return NextResponse.json(withCounts, { headers: { 'Cache-Control': FEED_CACHE } })
}

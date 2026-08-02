import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { purchaseCountsFor } from '@/lib/purchaseCounts'
import { CONSUMER_VISIBLE_STATUSES } from '@/lib/produceStatus'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'available'

  // "available" means "what a buyer may see", which includes sold-out produce —
  // the grid renders those greyed with a disabled CTA. See CONSUMER_VISIBLE_STATUSES.
  // Any other explicit status (coming_soon, …) is returned as asked for.
  const wanted = status === 'available' ? [...CONSUMER_VISIBLE_STATUSES] : [status]

  const { data: produce, error } = await supabase
    .from('produce_listings')
    .select('*')
    .in('status', wanted)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!produce?.length) return NextResponse.json([])

  const farmerIds = [...new Set(produce.map((p) => p.farmer_id))]

  const { data: farmers } = await supabase
    .from('farmers')
    .select('id, name, village, slug, phone, method, region_slug, pickup_locations, pickup_slots, lat, lng')
    .in('id', farmerIds)
    .eq('active', true)

  const farmerMap = Object.fromEntries((farmers ?? []).map((f) => [f.id, f]))

  const result = produce
    .map((p) => ({ ...p, farmer: farmerMap[p.farmer_id] ?? null }))
    .filter((p) => p.farmer !== null)

  // Popularity count for the consumer "sort by Purchases" option.
  const counts = await purchaseCountsFor(result.map((p) => p.id as string))
  const withCounts = result.map((p) => ({ ...p, purchase_count: counts[p.id as string] ?? 0 }))

  return NextResponse.json(withCounts)
}

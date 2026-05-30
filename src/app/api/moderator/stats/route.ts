import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }

  const zone = getModeratorZone()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // All farmers in this zone — needed to scope orders/listings to the zone.
  const { data: zoneFarmers, error: fErr } = await supabase
    .from('farmers')
    .select('id, active')
    .eq('region_slug', zone)

  if (fErr) {
    console.error('[YFF moderator/stats] farmers query failed:', fErr.message)
    return NextResponse.json({ error: fErr.message }, { status: 500 })
  }

  const farmerIds = (zoneFarmers ?? []).map((f) => f.id)
  const activeFarmers = (zoneFarmers ?? []).filter((f) => f.active).length

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Default everything that depends on having farmers in the zone.
  let ordersThisWeek = 0
  let gmvThisWeek = 0
  let consumers = 0
  let pendingApprovals = 0

  if (farmerIds.length > 0) {
    // Orders this week (count) + GMV this week (sum of total_price).
    const { data: weekOrders } = await supabase
      .from('orders')
      .select('total_price')
      .in('farmer_id', farmerIds)
      .gte('created_at', weekAgo)
    ordersThisWeek = weekOrders?.length ?? 0
    gmvThisWeek = (weekOrders ?? []).reduce((sum, o) => sum + Number(o.total_price ?? 0), 0)

    // Consumers = distinct buyers who have ever ordered from a zone farmer.
    const { data: buyerRows } = await supabase
      .from('orders')
      .select('consumer_id')
      .in('farmer_id', farmerIds)
      .not('consumer_id', 'is', null)
    consumers = new Set((buyerRows ?? []).map((r) => r.consumer_id)).size

    // Pending approvals: listings awaiting review. The listing-approval flow
    // (Feature 3) is not built yet, so this is 0 until a 'pending_review'
    // status exists — counting it here keeps the card correct once it ships.
    const { count: pendingCount } = await supabase
      .from('produce_listings')
      .select('id', { count: 'exact', head: true })
      .in('farmer_id', farmerIds)
      .eq('status', 'pending_review')
    pendingApprovals = pendingCount ?? 0
  }

  // Open escalations: anything not yet resolved, in this zone (Feature 7).
  const { count: openCount } = await supabase
    .from('escalations')
    .select('id', { count: 'exact', head: true })
    .eq('region_slug', zone)
    .neq('status', 'resolved')
  const openEscalations = openCount ?? 0

  return NextResponse.json({
    zone,
    stats: {
      activeFarmers,
      consumers,
      ordersThisWeek,
      gmvThisWeek,
      openEscalations,
      pendingApprovals,
    },
  })
}

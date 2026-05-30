import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Which DB status each UI tab maps to.
const TAB_STATUS: Record<string, string> = {
  pending: 'pending_review',
  active: 'available',
  rejected: 'rejected',
}

// GET — listings in the moderator's zone for one tab, newest-pending first.
// Each row carries the farmer's name so the card can show it.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone()
  const supabase = svc()

  const tab = req.nextUrl.searchParams.get('tab') ?? 'pending'
  const status = TAB_STATUS[tab] ?? TAB_STATUS.pending

  // Farmers in this zone — listings are scoped through them.
  const { data: zoneFarmers, error: fErr } = await supabase
    .from('farmers')
    .select('id, name')
    .eq('region_slug', zone)
  if (fErr) {
    console.error('[YFF moderator/listings] farmers query failed:', fErr.message)
    return NextResponse.json({ error: fErr.message }, { status: 500 })
  }
  const nameById = new Map((zoneFarmers ?? []).map((f) => [f.id, f.name]))
  const farmerIds = (zoneFarmers ?? []).map((f) => f.id)
  if (farmerIds.length === 0) return NextResponse.json({ listings: [] })

  // Pending oldest-first (act on the longest-waiting first); others newest-first.
  const ascending = status === 'pending_review'
  const { data: listings, error } = await supabase
    .from('produce_listings')
    .select('id, farmer_id, name, variety, method, unit, stock_qty, brix, price_tier_1_price, status, rejection_reason, created_at')
    .in('farmer_id', farmerIds)
    .eq('status', status)
    .order('created_at', { ascending })
  if (error) {
    console.error('[YFF moderator/listings] listings query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (listings ?? []).map((l) => ({ ...l, farmer_name: nameById.get(l.farmer_id) ?? '—' }))
  return NextResponse.json({ listings: rows })
}

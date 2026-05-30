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

// Actions the moderator can take on a listing, and the status each sets.
//   approve  → available   (goes live on the consumer page)
//   reject   → rejected    (requires a reason)
//   suspend  → sold_out    (pull a live listing)
const ACTION_STATUS: Record<string, string> = {
  approve: 'available',
  reject: 'rejected',
  suspend: 'sold_out',
}

// PATCH — approve / reject / suspend a listing. Zone-scoped: the listing's
// farmer must be in this moderator's region before any write.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const { id } = await params
  const zone = getModeratorZone()
  const supabase = svc()

  const body = await req.json().catch(() => null)
  const action = String((body as { action?: unknown })?.action ?? '')
  const status = ACTION_STATUS[action]
  if (!status) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  const reason = String((body as { reason?: unknown })?.reason ?? '').trim()
  if (action === 'reject' && !reason) {
    return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 })
  }

  // Confirm the listing belongs to a farmer in this zone.
  const { data: listing } = await supabase
    .from('produce_listings')
    .select('id, farmer_id')
    .eq('id', id)
    .maybeSingle()
  if (!listing?.farmer_id) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  }
  const { data: farmer } = await supabase
    .from('farmers')
    .select('region_slug')
    .eq('id', listing.farmer_id)
    .maybeSingle()
  if (!farmer || farmer.region_slug !== zone) {
    return NextResponse.json({ error: 'Listing not found in your zone.' }, { status: 404 })
  }

  // Clear any old rejection reason on approve/suspend; set it on reject.
  const update: Record<string, unknown> = { status, rejection_reason: action === 'reject' ? reason : null }

  const { data: updated, error } = await supabase
    .from('produce_listings')
    .update(update)
    .eq('id', id)
    .select('id, status, rejection_reason')
    .single()
  if (error) {
    console.error('[YFF moderator/listings PATCH] failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ listing: updated })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// PATCH — suspend or reactivate a consumer account.
//   { suspended: true | false }
// A moderator may only act on a consumer who has ordered from a farmer in their
// zone, so one zone's moderator can't touch another zone's buyers.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const { id } = await params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid consumer id.' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const suspended = (body as { suspended?: unknown })?.suspended
  if (typeof suspended !== 'boolean') {
    return NextResponse.json({ error: 'suspended must be true or false.' }, { status: 400 })
  }

  const zone = getModeratorZone()
  const supabase = svc()

  // Confirm the consumer exists.
  const { data: consumer } = await supabase
    .from('consumers_auth').select('id').eq('id', id).maybeSingle()
  if (!consumer) return NextResponse.json({ error: 'Consumer not found.' }, { status: 404 })

  // Zone check: the consumer must have at least one order from a farmer here.
  const { data: zoneFarmers } = await supabase.from('farmers').select('id').eq('region_slug', zone)
  const farmerIds = (zoneFarmers ?? []).map((f) => f.id)
  let inZone = false
  if (farmerIds.length > 0) {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('consumer_id', id)
      .in('farmer_id', farmerIds)
    inZone = (count ?? 0) > 0
  }
  if (!inZone) {
    return NextResponse.json({ error: 'This consumer has not ordered in your zone.' }, { status: 403 })
  }

  const { error } = await supabase
    .from('consumers_auth')
    .update({ suspended, suspended_at: suspended ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) {
    console.error('[YFF moderator/consumers PATCH] update failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ id, suspended })
}

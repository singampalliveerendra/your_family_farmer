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

// GET — recent audit entries for the moderator's zone. Rows whose table has a
// region_slug (farmers, produce_listings, escalations, demand_intents) are
// scoped to the zone; rows that carry no zone (e.g. consumer accounts) are
// always shown so account actions stay visible. Newest first.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone()
  const supabase = svc()

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 200) || 200, 500)

  const { data, error } = await supabase
    .from('audit_log')
    .select('id, table_name, record_id, action, actor_type, actor_id, changes, region_slug, created_at')
    .or(`region_slug.eq.${zone},region_slug.is.null`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[YFF moderator/audit] query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ entries: data ?? [] })
}

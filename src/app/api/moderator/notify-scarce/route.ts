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

// GET ?crop=Tomato — farmers in this zone who grow the given crop, so the
// moderator can WhatsApp them to plant/list more of a scarce crop. "Grows it"
// is inferred from having ever listed it (farmers have no crop column). We
// return phone numbers; the client opens wa.me links (no Twilio wired yet).
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone(req)
  const crop = (new URL(req.url).searchParams.get('crop') ?? '').trim()
  if (!crop) return NextResponse.json({ error: 'crop is required.' }, { status: 400 })

  const supabase = svc()

  const { data: farmers, error: fErr } = await supabase
    .from('farmers')
    .select('id, name, phone')
    .eq('region_slug', zone)
  if (fErr) {
    console.error('[YFF moderator/notify-scarce] farmers query failed:', fErr.message)
    return NextResponse.json({ error: fErr.message }, { status: 500 })
  }
  const byId = new Map((farmers ?? []).map((f) => [f.id, f]))
  if (byId.size === 0) return NextResponse.json({ farmers: [] })

  // Any farmer in the zone who has listed this crop (case-insensitive).
  const { data: rows, error: lErr } = await supabase
    .from('produce_listings')
    .select('farmer_id, name')
    .in('farmer_id', Array.from(byId.keys()))
    .ilike('name', crop)
  if (lErr) {
    console.error('[YFF moderator/notify-scarce] listings query failed:', lErr.message)
    return NextResponse.json({ error: lErr.message }, { status: 500 })
  }

  const seen = new Set<string>()
  const matched: { id: string; name: string; phone: string | null }[] = []
  for (const r of rows ?? []) {
    if (!r.farmer_id || seen.has(r.farmer_id)) continue
    const f = byId.get(r.farmer_id)
    if (!f) continue
    seen.add(r.farmer_id)
    matched.push({ id: f.id, name: f.name, phone: f.phone })
  }

  return NextResponse.json({ crop, farmers: matched })
}

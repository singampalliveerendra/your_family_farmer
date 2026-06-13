import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const METHODS = ['natural', 'low_chemical', 'chemical'] as const

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// PATCH — edit farmer details or toggle active status. Scoped to the zone so a
// moderator can never touch a farmer outside their own region.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const { id } = await params
  const zone = getModeratorZone(req)
  const supabase = svc()

  // Confirm the farmer belongs to this moderator's zone before any write.
  const { data: farmer } = await supabase
    .from('farmers')
    .select('id, region_slug')
    .eq('id', id)
    .maybeSingle()
  if (!farmer || farmer.region_slug !== zone) {
    return NextResponse.json({ error: 'Farmer not found in your zone.' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
  const b = body as Record<string, unknown>

  const update: Record<string, unknown> = {}
  if ('name' in b) update.name = String(b.name ?? '').trim()
  if ('phone' in b) update.phone = String(b.phone ?? '').trim() || null
  if ('village' in b) update.village = String(b.village ?? '').trim() || null
  if ('district' in b) update.district = String(b.district ?? '').trim() || null
  if ('story_quote' in b) update.story_quote = String(b.story_quote ?? '').trim() || null
  if ('farm_size_acres' in b) update.farm_size_acres = Number(b.farm_size_acres) || null
  if ('farming_since_year' in b) update.farming_since_year = Number(b.farming_since_year) || null
  if ('active' in b) update.active = Boolean(b.active)
  if ('method' in b) {
    const m = String(b.method ?? '')
    if ((METHODS as readonly string[]).includes(m)) update.method = m
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('farmers')
    .update(update)
    .eq('id', id)
    .select('id, slug, name, phone, village, district, method, active')
    .single()

  if (error) {
    console.error('[YFF moderator/farmers PATCH] failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ farmer: updated })
}

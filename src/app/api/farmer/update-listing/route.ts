import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Disallowed payload keys — never let the client mutate ownership, status
// flags, or audit columns through this generic update endpoint.
const FORBIDDEN_KEYS = new Set([
  'id', 'farmer_id', 'created_at', 'updated_at',
])

export async function POST(request: NextRequest) {
  // farmerId now comes from the signed cookie, not the request body.
  const session = getFarmerSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { listingId, payload } = body as { listingId?: unknown; payload?: unknown }
  if (typeof listingId !== 'string' || !UUID_RE.test(listingId)) {
    return NextResponse.json({ error: 'Invalid listing id' }, { status: 400 })
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  // Strip any forbidden keys before forwarding to the DB.
  const cleanPayload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (!FORBIDDEN_KEYS.has(k)) cleanPayload[k] = v
  }

  // Verify the listing belongs to the logged-in farmer.
  const { data: existing } = await supabaseAdmin
    .from('produce_listings')
    .select('id')
    .eq('id', listingId)
    .eq('farmer_id', session.farmerId)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Listing not found or access denied' }, { status: 403 })
  }

  const { data: updated, error } = await supabaseAdmin
    .from('produce_listings')
    .update(cleanPayload)
    .eq('id', listingId)
    .eq('farmer_id', session.farmerId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated?.length) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'
import { getPostHogClient } from '@/lib/posthog-server'

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

  // Verify the listing belongs to the logged-in farmer. We also pull the
  // current status + stock so we can keep the sold-out flag in sync below.
  const { data: existing } = await supabaseAdmin
    .from('produce_listings')
    .select('id, status, stock_qty')
    .eq('id', listingId)
    .eq('farmer_id', session.farmerId)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Listing not found or access denied' }, { status: 403 })
  }

  // Stock ↔ status sync. Whenever a farmer edits the quantity we refresh the
  // sold-out flag: raising stock above 0 clears a stuck "sold_out" so the
  // listing goes live again, and dropping stock to 0 marks it sold out. We only
  // ever flip between these two states, so moderator states (suspended,
  // rejected, pending_review) and "coming_soon" are never clobbered. If the
  // client explicitly sent a status we respect it and skip the auto-sync.
  if (!('status' in cleanPayload)) {
    const nextStock =
      'stock_qty' in cleanPayload
        ? (cleanPayload.stock_qty as number | null)
        : (existing.stock_qty as number | null)
    if (typeof nextStock === 'number') {
      if (nextStock > 0 && existing.status === 'sold_out') {
        cleanPayload.status = 'available'
      } else if (nextStock <= 0 && existing.status === 'available') {
        cleanPayload.status = 'sold_out'
      }
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from('produce_listings')
    .update(cleanPayload)
    .eq('id', listingId)
    .eq('farmer_id', session.farmerId)
    .select('id, status, stock_qty')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated?.length) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  const posthog = getPostHogClient()
  if (posthog) {
    posthog.capture({
      distinctId: session.farmerId,
      event: 'listing_updated',
      properties: {
        listing_id: listingId,
        new_status: updated[0].status,
        new_stock_qty: updated[0].stock_qty,
      },
    })
    await posthog.flush()
  }

  // Return the resolved status/stock so the dashboard card can update instantly
  // (the form merges this into local state before the background refetch lands).
  return NextResponse.json({
    ok: true,
    status: updated[0].status,
    stock_qty: updated[0].stock_qty,
  })
}

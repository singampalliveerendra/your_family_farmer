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

// PATCH — mark a demand intent fulfilled (or re-open it).  { fulfilled: boolean }
// Returns the requester's phone + crop so the UI can offer a WhatsApp "it's
// available now" nudge (no Twilio wired — the client opens a wa.me link).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const { id } = await params
  const zone = getModeratorZone()
  const supabase = svc()

  const body = (await req.json().catch(() => null)) as { fulfilled?: unknown } | null
  if (!body || typeof body.fulfilled !== 'boolean') {
    return NextResponse.json({ error: 'fulfilled (boolean) is required.' }, { status: 400 })
  }

  // Confirm the intent is in this moderator's zone before writing.
  const { data: intent } = await supabase
    .from('demand_intents')
    .select('id, region_slug, crop_name, requester_phone')
    .eq('id', id)
    .maybeSingle()
  if (!intent || intent.region_slug !== zone) {
    return NextResponse.json({ error: 'Demand request not found in your zone.' }, { status: 404 })
  }

  const { error } = await supabase
    .from('demand_intents')
    .update({ fulfilled: body.fulfilled })
    .eq('id', id)
  if (error) {
    console.error('[YFF moderator/demand-intents PATCH] failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    id,
    fulfilled: body.fulfilled,
    crop_name: intent.crop_name,
    requester_phone: intent.requester_phone,
  })
}

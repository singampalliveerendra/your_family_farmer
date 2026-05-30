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

// PATCH — move an escalation along its workflow. Resolving requires notes.
//   { status: 'in_progress' }
//   { status: 'resolved', resolution_notes: '...' }  → also stamps resolved_at
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const { id } = await params
  const zone = getModeratorZone()
  const supabase = svc()

  const body = await req.json().catch(() => null)
  const status = String((body as { status?: unknown })?.status ?? '')
  if (!['open', 'in_progress', 'resolved'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
  }
  const notes = String((body as { resolution_notes?: unknown })?.resolution_notes ?? '').trim()
  if (status === 'resolved' && !notes) {
    return NextResponse.json({ error: 'Resolution notes are required.' }, { status: 400 })
  }

  // Confirm the escalation is in this moderator's zone before writing.
  const { data: esc } = await supabase
    .from('escalations').select('id, region_slug').eq('id', id).maybeSingle()
  if (!esc || esc.region_slug !== zone) {
    return NextResponse.json({ error: 'Escalation not found in your zone.' }, { status: 404 })
  }

  const update: Record<string, unknown> = { status }
  if (status === 'resolved') {
    update.resolution_notes = notes
    update.resolved_at = new Date().toISOString()
  }

  const { data: updated, error } = await supabase
    .from('escalations')
    .update(update)
    .eq('id', id)
    .select('id, status, resolution_notes, resolved_at')
    .single()
  if (error) {
    console.error('[YFF moderator/escalations PATCH] failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ escalation: updated })
}

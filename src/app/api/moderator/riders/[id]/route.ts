import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone, getModeratorId } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Action = 'approve' | 'reject' | 'suspend' | 'reinstate' | 'set_pincodes'

// PATCH — the moderator's verdict on a rider.
//   { action: 'approve',  pincodes?: string[] }
//   { action: 'reject',   reason?: string }
//   { action: 'suspend' } | { action: 'reinstate' }
//   { action: 'set_pincodes', pincodes: string[] }
//
// Approving is what lets a person log in, see real orders, and accept one —
// and accepting hands them a buyer's name, phone and home address. It is the
// only gate between a stranger filling in a public form and standing at a
// customer's door, so it happens here, deliberately, by a human who has looked
// at the ID photo.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid rider id.' }, { status: 400 })

  const zone = getModeratorZone(req)
  const moderatorId = getModeratorId(req)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const body = (await req.json().catch(() => null)) as
    { action?: unknown; pincodes?: unknown; reason?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })

  const action = String(body.action ?? '') as Action
  if (!['approve', 'reject', 'suspend', 'reinstate', 'set_pincodes'].includes(action)) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  }

  // A rider only ever gets the pincodes a moderator confirmed. Self-declared
  // ones from the signup form are a request, not a grant.
  const pincodes = Array.isArray(body.pincodes)
    ? Array.from(new Set(
      body.pincodes.map((p) => String(p).trim()).filter((p) => /^\d{6}$/.test(p)),
    )).slice(0, 30)
    : null

  const { data: rider, error: loadErr } = await supabase
    .from('delivery_boys')
    .select('id, status, zone, service_pincodes')
    .eq('id', id)
    .maybeSingle() as {
      data: { id: string; status: string; zone: string | null; service_pincodes: string[] | null } | null
      error: { message: string } | null
    }

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!rider) return NextResponse.json({ error: 'Rider not found.' }, { status: 404 })

  // Once a rider belongs to a zone, only that zone's moderator may act on them.
  // Pending applications are unclaimed, so any moderator may vet them.
  if (rider.status !== 'pending_approval' && rider.zone != null && rider.zone !== zone) {
    return NextResponse.json({ error: 'This rider belongs to another zone.' }, { status: 403 })
  }

  const now = new Date().toISOString()
  let patch: Record<string, unknown>

  if (action === 'approve') {
    if (rider.status === 'active') {
      return NextResponse.json({ error: 'Rider is already active.' }, { status: 409 })
    }
    if (rider.status === 'suspended') {
      return NextResponse.json({ error: 'Rider is suspended. Reinstate instead.' }, { status: 409 })
    }
    // No service area means no jobs — the rider would log in to an empty
    // screen. Make the moderator commit to a coverage area at approval time.
    const grant = pincodes ?? (rider.service_pincodes ?? []).filter((p) => /^\d{6}$/.test(p))
    if (grant.length === 0) {
      return NextResponse.json(
        { error: 'Set at least one 6-digit pincode this rider covers before approving.' },
        { status: 400 },
      )
    }
    patch = {
      status: 'active',
      service_pincodes: grant,
      zone,
      approved_by: moderatorId,
      approved_at: now,
      activated_at: now,
      activation_code: null,
      rejected_at: null,
      rejection_reason: null,
    }
  } else if (action === 'reject') {
    if (rider.status === 'active') {
      return NextResponse.json({ error: 'Rider is active. Suspend instead.' }, { status: 409 })
    }
    patch = {
      status: 'rejected',
      zone,
      rejected_at: now,
      rejection_reason: String(body.reason ?? '').trim().slice(0, 300) || null,
    }
  } else if (action === 'suspend') {
    if (rider.status !== 'active') {
      return NextResponse.json({ error: 'Only an active rider can be suspended.' }, { status: 409 })
    }
    patch = { status: 'suspended' }
  } else if (action === 'reinstate') {
    if (rider.status !== 'suspended') {
      return NextResponse.json({ error: 'Only a suspended rider can be reinstated.' }, { status: 409 })
    }
    patch = { status: 'active', activated_at: now }
  } else {
    if (!pincodes || pincodes.length === 0) {
      return NextResponse.json({ error: 'Enter at least one 6-digit pincode.' }, { status: 400 })
    }
    patch = { service_pincodes: pincodes }
  }

  const { data: updated, error: updErr } = await supabase
    .from('delivery_boys')
    .update(patch)
    .eq('id', id)
    .select('id, name, phone, status, zone, service_pincodes, approved_at, rejected_at, rejection_reason')
    .single()

  if (updErr) {
    console.error(`[YFF moderator/riders ${action}] update failed:`, updErr.message)
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // Suspending cuts the rider off immediately — /api/rider/me and the order
  // routes all require 'active', so they lose the session and the job list on
  // their next request. Any delivery they had already picked up is now in
  // limbo: reassign it from the owner panel (/api/admin/orders/[id]/reassign),
  // or the buyer waits for food nobody is carrying.
  return NextResponse.json({ rider: updated })
}

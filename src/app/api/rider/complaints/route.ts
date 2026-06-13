import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getRiderSessionFromRequest } from '@/lib/rider-session'
import { getModeratorZone } from '@/lib/moderator-session'
import { normalizeComplaintType } from '@/lib/complaints'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// GET — the signed-in rider's own complaints, newest first, each with the linked
// order's human code when there is one.
export async function GET(req: NextRequest) {
  const session = getRiderSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required.' }, { status: 401 })
  const supabase = svc()

  const { data: rows, error } = await supabase
    .from('escalations')
    .select('id, order_id, type, description, status, resolution_notes, resolved_at, created_at, raised_by_phone')
    .eq('raised_by_role', 'rider')
    .eq('raised_by_id', session.riderId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[YFF rider/complaints] query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const orderIds = (rows ?? []).map((r) => r.order_id).filter(Boolean) as string[]
  const codeById = new Map<string, string>()
  if (orderIds.length > 0) {
    const { data: orders } = await supabase.from('orders').select('id, order_code').in('id', orderIds)
    for (const o of orders ?? []) codeById.set(o.id, o.order_code ?? '')
  }
  const complaints = (rows ?? []).map((r) => ({
    ...r,
    order_code: r.order_id ? codeById.get(r.order_id) ?? null : null,
  }))
  return NextResponse.json({ complaints })
}

// POST — a rider files a complaint. Identity comes from their account (never the
// client). An optional order_code is accepted and must be a delivery assigned to
// this rider; it pins the complaint to that order's zone so the right moderator
// sees it.
//   { type, description, order_code? }
export async function POST(req: NextRequest) {
  const session = getRiderSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required.' }, { status: 401 })
  const supabase = svc()

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
  const b = body as Record<string, unknown>

  const type = normalizeComplaintType(b.type)
  const description = String(b.description ?? '').trim()
  const orderCode = String(b.order_code ?? '').trim()
  if (!description) return NextResponse.json({ error: 'Please describe the problem.' }, { status: 400 })
  if (description.length > 2000) return NextResponse.json({ error: 'Description is too long.' }, { status: 400 })

  // Identity comes from the rider account, not the request.
  const { data: me } = await supabase
    .from('delivery_boys').select('name, phone').eq('id', session.riderId).maybeSingle()
  if (!me) return NextResponse.json({ error: 'Rider account not found.' }, { status: 404 })

  // Riders aren't tied to a single zone, so default to the launch zone; if the
  // complaint is about a specific delivery, route it to that order's zone.
  let region_slug = getModeratorZone()
  let order_id: string | null = null
  if (orderCode) {
    const { data: order } = await supabase
      .from('orders')
      .select('id, farmer_id, delivery_boy_id')
      .eq('order_code', orderCode)
      .maybeSingle()
    if (!order) return NextResponse.json({ error: `No order found with code ${orderCode}.` }, { status: 400 })
    if (order.delivery_boy_id !== session.riderId) {
      return NextResponse.json({ error: 'That order is not assigned to you.' }, { status: 403 })
    }
    order_id = order.id
    if (order.farmer_id) {
      const { data: farmer } = await supabase
        .from('farmers').select('region_slug').eq('id', order.farmer_id).maybeSingle()
      if (farmer?.region_slug) region_slug = farmer.region_slug
    }
  }

  const { data: inserted, error } = await supabase
    .from('escalations')
    .insert({
      region_slug,
      type,
      description,
      order_id,
      status: 'open',
      raised_by: (me.name || 'Rider').trim(),
      raised_by_role: 'rider',
      raised_by_id: session.riderId,
      raised_by_phone: me.phone ?? null,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[YFF rider/complaints] insert failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ id: inserted.id })
}

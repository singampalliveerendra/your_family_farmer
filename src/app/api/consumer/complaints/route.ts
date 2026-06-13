import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
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

// GET — the signed-in consumer's own complaints, newest first, each with the
// linked order's human code when there is one.
export async function GET(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required.' }, { status: 401 })
  const supabase = svc()

  const { data: rows, error } = await supabase
    .from('escalations')
    .select('id, order_id, type, description, status, resolution_notes, resolved_at, created_at, raised_by_phone')
    .eq('raised_by_role', 'consumer')
    .eq('raised_by_id', session.consumerId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[YFF consumer/complaints] query failed:', error.message)
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

// POST — a consumer files a complaint. "Raised by" is taken from their account
// (never trusted from the client). An optional order_code is accepted and must
// belong to this consumer; it pins the complaint to the right zone's moderator.
//   { type, description, order_code? }
export async function POST(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)
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

  // Identity comes from the account, not the request.
  const { data: me } = await supabase
    .from('consumers_auth').select('name, phone').eq('id', session.consumerId).maybeSingle()
  const raisedByName = (me?.name || 'Consumer').trim()
  const raisedByPhone = me?.phone ?? null

  // Resolve the zone. Default to the launch zone; if tied to an order, use that
  // order's farmer's zone so the complaint lands with the right moderator.
  let region_slug = getModeratorZone()
  let order_id: string | null = null
  if (orderCode) {
    const { data: order } = await supabase
      .from('orders')
      .select('id, consumer_id, farmer_id')
      .eq('order_code', orderCode)
      .maybeSingle()
    if (!order) return NextResponse.json({ error: `No order found with code ${orderCode}.` }, { status: 400 })
    if (order.consumer_id !== session.consumerId) {
      return NextResponse.json({ error: 'That order is not on your account.' }, { status: 403 })
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
      raised_by: raisedByName,
      raised_by_role: 'consumer',
      raised_by_id: session.consumerId,
      raised_by_phone: raisedByPhone,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[YFF consumer/complaints] insert failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ id: inserted.id })
}

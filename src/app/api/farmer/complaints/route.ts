import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'
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

// GET — the signed-in farmer's own complaints, newest first.
export async function GET(req: NextRequest) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required.' }, { status: 401 })
  const supabase = svc()

  const { data: rows, error } = await supabase
    .from('escalations')
    .select('id, order_id, type, description, status, resolution_notes, resolved_at, created_at')
    .eq('raised_by_role', 'farmer')
    .eq('raised_by_id', session.farmerId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[YFF farmer/complaints] query failed:', error.message)
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

// POST — a farmer files a complaint. Identity + zone come from their farmer
// record. An optional order_code is accepted and must be one of their orders.
//   { type, description, order_code? }
export async function POST(req: NextRequest) {
  const session = getFarmerSessionFromRequest(req)
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

  const { data: me } = await supabase
    .from('farmers').select('name, phone, region_slug').eq('id', session.farmerId).maybeSingle()
  if (!me) return NextResponse.json({ error: 'Farmer account not found.' }, { status: 404 })
  const region_slug = me.region_slug || getModeratorZone()

  let order_id: string | null = null
  if (orderCode) {
    const { data: order } = await supabase
      .from('orders')
      .select('id, farmer_id')
      .eq('order_code', orderCode)
      .maybeSingle()
    if (!order) return NextResponse.json({ error: `No order found with code ${orderCode}.` }, { status: 400 })
    if (order.farmer_id !== session.farmerId) {
      return NextResponse.json({ error: 'That order is not one of yours.' }, { status: 403 })
    }
    order_id = order.id
  }

  const { data: inserted, error } = await supabase
    .from('escalations')
    .insert({
      region_slug,
      type,
      description,
      order_id,
      status: 'open',
      raised_by: (me.name || 'Farmer').trim(),
      raised_by_role: 'farmer',
      raised_by_id: session.farmerId,
      raised_by_phone: me.phone ?? null,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[YFF farmer/complaints] insert failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ id: inserted.id })
}

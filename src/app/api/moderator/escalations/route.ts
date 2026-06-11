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

const TYPES = ['delivery_delay', 'quality_complaint', 'payment_issue', 'other'] as const

// GET — every escalation in the moderator's zone, newest first, with the linked
// order's human code (e.g. "Order #YFF-1042") when there is one.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone()
  const supabase = svc()

  const { data: rows, error } = await supabase
    .from('escalations')
    .select('id, order_id, type, description, raised_by, raised_by_role, raised_by_phone, status, resolution_notes, resolved_at, created_at')
    .eq('region_slug', zone)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[YFF moderator/escalations] query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Attach order codes for any escalations that reference an order.
  const orderIds = (rows ?? []).map((r) => r.order_id).filter(Boolean) as string[]
  const codeById = new Map<string, string>()
  if (orderIds.length > 0) {
    const { data: orders } = await supabase.from('orders').select('id, order_code').in('id', orderIds)
    for (const o of orders ?? []) codeById.set(o.id, o.order_code ?? '')
  }
  const escalations = (rows ?? []).map((r) => ({ ...r, order_code: r.order_id ? codeById.get(r.order_id) ?? null : null }))
  return NextResponse.json({ escalations })
}

// POST — log a complaint that came in by phone/WhatsApp. Optionally tie it to an
// order via its order_code (must be an order from a farmer in this zone).
export async function POST(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone()
  const supabase = svc()

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
  const b = body as Record<string, unknown>

  const typeRaw = String(b.type ?? 'other')
  const type = (TYPES as readonly string[]).includes(typeRaw) ? typeRaw : 'other'
  const description = String(b.description ?? '').trim()
  let raised_by = String(b.raised_by ?? '').trim() || null
  let raised_by_phone: string | null = null
  const orderCode = String(b.order_code ?? '').trim()
  if (!description) return NextResponse.json({ error: 'Describe the complaint.' }, { status: 400 })

  // Resolve an optional order_code to an order in this zone. When one is given,
  // the buyer's name and phone come straight off the order so "raised by" is
  // auto-filled and the moderator always has a number to call back on.
  let order_id: string | null = null
  if (orderCode) {
    const { data: order } = await supabase
      .from('orders')
      .select('id, farmer_id, buyer_name, buyer_phone')
      .eq('order_code', orderCode)
      .maybeSingle()
    if (order?.farmer_id) {
      const { data: farmer } = await supabase
        .from('farmers').select('region_slug').eq('id', order.farmer_id).maybeSingle()
      if (farmer?.region_slug !== zone) {
        return NextResponse.json({ error: 'That order is not in your zone.' }, { status: 400 })
      }
      order_id = order.id
      raised_by_phone = order.buyer_phone ?? null
      if (!raised_by) raised_by = order.buyer_name?.trim() || null
    } else {
      return NextResponse.json({ error: `No order found with code ${orderCode}.` }, { status: 400 })
    }
  }

  const { data: inserted, error } = await supabase
    .from('escalations')
    .insert({ region_slug: zone, type, description, raised_by, raised_by_role: 'moderator', raised_by_phone, order_id, status: 'open' })
    .select('id')
    .single()
  if (error) {
    console.error('[YFF moderator/escalations] insert failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ id: inserted.id })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Buyer switches an unpaid UPI order to Cash on Delivery. Besides the
// ownership check, we re-verify the farmer still accepts COD — the browser
// used to flip this field directly with no such guard.
export async function POST(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const rawIds = (body as { orderIds?: unknown }).orderIds
  const orderIds = Array.isArray(rawIds) ? rawIds.map((x) => String(x)) : []
  if (orderIds.length === 0) return NextResponse.json({ error: 'Missing order ids.' }, { status: 400 })
  if (orderIds.length > 50) return NextResponse.json({ error: 'Too many orders.' }, { status: 400 })
  for (const id of orderIds) {
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: orders } = await supabase
    .from('orders')
    .select('id, consumer_id, farmer_id')
    .in('id', orderIds)

  if (!orders || orders.length !== orderIds.length) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }
  if (orders.some((o) => o.consumer_id !== session.consumerId)) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }

  // Every farmer involved must currently accept COD.
  const farmerIds = [...new Set(orders.map((o) => o.farmer_id).filter(Boolean))]
  const { data: farmers } = await supabase
    .from('farmers')
    .select('id, cod_enabled')
    .in('id', farmerIds)

  const codById = new Map((farmers ?? []).map((f) => [f.id, f.cod_enabled === true]))
  if (farmerIds.some((fid) => !codById.get(fid))) {
    return NextResponse.json({ error: 'This farmer is not accepting Cash on Delivery.' }, { status: 409 })
  }

  const { error } = await supabase
    .from('orders')
    .update({ payment_method: 'cod', payment_status: 'pending' })
    .in('id', orderIds)

  if (error) {
    console.error('[YFF] switch-cod update failed:', error.message)
    return NextResponse.json({ error: 'Could not switch to Cash on Delivery.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

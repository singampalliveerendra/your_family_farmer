import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Buyer claims they have paid (UPI flow). This only flips payment_status to
// `pending_confirmation` — the farmer still verifies before fulfilment. The
// consumer can only touch orders that belong to their own session.
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

  const utr = String((body as { utr?: unknown }).utr ?? '').trim().slice(0, 40)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Confirm every order belongs to this consumer — refuse the whole batch if not.
  const { data: orders } = await supabase
    .from('orders')
    .select('id, consumer_id')
    .in('id', orderIds)

  if (!orders || orders.length !== orderIds.length) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }
  if (orders.some((o) => o.consumer_id !== session.consumerId)) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }

  const update: Record<string, string> = { payment_status: 'pending_confirmation' }
  if (utr) update.utr_number = utr

  const { error } = await supabase.from('orders').update(update).in('id', orderIds)
  if (error) {
    console.error('[YFF] payment-claim update failed:', error.message)
    return NextResponse.json({ error: 'Could not record payment. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

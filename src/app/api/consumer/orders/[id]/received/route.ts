import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Buyer confirms they received a shipped courier order. Only allowed once the
// farmer has marked it shipped (shipped_at set). Stamps received_at, which
// resolves the order and moves it to history on both sides.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: order, error: loadErr } = await supabase
    .from('orders')
    .select('id, consumer_id, status, delivery_type, shipped_at, received_at')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.consumer_id !== session.consumerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  if (order.delivery_type !== 'courier') {
    return NextResponse.json({ error: 'Only a courier order is confirmed this way.' }, { status: 409 })
  }
  if (!order.shipped_at) {
    return NextResponse.json({ error: 'This order has not been shipped yet.' }, { status: 409 })
  }
  if (order.received_at) {
    return NextResponse.json({ error: 'This order is already marked received.' }, { status: 409 })
  }

  const { data: updated, error: updErr } = await supabase
    .from('orders')
    .update({ received_at: new Date().toISOString() })
    .eq('id', id)
    .eq('consumer_id', session.consumerId)
    .not('shipped_at', 'is', null)
    .is('received_at', null)
    .select('id, received_at')

  if (updErr) {
    console.error('[YFF consumer/received] update failed:', updErr.message)
    return NextResponse.json({ error: 'Could not confirm receipt. Please try again.' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Could not confirm receipt. Refresh and try again.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, received_at: updated[0].received_at })
}

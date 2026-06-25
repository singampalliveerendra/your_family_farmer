import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Buyer confirms delivery themselves — the farmer no longer closes orders. For
// every farmer-fulfilled type the farmer first marks it shipped (shipped_at), then
// the buyer taps "Delivered" here:
//   • self-pickup → collected_at
//   • courier / farmer-shipped home delivery → received_at
// Rider-driven home deliveries never set shipped_at (they use delivered_at) and
// are closed by the rider, so they're naturally excluded here. Either stamp
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
    .select('id, consumer_id, status, delivery_type, shipped_at, collected_at, received_at')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.consumer_id !== session.consumerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  if (order.status !== 'approved') {
    return NextResponse.json({ error: 'This order is not ready to confirm.' }, { status: 409 })
  }
  if (!order.shipped_at) {
    return NextResponse.json({ error: 'This order has not been shipped yet.' }, { status: 409 })
  }

  // Self-pickup: the buyer confirms collection → collected_at.
  const isPickup = order.delivery_type === 'self_pickup' || !order.delivery_type
  if (isPickup) {
    if (order.collected_at) {
      return NextResponse.json({ error: 'This order is already marked picked up.' }, { status: 409 })
    }
    const { data: updated, error: updErr } = await supabase
      .from('orders')
      .update({ collected_at: new Date().toISOString() })
      .eq('id', id)
      .eq('consumer_id', session.consumerId)
      .eq('status', 'approved')
      .not('shipped_at', 'is', null)
      .is('collected_at', null)
      .select('id, collected_at')

    if (updErr) {
      console.error('[YFF consumer/received] pickup update failed:', updErr.message)
      return NextResponse.json({ error: 'Could not confirm pickup. Please try again.' }, { status: 500 })
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Could not confirm pickup. Refresh and try again.' }, { status: 409 })
    }
    return NextResponse.json({ ok: true, collected_at: updated[0].collected_at })
  }

  // Courier / farmer-shipped home delivery: the buyer confirms receipt →
  // received_at, but only once the farmer has marked it shipped.
  if (order.delivery_type !== 'courier' && order.delivery_type !== 'home_delivery') {
    return NextResponse.json({ error: 'This order is not confirmed this way.' }, { status: 409 })
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

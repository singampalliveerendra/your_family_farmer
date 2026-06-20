import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Farmer closes out a shipped order himself — used when the farmer self-delivers
// (or couriers) the order and hands it to the buyer, so he doesn't have to wait
// for the buyer to tap "Received". Only valid on an order he already marked
// shipped (shipped_at set) that is NOT in the rider flow. Stamps received_at,
// which resolves the order and moves it to history on both sides.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: order, error: loadErr } = await supabase
    .from('orders')
    .select('id, farmer_id, status, delivery_type, delivery_status, shipped_at, received_at')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.farmer_id !== session.farmerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  // A home delivery handled by a rider is closed at the door by the rider.
  if (order.delivery_type === 'home_delivery'
    && order.delivery_status != null
    && order.delivery_status !== 'unassigned') {
    return NextResponse.json({ error: 'A rider is handling this delivery.' }, { status: 409 })
  }
  if (!order.shipped_at) {
    return NextResponse.json({ error: 'Mark the order shipped before completing it.' }, { status: 409 })
  }
  if (order.received_at) {
    return NextResponse.json({ error: 'This order is already completed.' }, { status: 409 })
  }

  const { data: updated, error: updErr } = await supabase
    .from('orders')
    .update({ received_at: new Date().toISOString() })
    .eq('id', id)
    .eq('farmer_id', session.farmerId)
    .not('shipped_at', 'is', null)
    .is('received_at', null)
    .select('id, received_at')

  if (updErr) {
    console.error('[YFF farmer/delivered] update failed:', updErr.message)
    return NextResponse.json({ error: 'Could not complete the order. Please try again.' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Could not complete the order. Refresh and try again.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, received_at: updated[0].received_at })
}

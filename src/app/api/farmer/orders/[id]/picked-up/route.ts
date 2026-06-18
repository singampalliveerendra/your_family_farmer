import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Farmer marks an order as collected with a single tap — used when the buyer
// comes to the farm and takes the produce. The farmer can choose this on any
// farmer-fulfilled order (self-pickup or courier); picking "Picked Up" commits
// the order to the pickup flow, so we also set delivery_type = 'self_pickup'.
// Unlike the OTP-based confirm-pickup route, this requires no code from the
// buyer; the farmer is trusted to mark their own pickup. Stamps collected_at,
// which resolves the order and moves it from Active Orders to Order History.
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
    .select('id, farmer_id, status, delivery_type, collected_at, shipped_at')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.farmer_id !== session.farmerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  // Rider deliveries are closed at the door, not picked up at the farm.
  if (order.delivery_type === 'home_delivery') {
    return NextResponse.json({ error: 'A home-delivery order is closed by the rider, not picked up here.' }, { status: 409 })
  }
  if (order.status !== 'approved') {
    return NextResponse.json({ error: 'Only an approved order can be marked picked up.' }, { status: 409 })
  }
  // Once shipped, the order belongs to the courier flow and is closed by the
  // buyer's "Received" — it can't switch back to a farm pickup.
  if (order.shipped_at) {
    return NextResponse.json({ error: 'This order was already shipped.' }, { status: 409 })
  }
  if (order.collected_at) {
    return NextResponse.json({ error: 'This order is already marked picked up.' }, { status: 409 })
  }

  const { data: updated, error: updErr } = await supabase
    .from('orders')
    .update({ collected_at: new Date().toISOString(), delivery_type: 'self_pickup' })
    .eq('id', id)
    .eq('farmer_id', session.farmerId)
    .eq('status', 'approved')
    .is('collected_at', null)
    .is('shipped_at', null)
    .select('id, collected_at')

  if (updErr) {
    console.error('[YFF farmer/picked-up] update failed:', updErr.message)
    return NextResponse.json({ error: 'Could not mark picked up. Please try again.' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Could not mark picked up. Refresh and try again.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, collected_at: updated[0].collected_at })
}

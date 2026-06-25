import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Farmer marks an order as shipped — used when they post/hand it off to the
// buyer themselves. Valid on any farmer-fulfilled order: self-pickup, courier,
// or a home delivery that is NOT in the rider flow (no rider assigned). Stamps
// shipped_at, so the buyer sees the Shipped → Delivered timeline. The order
// STAYS in Active Orders (not yet resolved) until the buyer confirms via the
// consumer "Delivered" route (which stamps received_at, or collected_at for a
// self-pickup). Shipping is a trust-based marker — it does NOT close the order,
// so no handover code is needed here; only the buyer's confirmation does.
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
    .select('id, farmer_id, status, delivery_type, delivery_status, shipped_at, collected_at')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.farmer_id !== session.farmerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  // A home delivery that's already with a rider is closed at the door by the
  // rider, not shipped by the farmer. Home deliveries with no rider assigned are
  // farmer-fulfilled, so the farmer ships them like a courier order.
  if (order.delivery_type === 'home_delivery'
    && order.delivery_status != null
    && order.delivery_status !== 'unassigned') {
    return NextResponse.json({ error: 'A rider is handling this delivery.' }, { status: 409 })
  }
  if (order.status !== 'approved') {
    return NextResponse.json({ error: 'Confirm the order before marking it shipped.' }, { status: 409 })
  }
  if (order.collected_at) {
    return NextResponse.json({ error: 'This order was already picked up.' }, { status: 409 })
  }
  if (order.shipped_at) {
    return NextResponse.json({ error: 'This order is already marked shipped.' }, { status: 409 })
  }

  const { data: updated, error: updErr } = await supabase
    .from('orders')
    .update({ shipped_at: new Date().toISOString() })
    .eq('id', id)
    .eq('farmer_id', session.farmerId)
    .eq('status', 'approved')
    .is('shipped_at', null)
    .is('collected_at', null)
    .select('id, shipped_at')

  if (updErr) {
    console.error('[YFF farmer/ship] update failed:', updErr.message)
    return NextResponse.json({ error: 'Could not mark shipped. Please try again.' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Could not mark shipped. Refresh and try again.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, shipped_at: updated[0].shipped_at })
}

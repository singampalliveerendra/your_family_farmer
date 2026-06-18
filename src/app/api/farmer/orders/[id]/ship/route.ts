import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Farmer marks an order as shipped — used when they hand the parcel to a
// courier or post it themselves. The farmer can choose this on any
// farmer-fulfilled order (self-pickup or courier); picking "Shipped" commits
// the order to the courier flow, so we also set delivery_type = 'courier' to
// give the buyer the Shipped → Received timeline. Stamps shipped_at; the order
// STAYS in Active Orders (not yet resolved) until the buyer confirms receipt
// via the consumer "Received" route, which stamps received_at.
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
    .select('id, farmer_id, status, delivery_type, shipped_at, collected_at')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.farmer_id !== session.farmerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  // Rider deliveries are closed at the door, not shipped by the farmer.
  if (order.delivery_type === 'home_delivery') {
    return NextResponse.json({ error: 'A home-delivery order is closed by the rider, not shipped.' }, { status: 409 })
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
    .update({ shipped_at: new Date().toISOString(), delivery_type: 'courier' })
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

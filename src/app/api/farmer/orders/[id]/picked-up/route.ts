import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Farmer marks a self-pickup order as collected with a single tap — used when
// the buyer comes to the farm and takes the produce. Unlike the OTP-based
// confirm-pickup route, this requires no code from the buyer; the farmer is
// trusted to mark their own pickup. Stamps collected_at, which moves the order
// from Active Orders to Order History.
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
    .select('id, farmer_id, status, delivery_type, collected_at')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.farmer_id !== session.farmerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  // Only self-pickup orders are completed this way. Rider deliveries are closed
  // at the door; courier orders are closed by the buyer tapping "Received".
  if (order.delivery_type !== 'self_pickup') {
    return NextResponse.json({ error: 'Only a self-pickup order can be marked picked up here.' }, { status: 409 })
  }
  if (order.status !== 'approved') {
    return NextResponse.json({ error: 'Only an approved order can be marked picked up.' }, { status: 409 })
  }
  if (order.collected_at) {
    return NextResponse.json({ error: 'This order is already marked picked up.' }, { status: 409 })
  }

  const { data: updated, error: updErr } = await supabase
    .from('orders')
    .update({ collected_at: new Date().toISOString() })
    .eq('id', id)
    .eq('farmer_id', session.farmerId)
    .eq('status', 'approved')
    .is('collected_at', null)
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

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const riderId = String((body && (body as { riderId?: unknown }).riderId) ?? '')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Confirm the order is a home delivery that's still in flight. We won't
  // reassign a delivered order.
  const { data: order } = await supabase
    .from('orders')
    .select('id, delivery_type, delivery_status, status')
    .eq('id', id)
    .maybeSingle()

  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.delivery_type !== 'home_delivery') {
    return NextResponse.json({ error: 'Not a delivery order.' }, { status: 400 })
  }
  if (order.delivery_status === 'delivered') {
    return NextResponse.json({ error: 'Order is already delivered.' }, { status: 409 })
  }

  // Special case: empty riderId = un-assign. Useful when the assigned rider
  // is unreachable and the admin wants to release the order back to the
  // available queue.
  if (!riderId) {
    const { error } = await supabase
      .from('orders')
      .update({
        delivery_boy_id: null,
        delivery_status: 'unassigned',
        assigned_at: null,
        picked_up_at: null,
        out_for_delivery_at: null,
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (!UUID_RE.test(riderId)) return NextResponse.json({ error: 'Invalid rider id.' }, { status: 400 })

  const { data: rider } = await supabase
    .from('delivery_boys')
    .select('id, status')
    .eq('id', riderId)
    .maybeSingle()
  if (!rider) return NextResponse.json({ error: 'Rider not found.' }, { status: 404 })
  if (rider.status !== 'active') return NextResponse.json({ error: 'Rider is not active.' }, { status: 409 })

  const { error } = await supabase
    .from('orders')
    .update({
      delivery_boy_id: riderId,
      delivery_status: 'assigned',
      assigned_at: new Date().toISOString(),
      // Wipe later-stage timestamps if reassigning from a later state — the
      // new rider starts from scratch.
      picked_up_at: null,
      out_for_delivery_at: null,
    })
    .eq('id', id)

  if (error) {
    console.error('[YFF admin/reassign] update failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

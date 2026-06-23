import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Farmer confirms they personally handed a home-delivery / courier order to the
// buyer at the door. Just like self-pickup (confirm-pickup) and the rider
// door-handover, the buyer reads the 4-digit code off their order page and the
// farmer types it here — the code is never sent to the farmer's browser, so it
// must come from the real customer. A correct code stamps received_at (and a
// shipped_at if it was never set), which resolves the order immediately; the
// buyer does NOT need to separately confirm "Received".
//
// This is only for orders the FARMER delivers himself. A rider-driven home
// delivery is closed by the rider at the door, not here.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  // Anti-guessing: 6 attempts per farmer+order per 10 min (4-digit code).
  if (!rateLimit(`farmer-deliver-otp:${session.farmerId}:${id}`, 6, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many wrong codes. Please check with the customer.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const otp = String((body && (body as { otp?: unknown }).otp) ?? '').trim()
  if (!/^\d{4}$/.test(otp)) {
    return NextResponse.json({ error: 'Enter the 4-digit code from the customer.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: order, error: loadErr } = await supabase
    .from('orders')
    .select('id, farmer_id, status, delivery_type, delivery_status, delivery_boy_id, handover_otp, shipped_at, received_at')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.farmer_id !== session.farmerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  // Self-pickup is closed via confirm-pickup, not here.
  if (order.delivery_type === 'self_pickup' || !order.delivery_type) {
    return NextResponse.json({ error: 'This is a pickup order — mark it Picked Up instead.' }, { status: 409 })
  }
  // A rider-driven home delivery is closed by the rider at the door.
  const riderAssigned =
    order.delivery_type === 'home_delivery'
    && (!!order.delivery_boy_id || (order.delivery_status != null && order.delivery_status !== 'unassigned'))
  if (riderAssigned) {
    return NextResponse.json({ error: 'A delivery agent is assigned — they confirm this at the door.' }, { status: 409 })
  }
  if (order.status !== 'approved') {
    return NextResponse.json({ error: 'Only an approved order can be marked delivered.' }, { status: 409 })
  }
  if (order.received_at) {
    return NextResponse.json({ error: 'This order is already marked delivered.' }, { status: 409 })
  }
  if (!order.handover_otp || !safeEqual(order.handover_otp, otp)) {
    return NextResponse.json({ error: 'Wrong code. Ask the customer to read it again.' }, { status: 401 })
  }

  const now = new Date().toISOString()
  const { data: updated, error: updErr } = await supabase
    .from('orders')
    .update({ received_at: now, ...(order.shipped_at ? {} : { shipped_at: now }) })
    .eq('id', id)
    .eq('farmer_id', session.farmerId)
    .eq('status', 'approved')
    .is('received_at', null)
    .select('id, received_at, shipped_at')

  if (updErr) {
    console.error('[YFF farmer/deliver] update failed:', updErr.message)
    return NextResponse.json({ error: 'Could not confirm delivery. Please try again.' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Could not confirm delivery. Refresh and try again.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, received_at: updated[0].received_at, shipped_at: updated[0].shipped_at })
}

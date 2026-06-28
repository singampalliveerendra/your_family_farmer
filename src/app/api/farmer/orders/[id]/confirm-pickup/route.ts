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

// Farmer confirms a self-pickup order was collected. The customer reads the
// 4-digit handover code off their order page; the farmer types it here. A
// match stamps collected_at and resolves the order. The code is never sent to
// the farmer's browser — it must come from the buyer, so a self-pickup can't be
// closed without the customer actually being present.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  // Anti-guessing: 6 attempts per farmer+order per 10 min. The code is only
  // 4 digits, so after that the farmer should re-check with the customer.
  if (!rateLimit(`farmer-pickup-otp:${session.farmerId}:${id}`, 6, 10 * 60 * 1000)) {
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
    .select('id, farmer_id, status, delivery_type, handover_otp, collected_at')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.farmer_id !== session.farmerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  // Home-delivery orders are confirmed by the rider at the door, not here.
  if (order.delivery_type === 'home_delivery') {
    return NextResponse.json({ error: 'This is a home-delivery order — the delivery agent confirms it.' }, { status: 409 })
  }
  if (order.status !== 'approved') {
    return NextResponse.json({ error: 'Only an approved order can be marked collected.' }, { status: 409 })
  }
  if (order.collected_at) {
    return NextResponse.json({ error: 'This order is already marked collected.' }, { status: 409 })
  }
  if (!order.handover_otp || !safeEqual(order.handover_otp, otp)) {
    return NextResponse.json({ error: 'Wrong code. Ask the customer to read it again.' }, { status: 401 })
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
    console.error('[YFF farmer/confirm-pickup] update failed:', updErr.message)
    return NextResponse.json({ error: 'Could not confirm pickup. Please try again.' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Could not confirm pickup. Refresh and try again.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, collected_at: updated[0].collected_at })
}

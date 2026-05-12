import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getRiderSessionFromRequest } from '@/lib/rider-session'
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  const session = getRiderSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not logged in.' }, { status: 401 })

  // Anti-guessing: 6 OTP attempts per rider+order per 10 min. After that, the
  // rider needs to call the owner — the OTP is only 4 digits.
  if (!rateLimit(`rider-otp:${session.riderId}:${id}`, 6, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many wrong codes. Please contact the owner.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const otp = String((body && (body as { otp?: unknown }).otp) ?? '').trim()
  if (!/^\d{4}$/.test(otp)) return NextResponse.json({ error: 'Enter the 4-digit code from the customer.' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: rider } = await supabase
    .from('delivery_boys')
    .select('id, status')
    .eq('id', session.riderId)
    .maybeSingle()
  if (!rider || rider.status !== 'active') {
    return NextResponse.json({ error: 'Account not active.' }, { status: 403 })
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, delivery_boy_id, delivery_status, handover_otp')
    .eq('id', id)
    .maybeSingle()

  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.delivery_boy_id !== session.riderId) {
    return NextResponse.json({ error: 'Not your delivery.' }, { status: 403 })
  }
  if (order.delivery_status !== 'out_for_delivery') {
    return NextResponse.json({ error: 'Mark the order as out for delivery first.' }, { status: 409 })
  }
  if (!order.handover_otp || !safeEqual(order.handover_otp, otp)) {
    return NextResponse.json({ error: 'Wrong code. Ask the customer to read it again.' }, { status: 401 })
  }

  const { data: updated, error } = await supabase
    .from('orders')
    .update({ delivery_status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', id)
    .eq('delivery_boy_id', session.riderId)
    .eq('delivery_status', 'out_for_delivery')
    .select('id')

  if (error) {
    console.error('[YFF rider/deliver] update failed:', error.message)
    return NextResponse.json({ error: 'Could not mark delivered.' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Could not mark delivered. Refresh and try again.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}

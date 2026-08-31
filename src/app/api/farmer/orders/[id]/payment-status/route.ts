import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The farmer confirms (or rejects) a manual UPI payment the buyer claimed.
//
// This is the single most abusable write in the app and it used to happen from
// the browser: `orders.update({ payment_status: 'completed' })` under a policy
// that allowed it on ANY row. Anyone could mark any order paid. It now requires
// the farmer's session cookie and is scoped to their own rows.
//
// 'completed' additionally flips status → 'approved', so it carries the same
// `status = 'pending'` guard as /approve: a buyer-cancelled order must not be
// resurrected by the farmer confirming a payment that was already refunded.
const ALLOWED = ['completed', 'failed', 'pending'] as const
type Allowed = (typeof ALLOWED)[number]

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  const body = await req.json().catch(() => null) as { status?: unknown } | null
  const status = String(body?.status ?? '') as Allowed
  if (!ALLOWED.includes(status)) {
    return NextResponse.json({ error: 'Invalid payment status.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // A farmer may only settle a payment the buyer actually claimed, or one still
  // awaiting payment. Razorpay-confirmed rows ('paid', 'deposit_paid') are the
  // payment gateway's to own — letting the farmer overwrite those would let a
  // real payment be marked 'failed' after the fact.
  const { data: order, error: loadErr } = await supabase
    .from('orders')
    .select('id, farmer_id, payment_method, payment_status')
    .eq('id', id)
    .eq('farmer_id', session.farmerId)
    .maybeSingle()

  if (loadErr) {
    console.error('[YFF farmer/payment-status] load failed:', loadErr.message)
    return NextResponse.json({ error: 'Could not load the order.' }, { status: 500 })
  }
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.payment_method === 'razorpay') {
    return NextResponse.json(
      { error: 'This order was paid online — its payment status is set by the payment gateway.' },
      { status: 409 },
    )
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { payment_status: status }
  if (status === 'completed') {
    patch.status = 'approved'
    patch.paid_at = now
    patch.confirmed_at = now
  }

  let query = supabase
    .from('orders')
    .update(patch)
    .eq('id', id)
    .eq('farmer_id', session.farmerId)
  if (status === 'completed') query = query.eq('status', 'pending')

  const { data, error } = await query.select('id, status, payment_status, paid_at, confirmed_at')

  if (error) {
    console.error('[YFF farmer/payment-status] update failed:', error.message)
    return NextResponse.json({ error: 'Could not update. Please try again.' }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: 'This order can no longer be approved — the buyer may have cancelled it.' },
      { status: 409 },
    )
  }

  return NextResponse.json({ ok: true, order: data[0] })
}

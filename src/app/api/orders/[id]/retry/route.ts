import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: order } = await supabase
    .from('orders')
    .select('id, consumer_id, status, payment_method')
    .eq('id', id)
    .maybeSingle()

  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.consumer_id !== session.consumerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  if (order.status === 'declined') {
    return NextResponse.json({ error: 'Order was declined and cannot be retried.' }, { status: 409 })
  }
  if (order.payment_method !== 'upi') {
    return NextResponse.json({ error: 'Only UPI orders can be retried.' }, { status: 400 })
  }

  const { error: updErr } = await supabase
    .from('orders')
    .update({ payment_status: 'pending', payment_proof_path: null })
    .eq('id', id)

  if (updErr) {
    return NextResponse.json({ error: 'Could not retry. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

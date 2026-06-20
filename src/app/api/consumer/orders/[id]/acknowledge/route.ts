import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Buyer acknowledges a declined or cancelled order. This stamps acknowledged_at,
// which moves the order out of the buyer's Active list and into History. Until
// they tap Acknowledge the order stays active, so a farmer decline / cancel
// never silently vanishes into history.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: order, error: loadErr } = await supabase
    .from('orders')
    .select('id, consumer_id, status, acknowledged_at')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.consumer_id !== session.consumerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  // Only declined/cancelled orders can be acknowledged — that's the only state
  // where it's needed.
  if (order.status !== 'declined' && order.status !== 'cancelled') {
    return NextResponse.json({ error: 'This order does not need acknowledgement.' }, { status: 409 })
  }
  // Idempotent: already acknowledged is a no-op success.
  if (order.acknowledged_at) return NextResponse.json({ ok: true, acknowledged_at: order.acknowledged_at })

  const { data: updated, error: updErr } = await supabase
    .from('orders')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', id)
    .eq('consumer_id', session.consumerId)
    .in('status', ['declined', 'cancelled'])
    .select('id, acknowledged_at')

  if (updErr) {
    console.error('[YFF consumer/acknowledge] update failed:', updErr.message)
    return NextResponse.json({ error: 'Could not update. Please try again.' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Could not update. Refresh and try again.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, acknowledged_at: updated[0].acknowledged_at })
}

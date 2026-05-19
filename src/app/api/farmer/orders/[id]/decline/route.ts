import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Decline a pending order and return the reserved stock. Restock happens only
// when the order is still `pending`, so a double-submit can't inflate stock.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const reason = String((body && (body as { reason?: unknown }).reason) ?? '').trim().slice(0, 300)
  if (!reason) return NextResponse.json({ error: 'A decline reason is required.' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Load the order under the ownership gate.
  const { data: order } = await supabase
    .from('orders')
    .select('id, produce_listing_id, quantity, status')
    .eq('id', id)
    .eq('farmer_id', session.farmerId)
    .maybeSingle()

  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.status !== 'pending') {
    return NextResponse.json({ error: 'This order is no longer pending.' }, { status: 409 })
  }

  // Restock first — if the status update below fails we'd rather over-credit
  // stock than lose it. Only safe because we confirmed status === 'pending'.
  if (order.produce_listing_id && typeof order.quantity === 'number' && order.quantity > 0) {
    const { error: rpcErr } = await supabase.rpc('increment_stock', {
      p_listing_id: order.produce_listing_id,
      p_qty: order.quantity,
    })
    if (rpcErr) console.error('[YFF] restock on decline failed:', rpcErr.message)
  }

  const { error } = await supabase
    .from('orders')
    .update({ status: 'declined', decline_reason: reason })
    .eq('id', id)
    .eq('farmer_id', session.farmerId)
    .eq('status', 'pending')

  if (error) {
    console.error('[YFF] decline order failed:', error.message)
    return NextResponse.json({ error: 'Could not decline order.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Online payment failed or the buyer closed Checkout without paying. The orders
// were placed as `pending` (and their stock reserved) BEFORE Checkout opened, so
// here we undo that: cancel the still-unpaid rows and return the reserved stock,
// leaving no half-made order behind. Only the buyer's own orders, only while
// still pending-and-unpaid (so a genuinely paid order can never be wiped by a
// late/duplicate abandon call). Online pay is gated to logged-in buyers, so a
// session is always present.
export async function POST(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const rawIds = (body as { orderIds?: unknown } | null)?.orderIds
  const orderIds = Array.isArray(rawIds) ? rawIds.map((x) => String(x)) : []
  if (orderIds.length === 0) return NextResponse.json({ error: 'Missing order ids.' }, { status: 400 })
  if (orderIds.length > 50) return NextResponse.json({ error: 'Too many orders.' }, { status: 400 })
  for (const id of orderIds) {
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: orders, error: loadErr } = await supabase
    .from('orders')
    .select('id, consumer_id, status, payment_status, quantity, produce_listing_id, harvest_id')
    .in('id', orderIds)
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })

  let cancelled = 0
  for (const order of orders ?? []) {
    // Skip anything that isn't this buyer's, isn't still pending, or already
    // got paid — we must never cancel an order the buyer actually paid for.
    if (order.consumer_id !== session.consumerId) continue
    if (order.status !== 'pending') continue
    if (order.payment_status === 'paid') continue

    // Return the reserved stock before flipping the row, mirroring a cancel.
    // Harvest orders return the harvest's stock; legacy orders the listing's.
    if (order.quantity != null && order.quantity > 0) {
      try {
        if (order.harvest_id) {
          await supabase.rpc('increment_harvest_stock', { p_harvest_id: order.harvest_id, p_qty: order.quantity })
        } else if (order.produce_listing_id) {
          await supabase.rpc('increment_stock', { p_listing_id: order.produce_listing_id, p_qty: order.quantity })
        }
      } catch (e) {
        console.error('[YFF] restock on abandon failed:', e)
      }
    }

    const { error: updErr } = await supabase
      .from('orders')
      .update({ status: 'cancelled', decline_reason: 'Payment not completed' })
      .eq('id', order.id)
    if (updErr) {
      console.error('[YFF] abandon update failed:', updErr.message)
      continue
    }
    cancelled += 1
  }

  return NextResponse.json({ ok: true, cancelled })
}

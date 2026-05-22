import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { refundPayment } from '@/lib/razorpay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CANCEL_WINDOW_MS = 30 * 60 * 1000 // 30 minutes

// Buyer cancels their own order. Allowed only while it is still pending (the
// farmer hasn't confirmed) AND within 30 minutes of placing it. Returns the
// stock and, for a paid order, issues a real Razorpay refund — same machinery
// as a farmer decline, but initiated by the buyer.
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
    .select('id, consumer_id, status, quantity, total_price, produce_listing_id, payment_status, razorpay_payment_id, created_at, order_code')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.consumer_id !== session.consumerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  if (order.status !== 'pending') {
    return NextResponse.json(
      { error: 'This order can no longer be cancelled — the farmer has already responded.' },
      { status: 409 },
    )
  }
  const placedMs = order.created_at ? new Date(order.created_at).getTime() : 0
  if (!placedMs || Date.now() - placedMs > CANCEL_WINDOW_MS) {
    return NextResponse.json(
      { error: 'The 30-minute cancellation window has passed. Please contact the farmer.' },
      { status: 409 },
    )
  }

  // Return the reserved stock.
  if (order.produce_listing_id && order.quantity != null && order.quantity > 0) {
    try {
      await supabase.rpc('increment_stock', {
        p_listing_id: order.produce_listing_id,
        p_qty: order.quantity,
      })
    } catch (e) {
      console.error('[YFF] restock on cancel failed:', e)
    }
  }

  const update: Record<string, unknown> = { status: 'cancelled', decline_reason: 'Cancelled by buyer' }

  const paidByRazorpay = order.payment_status === 'paid' && !!order.razorpay_payment_id
  const paidByOther =
    order.payment_status === 'completed' ||
    order.payment_status === 'payment_claimed' ||
    order.payment_status === 'pending_confirmation'

  if (paidByRazorpay) {
    const amountPaise = Math.round((Number(order.total_price) || 0) * 100)
    if (amountPaise > 0) {
      try {
        const refund = await refundPayment({
          paymentId: order.razorpay_payment_id as string,
          amountPaise,
          notes: { order_code: order.order_code ?? '', order_id: order.id, reason: 'buyer_cancel' },
        })
        update.refund_id = refund.id
        update.refund_status = refund.status ?? 'processed'
        update.refund_amount = Math.round(refund.amountPaise / 100)
        update.refunded_at = new Date().toISOString()
      } catch (e) {
        console.error('[YFF] razorpay refund on cancel failed:', e)
        return NextResponse.json(
          { error: 'Could not issue the refund. The order was not cancelled — please try again.' },
          { status: 502 },
        )
      }
    }
  } else if (paidByOther) {
    update.refund_status = 'initiated'
  }

  const { error: updErr } = await supabase.from('orders').update(update).eq('id', id)
  if (updErr) {
    console.error('[YFF] cancel update failed:', updErr.message)
    return NextResponse.json({ error: 'Could not cancel the order. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, refunded: !!update.refund_id })
}

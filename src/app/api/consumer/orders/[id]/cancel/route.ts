import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { refundPayment } from '@/lib/razorpay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Buyer cancels their own order. Allowed any time UP TO the point the order is
// shipped or handed over — i.e. while still pending OR approved-and-awaiting.
// There is no time window; only the order's progress decides. Returns the stock
// and, for a paid order, issues a real Razorpay refund — same machinery as a
// farmer decline, but initiated by the buyer.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  // Optional reason the buyer gave for cancelling.
  const body = await req.json().catch(() => null)
  const reason = String((body as { reason?: unknown } | null)?.reason ?? '').trim().slice(0, 300)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: order, error: loadErr } = await supabase
    .from('orders')
    .select('id, consumer_id, status, quantity, total_price, platform_fee, produce_listing_id, payment_status, razorpay_payment_id, created_at, order_code, shipped_at, collected_at, received_at, delivery_status')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.consumer_id !== session.consumerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  // Cancellable while still pending or approved-and-awaiting. Blocked once the
  // order is shipped (farmer shipped it, or a rider has picked it up and is in
  // transit) or resolved (picked up / delivered / received), and of course once
  // it's already declined / cancelled.
  const cancellable =
    (order.status === 'pending' || order.status === 'approved')
    && !order.shipped_at
    && !order.collected_at
    && !order.received_at
    && order.delivery_status !== 'picked_up'
    && order.delivery_status !== 'out_for_delivery'
    && order.delivery_status !== 'delivered'
  if (!cancellable) {
    return NextResponse.json(
      { error: 'This order can no longer be cancelled — it has already been shipped or completed.' },
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

  const update: Record<string, unknown> = {
    status: 'cancelled',
    decline_reason: reason || 'Cancelled by buyer',
  }

  const paidByRazorpay = order.payment_status === 'paid' && !!order.razorpay_payment_id
  const paidByOther =
    order.payment_status === 'completed' ||
    order.payment_status === 'payment_claimed' ||
    order.payment_status === 'pending_confirmation'

  // Cancellation is the buyer's choice, so the platform fee (moderator
  // commission) is NOT refunded — it covers the gateway/software cost already
  // incurred. We refund the produce price only; the fee stamped on this row
  // (the cart's first row carries it) is withheld. Surfaced to the buyer so the
  // deduction is shown clearly.
  const platformFeeWithheld = Math.max(0, Number(order.platform_fee) || 0)
  const refundAmount = Math.max(0, Number(order.total_price) || 0)

  if (paidByRazorpay) {
    const amountPaise = Math.round(refundAmount * 100)
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

  return NextResponse.json({
    ok: true,
    refunded: !!update.refund_id,
    refundInitiated: update.refund_status === 'initiated',
    refundAmount,
    platformFeeWithheld,
  })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'
import { refundPayment } from '@/lib/razorpay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Farmer declines a pending order. This runs server-side (not in the
// dashboard) because issuing a real refund needs the Razorpay secret. Steps:
//   1. authorise the farmer and confirm the order is theirs and still pending
//   2. return the reserved stock
//   3. if the buyer paid by Razorpay, issue a real partial refund for this
//      line's amount and record it; other paid methods get a manual
//      'initiated' marker as before
//   4. mark the order declined
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const reason = String((body as { reason?: unknown } | null)?.reason ?? '').trim().slice(0, 300)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: order, error: loadErr } = await supabase
    .from('orders')
    .select('id, farmer_id, status, quantity, total_price, produce_listing_id, payment_method, payment_status, razorpay_payment_id, order_code, shipped_at, collected_at, received_at')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.farmer_id !== session.farmerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  // A farmer can decline/cancel an order while it is still pending OR approved
  // but not yet fulfilled — the OrderCard offers Decline in both states (e.g.
  // the crop is damaged after the farmer already approved). Once it has been
  // shipped, picked up or received it's too late. Rejecting anything already
  // declined/cancelled also keeps a double-tap from refunding twice.
  if (order.status !== 'pending' && order.status !== 'approved') {
    return NextResponse.json({ error: 'This order can no longer be declined.' }, { status: 409 })
  }
  if (order.shipped_at || order.collected_at || order.received_at) {
    return NextResponse.json(
      { error: 'This order has already been fulfilled and can no longer be declined.' },
      { status: 409 },
    )
  }

  // 1. Return the reserved stock.
  if (order.produce_listing_id && order.quantity != null && order.quantity > 0) {
    try {
      await supabase.rpc('increment_stock', {
        p_listing_id: order.produce_listing_id,
        p_qty: order.quantity,
      })
    } catch (e) {
      console.error('[YFF] restock on decline failed:', e)
    }
  }

  // 2. Refund if the buyer actually paid.
  const update: Record<string, unknown> = { status: 'declined', decline_reason: reason || null }

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
          notes: { order_code: order.order_code ?? '', order_id: order.id },
        })
        update.refund_id = refund.id
        update.refund_status = refund.status ?? 'processed'
        update.refund_amount = Math.round(refund.amountPaise / 100)
        update.refunded_at = new Date().toISOString()
      } catch (e) {
        // Refund failed at Razorpay. Don't silently swallow it — keep the
        // order pending so the farmer can retry, and surface the error.
        console.error('[YFF] razorpay refund failed:', e)
        return NextResponse.json(
          { error: 'Could not issue the refund. The order was not declined — please try again.' },
          { status: 502 },
        )
      }
    }
  } else if (paidByOther) {
    // Non-Razorpay paid (UPI/manual): flag for manual refund as before.
    update.refund_status = 'initiated'
  }

  const { error: updErr } = await supabase.from('orders').update(update).eq('id', id)
  if (updErr) {
    console.error('[YFF] decline update failed:', updErr.message)
    return NextResponse.json({ error: 'Could not decline the order. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    refunded: !!update.refund_id,
    refundStatus: (update.refund_status as string | undefined) ?? null,
  })
}

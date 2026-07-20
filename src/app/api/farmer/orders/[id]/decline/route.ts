import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'
import { refundPayment } from '@/lib/razorpay'
import { isDepositPaid } from '@/lib/payment'
import { getDeliveryCharges, planDeliveryRefund, type RefundOrderRow } from '@/lib/delivery-fee'
import { applySiblingDeliveryRefunds, REFUND_ORDER_COLS } from '@/lib/delivery-refund'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Farmer declines a pending order. This runs server-side (not in the
// dashboard) because issuing a real refund needs the Razorpay secret. Steps:
//   1. authorise the farmer and confirm the order is theirs and still pending
//   2. return the reserved stock
//   3. if the buyer paid by Razorpay, issue a real refund for the FULL amount
//      the buyer paid against this order — the produce price plus this row's
//      share of the delivery fee and platform fee (both stamped on the first
//      row of the cart). Because the farmer is the one cancelling, the buyer
//      should be made whole, not just refunded the produce. Other paid methods
//      get a manual 'initiated' marker carrying the same full amount.
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
    .select('id, farmer_id, status, quantity, total_price, delivery_fee, delivery_fee_refunded, platform_fee, cod_deposit, produce_listing_id, harvest_id, payment_method, payment_status, razorpay_payment_id, checkout_id, order_code, shipped_at, collected_at, received_at')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.farmer_id !== session.farmerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  // A farmer can decline an order ONLY while it is still pending. Once the farmer
  // approves it, the delivery/pickup date is set and agreed, so the order is a
  // commitment the farmer can no longer reject (mirrors the buyer losing the
  // ability to cancel at the same point). Blocking anything past pending also
  // keeps a double-tap on an already-declined/cancelled order from refunding twice.
  if (order.status !== 'pending') {
    return NextResponse.json(
      { error: 'This order can no longer be declined — it has already been approved with a set delivery/pickup date.' },
      { status: 409 },
    )
  }
  if (order.shipped_at || order.collected_at || order.received_at) {
    return NextResponse.json(
      { error: 'This order has already been fulfilled and can no longer be declined.' },
      { status: 409 },
    )
  }

  // 1. Return the reserved stock. Harvest orders return the harvest's stock;
  // legacy orders the listing's.
  if (order.quantity != null && order.quantity > 0) {
    try {
      if (order.harvest_id) {
        await supabase.rpc('increment_harvest_stock', { p_harvest_id: order.harvest_id, p_qty: order.quantity })
      } else if (order.produce_listing_id) {
        await supabase.rpc('increment_stock', { p_listing_id: order.produce_listing_id, p_qty: order.quantity })
      }
    } catch (e) {
      console.error('[YFF] restock on decline failed:', e)
    }
  }

  // 2. Refund if the buyer actually paid.
  const update: Record<string, unknown> = { status: 'declined', decline_reason: reason || null }

  // A part-paid COD order carries 'deposit_paid', not 'paid' — but the deposit
  // was a real Razorpay capture and this is the farmer's decision, not the
  // buyer's, so it must be refunded in full. (A BUYER cancel forfeits it
  // instead; that asymmetry is the whole point of the deposit.) Without this,
  // declining would silently keep the buyer's money.
  const depositPaid = isDepositPaid(order.payment_status)
  const paidByRazorpay =
    (order.payment_status === 'paid' || depositPaid) && !!order.razorpay_payment_id
  const paidByOther =
    order.payment_status === 'completed' ||
    order.payment_status === 'payment_claimed' ||
    order.payment_status === 'pending_confirmation'

  // The non-delivery amount the buyer paid against THIS order row.
  //
  // Part-paid COD: only the deposit ever reached us — the balance (which is
  // where most of the delivery charge sits) was cash the rider never collected,
  // so the deposit is the whole of what we can give back and delivery is not
  // coordinated separately below.
  //
  // Otherwise: the produce price plus this row's platform fee. The delivery
  // charge is handled by planDeliveryRefund, because when the farmer drops out
  // of a multi-farmer checkout the charge only falls by ONE farmer's worth, not
  // this whole row's stamped fee — and any base still owed may sit on a sibling.
  const itemPlatformRefund = depositPaid
    ? Math.max(0, Number(order.cod_deposit) || 0)
    : (Number(order.total_price) || 0) + (Number(order.platform_fee) || 0)

  // Work out the delivery-charge refund across the whole checkout (pure — no
  // writes yet). Skipped for the deposit path (delivery there was cash/in-deposit)
  // and when nothing was captured.
  let deliveryPlan: ReturnType<typeof planDeliveryRefund> = { owed: 0, allocations: [] }
  let currentDeliveryAmount = 0
  let currentDeliveryRefundedTotal: number | null = null
  if (!depositPaid && (paidByRazorpay || paidByOther)) {
    const charges = await getDeliveryCharges(supabase)
    let siblings: RefundOrderRow[] = [{
      id: order.id,
      farmer_id: order.farmer_id,
      status: order.status,
      delivery_fee: order.delivery_fee,
      delivery_fee_refunded: order.delivery_fee_refunded,
      payment_status: order.payment_status,
      razorpay_payment_id: order.razorpay_payment_id,
    }]
    if (order.checkout_id) {
      const { data: sibRows } = await supabase
        .from('orders').select(REFUND_ORDER_COLS).eq('checkout_id', order.checkout_id)
      if (sibRows && sibRows.length) siblings = sibRows as RefundOrderRow[]
    }
    deliveryPlan = planDeliveryRefund(siblings, order.id, charges)
    const cur = deliveryPlan.allocations.find((a) => a.orderId === order.id)
    currentDeliveryAmount = cur?.amount ?? 0
    currentDeliveryRefundedTotal = cur?.newRefundedTotal ?? null
  }

  // Refund the buyer for THIS order: produce + platform + this order's own slice
  // of the delivery drop, in one gateway call.
  const currentRefund = itemPlatformRefund + currentDeliveryAmount

  if (paidByRazorpay) {
    const amountPaise = Math.round(currentRefund * 100)
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
        // order pending so the farmer can retry, and surface the error. We have
        // not touched any sibling yet, so nothing is left half-done.
        console.error('[YFF] razorpay refund failed:', e)
        return NextResponse.json(
          { error: 'Could not issue the refund. The order was not declined — please try again.' },
          { status: 502 },
        )
      }
    }
  } else if (paidByOther) {
    // Non-Razorpay paid (UPI/manual): flag for manual refund, recording the
    // amount owed so whoever settles it knows the figure.
    update.refund_status = 'initiated'
    if (currentRefund > 0) update.refund_amount = Math.round(currentRefund)
  }
  // Record how much of this row's delivery fee has now been given back, so a
  // later sibling cancellation can't refund it twice.
  if (currentDeliveryRefundedTotal != null) update.delivery_fee_refunded = currentDeliveryRefundedTotal

  const { error: updErr } = await supabase.from('orders').update(update).eq('id', id)
  if (updErr) {
    console.error('[YFF] decline update failed:', updErr.message)
    return NextResponse.json({ error: 'Could not decline the order. Please try again.' }, { status: 500 })
  }

  // The buyer's own refund is done and the order is declined. Now settle any
  // delivery refund that lands on SIBLING orders' payments (e.g. residual base
  // on an already-cancelled row). Best-effort: logged, never blocks the decline.
  if (deliveryPlan.allocations.some((a) => a.orderId !== order.id)) {
    await applySiblingDeliveryRefunds(supabase, deliveryPlan, order.id)
  }

  return NextResponse.json({
    ok: true,
    refunded: !!update.refund_id,
    refundStatus: (update.refund_status as string | undefined) ?? null,
    // The actual amount refunded to the buyer (full: produce + delivery +
    // platform fee), so the confirmation screen shows the real figure rather
    // than the produce price alone.
    refundAmount: typeof update.refund_amount === 'number' ? update.refund_amount : null,
  })
}

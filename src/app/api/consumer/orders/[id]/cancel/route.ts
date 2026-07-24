import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { refundPayment } from '@/lib/razorpay'
import { isDepositPaid } from '@/lib/payment'
import { getDeliveryCharges, planDeliveryRefund, type RefundOrderRow } from '@/lib/delivery-fee'
import { applySiblingDeliveryRefunds, REFUND_ORDER_COLS } from '@/lib/delivery-refund'
import { getPostHogClient } from '@/lib/posthog-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Buyer cancels their own order. Allowed ONLY while the order is still pending —
// i.e. before the farmer approves it. Once the farmer approves, the delivery/
// pickup date is set and agreed, so cancellation is locked (a confirmed date is
// a commitment on both sides). Returns the stock and, for a paid order, issues a
// real Razorpay refund — same machinery as a farmer decline, but buyer-initiated.
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
    .select('id, consumer_id, farmer_id, status, quantity, total_price, platform_fee, delivery_fee, delivery_fee_refunded, cod_deposit, produce_listing_id, harvest_id, payment_status, razorpay_payment_id, checkout_id, created_at, order_code, shipped_at, collected_at, received_at, delivery_status')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.consumer_id !== session.consumerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  // Cancellable ONLY while still pending — before the farmer approves it and the
  // delivery/pickup date is set. The shipped/collected/received/delivery_status
  // guards stay as belt-and-braces (a pending order should never carry them, but
  // if one somehow does it must not be cancellable either).
  const cancellable =
    order.status === 'pending'
    && !order.shipped_at
    && !order.collected_at
    && !order.received_at
    && order.delivery_status !== 'picked_up'
    && order.delivery_status !== 'out_for_delivery'
    && order.delivery_status !== 'delivered'
  if (!cancellable) {
    return NextResponse.json(
      { error: 'This order can no longer be cancelled — the farmer has approved it and set the delivery/pickup date.' },
      { status: 409 },
    )
  }

  // Return the reserved stock. Harvest orders return the harvest's stock;
  // legacy orders the listing's.
  if (order.quantity != null && order.quantity > 0) {
    try {
      if (order.harvest_id) {
        await supabase.rpc('increment_harvest_stock', { p_harvest_id: order.harvest_id, p_qty: order.quantity })
      } else if (order.produce_listing_id) {
        await supabase.rpc('increment_stock', { p_listing_id: order.produce_listing_id, p_qty: order.quantity })
      }
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
  const produceRefund = Math.max(0, Number(order.total_price) || 0)

  // The delivery charge, unlike the platform fee, is for a service not rendered,
  // so it IS refunded on a buyer cancel — by the SAME whole-checkout rule as a
  // farmer decline: the charge falls by one farmer's worth (or the residual base
  // when the last farmer leaves), possibly spread across sibling orders. Pure
  // here (no writes); skipped for the deposit path (delivery there was cash).
  let deliveryPlan: ReturnType<typeof planDeliveryRefund> = { owed: 0, allocations: [] }
  let currentDeliveryAmount = 0
  let currentDeliveryRefundedTotal: number | null = null
  if (!isDepositPaid(order.payment_status) && (paidByRazorpay || paidByOther)) {
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

  // What we refund the buyer for THIS order: produce (fee withheld) + this
  // order's slice of the delivery drop.
  const refundAmount = produceRefund + currentDeliveryAmount

  // Part-paid COD: the deposit is forfeited when the BUYER cancels. That is the
  // entire reason it exists — on full COD a buyer could walk away from a
  // confirmed order having risked nothing, after the farmer had already
  // harvested for it. Refunding it here would make the deposit pointless.
  //
  // A farmer decline/cancel is the opposite case and DOES refund it in full —
  // see /api/farmer/orders/[id]/decline. Note deposit_paid is deliberately
  // absent from paidByRazorpay/paidByOther above, so no refund call is made.
  const depositForfeited = isDepositPaid(order.payment_status)
    ? Math.max(0, Number(order.cod_deposit) || 0)
    : 0
  if (depositForfeited > 0) {
    update.deposit_forfeited_at = new Date().toISOString()
    update.cod_balance_due = 0
  }

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
        // The gateway refused the refund (e.g. account/gateway state). Don't
        // trap the buyer with an order they can't cancel: cancel it anyway and
        // flag the refund as failed, recording the amount owed so the team can
        // settle it manually from the Razorpay dashboard. The buyer sees a
        // "refund failed / will be processed manually" note.
        console.error('[YFF] razorpay refund on cancel failed:', e)
        update.refund_status = 'failed'
        update.refund_amount = refundAmount
      }
    }
  } else if (paidByOther) {
    update.refund_status = 'initiated'
    if (refundAmount > 0) update.refund_amount = Math.round(refundAmount)
  }
  // Record how much of this row's delivery fee has now been given back, so a
  // later sibling cancellation can't refund it twice.
  if (currentDeliveryRefundedTotal != null) update.delivery_fee_refunded = currentDeliveryRefundedTotal

  const { error: updErr } = await supabase.from('orders').update(update).eq('id', id)
  if (updErr) {
    console.error('[YFF] cancel update failed:', updErr.message)
    return NextResponse.json({ error: 'Could not cancel the order. Please try again.' }, { status: 500 })
  }

  // Settle any delivery refund that lands on SIBLING orders' payments (residual
  // base on an already-cancelled row). Best-effort: logged, never blocks cancel.
  if (deliveryPlan.allocations.some((a) => a.orderId !== order.id)) {
    await applySiblingDeliveryRefunds(supabase, deliveryPlan, order.id)
  }

  const posthog = getPostHogClient()
  if (posthog) {
    posthog.capture({
      distinctId: session.consumerId,
      event: 'order_cancelled_by_consumer',
      properties: {
        order_id: id,
        refund_amount: refundAmount,
        had_razorpay_refund: !!update.refund_id,
        refund_failed: update.refund_status === 'failed',
      },
    })
    await posthog.flush()
  }

  return NextResponse.json({
    ok: true,
    refunded: !!update.refund_id,
    refundInitiated: update.refund_status === 'initiated',
    refundFailed: update.refund_status === 'failed',
    refundAmount,
    // Of the refund, how much was the delivery charge (service not rendered).
    deliveryRefund: currentDeliveryAmount,
    platformFeeWithheld,
    // The buyer must be told plainly what the cancellation cost them.
    depositForfeited,
  })
}

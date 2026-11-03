import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { hasMoneyIn } from '@/lib/payment'
import { getSettlement, isSafeToAbandon, terminateCashfreeOrder } from '@/lib/cashfree'
import { ABANDON_REASON, markCashfreePaid } from '@/lib/cashfree-settle'

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
    .select('id, consumer_id, status, payment_status, quantity, produce_listing_id, harvest_id, cashfree_order_id')
    .in('id', orderIds)
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })

  // The checkout closing is not proof nothing was paid — a UPI app payment can
  // complete after the modal is gone (YFF-20261029-0383: cancelled here, paid
  // seconds later). So before cancelling anything, ask Cashfree about each
  // order this batch opened: a paid one is recorded as paid; one with a payment
  // still processing is left alone; an unpaid one is TERMINATED and checked
  // again, and only cancelled once Cashfree confirms it can no longer be paid.
  // Anything we leave alone is settled by the webhook / reconcile cron.
  const keepCashfree = new Set<string>()
  const cfIds = [...new Set(
    (orders ?? [])
      .filter((o) => o.consumer_id === session.consumerId && o.cashfree_order_id)
      .map((o) => o.cashfree_order_id as string),
  )]
  for (const cfId of cfIds) {
    try {
      const before = await getSettlement(cfId)
      if (before.paid) {
        keepCashfree.add(cfId)
        const err = await markCashfreePaid(supabase, { cashfreeOrderId: cfId, paymentId: before.paymentId, label: before.label })
        if (err) console.error('[YFF abandon] late-paid update failed:', err)
        continue
      }
      if (before.inFlight) {
        console.warn('[YFF abandon] payment still processing, leaving orders alone:', cfId)
        keepCashfree.add(cfId)
        continue
      }
      await terminateCashfreeOrder(cfId)
      // Whether or not the terminate call succeeded, believe only Cashfree's
      // state afterwards: a payment may have slipped in between the two calls.
      const after = await getSettlement(cfId)
      if (after.paid) {
        keepCashfree.add(cfId)
        const err = await markCashfreePaid(supabase, { cashfreeOrderId: cfId, paymentId: after.paymentId, label: after.label })
        if (err) console.error('[YFF abandon] late-paid update failed:', err)
        continue
      }
      if (!isSafeToAbandon(after)) {
        console.warn('[YFF abandon] Cashfree order still payable, leaving orders alone:', cfId, after.orderStatus)
        keepCashfree.add(cfId)
      }
    } catch (e) {
      // Unknown state: don't cancel what might be paid. The reconcile cron
      // settles it either way.
      console.error('[YFF abandon] settlement lookup failed, leaving orders alone:', cfId, e)
      keepCashfree.add(cfId)
    }
  }

  let cancelled = 0
  for (const order of orders ?? []) {
    // Skip anything that isn't this buyer's, isn't still pending, or already
    // got paid — we must never cancel an order the buyer actually paid for.
    if (order.consumer_id !== session.consumerId) continue
    if (order.status !== 'pending') continue
    // Never cancel an order the buyer actually paid for. That includes a COD
    // order whose DEPOSIT was captured: the payment sheet can fire a late
    // dismiss after a successful capture, and cancelling then would take the
    // buyer's deposit and void their order.
    if (hasMoneyIn(order.payment_status)) continue
    if (order.cashfree_order_id && keepCashfree.has(order.cashfree_order_id)) continue

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
      .update({ status: 'cancelled', decline_reason: ABANDON_REASON })
      .eq('id', order.id)
    if (updErr) {
      console.error('[YFF] abandon update failed:', updErr.message)
      continue
    }
    cancelled += 1
  }

  return NextResponse.json({ ok: true, cancelled })
}

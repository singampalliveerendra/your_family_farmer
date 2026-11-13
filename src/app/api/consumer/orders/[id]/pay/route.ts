import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { rateLimit } from '@/lib/rate-limit'
import { cashfreeMode, createCashfreeOrder, fetchCashfreeOrder, getSettlement, makeCashfreeOrderId, terminateCashfreeOrder } from '@/lib/cashfree'
import { markCashfreePaid } from '@/lib/cashfree-settle'
import { earlierPaymentStep, payBatchOf, payBatchTotal, type BatchRow } from '@/lib/payPending'
import { isOrderPaid } from '@/lib/payment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const COLS = 'id, consumer_id, status, payment_method, payment_status, checkout_id, cashfree_order_id, total_price, platform_fee, delivery_fee, buyer_name, buyer_phone'

type Row = BatchRow & {
  total_price: number | null
  platform_fee: number | null
  delivery_fee: number | null
  buyer_name: string | null
  buyer_phone: string | null
}

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status })

// "Pay Now" on an order whose online payment is pending or failed (client
// 2026-11-13; rules in src/lib/payPending.ts). Logged-in buyers only. Charges
// the order together with the rest of its checkout that is still open and
// unpaid, for the amount read from the DB. Before any new Cashfree order the
// earlier one is asked, so a buyer can never pay twice:
//   paid after all → recorded here, nothing charged ({ alreadyPaid: true })
//   a payment still processing → 409, try later
//   still open for the same amount → the same checkout is reopened
//   open for another amount → terminated (and re-checked) first
// The browser then runs the usual checkout + /api/orders/cashfree/verify,
// which marks the rows paid; the webhook / reconcile cron back it up.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return fail('Please log in.', 401)

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return fail('Invalid order id.', 400)
  if (!rateLimit(`pay-now:${session.consumerId}`, 12, 10 * 60 * 1000)) return fail('Too many tries. Please wait a few minutes.', 429)

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: targetRow, error: loadErr } = await supabase.from('orders').select(COLS).eq('id', id).maybeSingle()
  if (loadErr) return fail('Could not start payment. Please try again.', 500)
  const target = targetRow as Row | null
  if (!target || target.consumer_id !== session.consumerId) return fail('Order not found.', 404)

  // The rest of its checkout (one Cashfree payment covered them all).
  let siblings: Row[] = [target]
  if (target.checkout_id || target.cashfree_order_id) {
    const q = supabase.from('orders').select(COLS).eq('consumer_id', session.consumerId)
    const { data, error } = target.checkout_id
      ? await q.eq('checkout_id', target.checkout_id)
      : await q.eq('cashfree_order_id', target.cashfree_order_id as string)
    if (error) return fail('Could not start payment. Please try again.', 500)
    siblings = (data ?? []) as Row[]
  }
  const batch = payBatchOf(target, siblings)
  if (batch.length === 0) {
    return isOrderPaid(target.payment_status)
      ? fail('This order is already paid.', 409, { alreadyPaid: true })
      : fail('This order can no longer be paid.', 409)
  }
  const ids = batch.map((r) => r.id)
  const total = payBatchTotal(batch)
  if (!(total > 0)) return fail('Invalid order total.', 400)

  const reply = (cashfreeOrderId: string, paymentSessionId: string) =>
    NextResponse.json({
      ok: true,
      mode: cashfreeMode(),
      cashfreeOrderId,
      paymentSessionId,
      amount: Math.round(total * 100), // paise, like /api/orders/cashfree/create
      currency: 'INR',
      platformFee: batch.reduce((s, r) => s + (Number(r.platform_fee) || 0), 0),
      deliveryFee: batch.reduce((s, r) => s + (Number(r.delivery_fee) || 0), 0),
      orderIds: ids,
    })

  // Earlier payment attempts on these rows — ask Cashfree about each.
  const earlier = [...new Set(batch.map((r) => r.cashfree_order_id).filter(Boolean))] as string[]
  for (const cfId of earlier) {
    try {
      const s = await getSettlement(cfId)
      const sameBatch = earlier.length === 1 && batch.every((r) => r.cashfree_order_id === cfId)
      let order = null as Awaited<ReturnType<typeof fetchCashfreeOrder>> | null
      if (!s.paid && s.orderStatus === 'ACTIVE') order = await fetchCashfreeOrder(cfId)
      const same = sameBatch && !!order?.payment_session_id && Number(order.order_amount) === total
      let step = earlierPaymentStep(s, same)

      if (step === 'close') {
        await terminateCashfreeOrder(cfId)
        // Believe only Cashfree's state afterwards — a payment may have slipped in.
        const after = await getSettlement(cfId)
        step = earlierPaymentStep(after, false)
        if (step === 'paid' && after.paid) {
          const err = await markCashfreePaid(supabase, { cashfreeOrderId: cfId, paymentId: after.paymentId, label: after.label })
          if (err) return fail('Could not record your payment. Please try again.', 500)
          return NextResponse.json({ ok: true, alreadyPaid: true })
        }
        if (step !== 'new') return fail('Your last payment is still being confirmed. Please check again in a few minutes.', 409, { processing: true })
        continue
      }
      if (step === 'paid' && s.paid) {
        const err = await markCashfreePaid(supabase, { cashfreeOrderId: cfId, paymentId: s.paymentId, label: s.label })
        if (err) return fail('Could not record your payment. Please try again.', 500)
        return NextResponse.json({ ok: true, alreadyPaid: true })
      }
      if (step === 'processing') {
        return fail('Your last payment is still being confirmed by your bank. Please check again in a few minutes.', 409, { processing: true })
      }
      if (step === 'reuse' && order?.payment_session_id) return reply(cfId, order.payment_session_id)
    } catch (e) {
      // Unknown state: don't take a second payment that might double-charge.
      console.error('[YFF pay-now] earlier payment check failed:', cfId, e)
      return fail('Could not check your last payment. Please try again.', 502)
    }
  }

  const phone = String(target.buyer_phone ?? '').replace(/\D/g, '').slice(-10)
  if (phone.length !== 10) return fail('A valid phone number is needed to pay online.', 400)

  const cashfreeOrderId = makeCashfreeOrderId(ids[0])
  let sessionId: string | null | undefined
  try {
    const created = await createCashfreeOrder({
      orderId: cashfreeOrderId,
      amountRupees: total,
      customerId: `c_${session.consumerId.replace(/-/g, '')}`,
      customerPhone: phone,
      customerName: target.buyer_name,
      note: 'Go Grameen order (Pay Now)',
      tags: { rows: String(ids.length), kind: 'pay_now' },
    })
    sessionId = created.payment_session_id
  } catch (e) {
    console.error('[YFF pay-now] Cashfree create failed:', e)
  }
  if (!sessionId) return fail('Could not start payment. Please try again.', 502)

  // Stamp the new id only on rows still carrying the id we checked, and still
  // unpaid. A second tap racing this one changes the id first, so this one
  // stamps fewer rows — then its Cashfree order is closed, so it can never be
  // paid without our rows pointing at it.
  let stamped = 0
  for (const old of [...earlier, null]) {
    const group = batch.filter((r) => (r.cashfree_order_id ?? null) === old).map((r) => r.id)
    if (!group.length) continue
    let q = supabase.from('orders').update({ cashfree_order_id: cashfreeOrderId }).in('id', group).or('payment_status.is.null,payment_status.in.(pending,failed)')
    q = old === null ? q.is('cashfree_order_id', null) : q.eq('cashfree_order_id', old)
    const { data, error } = await q.select('id')
    if (error) console.error('[YFF pay-now] stamp failed:', error.message)
    stamped += data?.length ?? 0
  }
  if (stamped !== ids.length) {
    await terminateCashfreeOrder(cashfreeOrderId)
    return fail('A payment was just started for this order. Please try again.', 409)
  }

  return reply(cashfreeOrderId, sessionId)
}

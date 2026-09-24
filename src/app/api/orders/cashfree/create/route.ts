import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { authorizeGuestBatches } from '@/lib/guest-batch-auth'
import { cashfreeMode, createCashfreeOrder, fetchCashfreeOrder, makeCashfreeOrderId } from '@/lib/cashfree'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Step 2 of the Cashfree flow: the browser has already placed the orders
// (status pending) via /api/orders/place. Here we create the matching Cashfree
// order for the AUTHORITATIVE total read from the DB, never an amount sent by
// the client, stamp its id onto our rows, and hand the browser the
// payment_session_id that opens the checkout.
export async function POST(req: NextRequest) {
  // Guests have no session — they authorize with the short-lived guestToken
  // returned by /api/orders/place, bound to exactly these order ids.
  const session = getConsumerSessionFromRequest(req)

  const body = await req.json().catch(() => null)
  const rawIds = (body as { orderIds?: unknown } | null)?.orderIds
  const guestToken = (body as { guestToken?: unknown } | null)?.guestToken
  // Multi-farmer guest checkout: one {orderIds, token} pair per placement; the
  // server requires their union to be exactly the batch being charged.
  const guestBatches = (body as { guestBatches?: unknown } | null)?.guestBatches
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

  type OrderRow = {
    id: string; consumer_id: string | null; total_price: number | null
    payment_status: string | null; cashfree_order_id: string | null; platform_fee: number | null
    payment_method: string | null; cod_deposit: number | null; delivery_fee: number | null
    buyer_name: string | null; buyer_phone: string | null
  }
  const { data, error: loadErr } = await supabase
    .from('orders')
    .select('id, consumer_id, total_price, payment_status, cashfree_order_id, platform_fee, payment_method, cod_deposit, delivery_fee, buyer_name, buyer_phone')
    .in('id', orderIds)
  if (loadErr) {
    console.error('[YFF cashfree/create] load failed:', loadErr.message)
    return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 500 })
  }
  const orders = data as OrderRow[] | null

  if (!orders || orders.length !== orderIds.length) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }
  if (session) {
    if (orders.some((o) => o.consumer_id !== session.consumerId)) {
      return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
    }
  } else {
    if (orders.some((o) => o.consumer_id !== null)) {
      return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
    }
    if (!authorizeGuestBatches(orderIds, guestToken, guestBatches)) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 })
    }
  }
  // Never charge an already-paid batch again. 'deposit_paid' counts: the rest
  // is owed in cash and must never be charged online a second time.
  if (orders.some((o) => o.payment_status === 'paid' || o.payment_status === 'deposit_paid')) {
    return NextResponse.json({ error: 'These orders are already paid.' }, { status: 409 })
  }

  // Authoritative amount, always from the DB. Part-paid COD charges the DEPOSIT
  // only (the balance is cash at the door); everything else charges produce +
  // platform fee + delivery charge.
  const isCod = orders.some((o) => o.payment_method === 'cod')
  const depositRupees = orders.reduce((s, o) => s + (Number(o.cod_deposit) || 0), 0)

  let totalRupees: number
  let platformFeeRupees = 0
  let deliveryFeeRupees = 0
  if (isCod && depositRupees > 0) {
    totalRupees = depositRupees
  } else if (isCod) {
    return NextResponse.json({ error: 'This order is cash on delivery — nothing to pay now.' }, { status: 409 })
  } else {
    const subtotalRupees = orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0)
    platformFeeRupees = orders.reduce((s, o) => s + (Number(o.platform_fee) || 0), 0)
    deliveryFeeRupees = orders.reduce((s, o) => s + (Number(o.delivery_fee) || 0), 0)
    totalRupees = subtotalRupees + platformFeeRupees + deliveryFeeRupees
  }
  if (totalRupees <= 0) return NextResponse.json({ error: 'Invalid order total.' }, { status: 400 })
  // Round to paise once, here, so the figure Cashfree holds is exactly ours.
  totalRupees = Math.round(totalRupees * 100) / 100

  const reply = (cashfreeOrderId: string, paymentSessionId: string, reused = false) =>
    NextResponse.json({
      ok: true,
      mode: cashfreeMode(),
      cashfreeOrderId,
      paymentSessionId,
      // Paise, as the old gateway route returned — the Cart's success screen reads it.
      amount: Math.round(totalRupees * 100),
      currency: 'INR',
      platformFee: platformFeeRupees,
      deliveryFee: deliveryFeeRupees,
      ...(reused ? { reused: true } : {}),
    })

  // Idempotency: a retry after a dropped connection reuses the still-open
  // Cashfree order rather than creating a second one the buyer could also pay.
  // Only an ACTIVE order for the same amount is reusable; an expired or
  // terminated id can never be paid again, so we mint a new one.
  const existing = orders[0].cashfree_order_id
  if (existing && orders.every((o) => o.cashfree_order_id === existing)) {
    try {
      const o = await fetchCashfreeOrder(existing)
      if (o.order_status === 'PAID') {
        return NextResponse.json({ error: 'These orders are already paid.' }, { status: 409 })
      }
      if (o.order_status === 'ACTIVE' && o.payment_session_id && Number(o.order_amount) === totalRupees) {
        return reply(existing, o.payment_session_id, true)
      }
    } catch (e) {
      console.warn('[YFF cashfree/create] could not reuse', existing, (e as Error).message)
    }
  }

  // Cashfree requires a customer id + 10-digit phone. The buyer's own phone is
  // on the row from /api/orders/place.
  const phone = String(orders[0].buyer_phone ?? '').replace(/\D/g, '').slice(-10)
  if (phone.length !== 10) {
    return NextResponse.json({ error: 'A valid phone number is needed to pay online.' }, { status: 400 })
  }
  const customerId = session
    ? `c_${session.consumerId.replace(/-/g, '')}`
    : `g_${phone}`

  const cashfreeOrderId = makeCashfreeOrderId(orderIds[0])
  let created
  try {
    created = await createCashfreeOrder({
      orderId: cashfreeOrderId,
      amountRupees: totalRupees,
      customerId,
      customerPhone: phone,
      customerName: orders[0].buyer_name,
      note: isCod ? 'Go Grameen COD deposit' : 'Go Grameen order',
      tags: { rows: String(orderIds.length) },
    })
  } catch (e) {
    console.error('[YFF cashfree/create] order create failed:', e)
    return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 502 })
  }
  if (!created.payment_session_id) {
    console.error('[YFF cashfree/create] no payment_session_id for', cashfreeOrderId)
    return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 502 })
  }

  const { error: updErr } = await supabase
    .from('orders')
    .update({ cashfree_order_id: cashfreeOrderId })
    .in('id', orderIds)
  if (updErr) {
    console.error('[YFF cashfree/create] order id stamp failed:', updErr.message)
    return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 500 })
  }

  return reply(cashfreeOrderId, created.payment_session_id)
}

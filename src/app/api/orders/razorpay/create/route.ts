import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { verifyGuestOrderToken } from '@/lib/guest-order-token'
import { getRazorpayClient, getRazorpayKeyId } from '@/lib/razorpay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Step 2 of the Razorpay flow: the browser has already placed the orders
// (status pending) via /api/orders/place. Here we create the matching
// Razorpay order for the AUTHORITATIVE total read from the DB, never an
// amount sent by the client, and stamp its id onto our rows.
export async function POST(req: NextRequest) {
  // Guests have no session — they authorize with the short-lived guestToken
  // returned by /api/orders/place, bound to exactly these order ids.
  const session = getConsumerSessionFromRequest(req)

  const body = await req.json().catch(() => null)
  const rawIds = (body as { orderIds?: unknown } | null)?.orderIds
  const guestToken = (body as { guestToken?: unknown } | null)?.guestToken
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

  // Include platform_fee so it's added to the charged amount. The column may not
  // exist before its migration runs, so fall back to a fee-less select on error.
  type OrderRow = {
    id: string; consumer_id: string | null; total_price: number | null
    payment_status: string | null; razorpay_order_id: string | null; platform_fee?: number | null
    payment_method?: string | null; cod_deposit?: number | null; delivery_fee?: number | null
  }
  let orders: OrderRow[] | null
  {
    const withFee = await supabase
      .from('orders')
      .select('id, consumer_id, total_price, payment_status, razorpay_order_id, platform_fee, payment_method, cod_deposit, delivery_fee')
      .in('id', orderIds)
    if (withFee.error) {
      const noFee = await supabase
        .from('orders')
        .select('id, consumer_id, total_price, payment_status, razorpay_order_id')
        .in('id', orderIds)
      orders = noFee.data as OrderRow[] | null
    } else {
      orders = withFee.data as OrderRow[] | null
    }
  }

  if (!orders || orders.length !== orderIds.length) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }
  if (session) {
    if (orders.some((o) => o.consumer_id !== session.consumerId)) {
      return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
    }
  } else {
    // Guest: every row must be a guest order, and the token must cover them.
    if (orders.some((o) => o.consumer_id !== null)) {
      return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
    }
    if (typeof guestToken !== 'string' || !verifyGuestOrderToken(guestToken, orderIds)) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 })
    }
  }
  // Don't let an already-paid batch be charged a second time. 'deposit_paid'
  // counts here too: the deposit is in, and the rest is owed in cash — it must
  // never be charged online a second time.
  if (orders.some((o) => o.payment_status === 'paid' || o.payment_status === 'deposit_paid')) {
    return NextResponse.json({ error: 'These orders are already paid.' }, { status: 409 })
  }

  // Authoritative amount, always read from the DB and never from the client.
  //
  // Part-paid COD charges the DEPOSIT only — the balance is cash at the door
  // (and the deposit split already folds in this batch's delivery share, see
  // computeCodSplit). Everything else charges produce + platform fee (the
  // moderator commission) + the delivery charge, so the buyer prepays delivery
  // and it can be refunded if the order is declined/cancelled. Razorpay works
  // in paise.
  const isCod = orders.some((o) => o.payment_method === 'cod')
  const depositRupees = orders.reduce((s, o) => s + (Number(o.cod_deposit) || 0), 0)

  let totalRupees: number
  // The two charges that sit on top of the produce subtotal. Returned to the
  // client so the success screen can show them as separate lines instead of
  // lumping everything it can't account for into "platform fee". Left at 0 for
  // a COD deposit, where the deposit already folds both in and no breakdown
  // would be meaningful.
  let platformFeeRupees = 0
  let deliveryFeeRupees = 0
  if (isCod && depositRupees > 0) {
    totalRupees = depositRupees
  } else if (isCod) {
    // COD placed before the deposit migration (or with the deposit turned off):
    // there is nothing to collect online.
    return NextResponse.json({ error: 'This order is cash on delivery — nothing to pay now.' }, { status: 409 })
  } else {
    const subtotalRupees = orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0)
    platformFeeRupees = orders.reduce((s, o) => s + (Number(o.platform_fee) || 0), 0)
    deliveryFeeRupees = orders.reduce((s, o) => s + (Number(o.delivery_fee) || 0), 0)
    totalRupees = subtotalRupees + platformFeeRupees + deliveryFeeRupees
  }

  if (totalRupees <= 0) return NextResponse.json({ error: 'Invalid order total.' }, { status: 400 })
  const amountPaise = Math.round(totalRupees * 100)

  // Idempotency: if this batch already has a Razorpay order (the buyer retried
  // after a dropped connection), reuse it rather than creating a second order
  // the buyer could be charged for separately.
  const existingRzpId = orders[0].razorpay_order_id as string | null | undefined
  if (existingRzpId && orders.every((o) => o.razorpay_order_id === existingRzpId)) {
    return NextResponse.json({
      ok: true,
      keyId: getRazorpayKeyId(),
      razorpayOrderId: existingRzpId,
      amount: amountPaise,
      currency: 'INR',
      platformFee: platformFeeRupees,
      deliveryFee: deliveryFeeRupees,
      reused: true,
    })
  }

  let rzpOrder
  try {
    rzpOrder = await getRazorpayClient().orders.create({
      amount: amountPaise,
      currency: 'INR',
      // Razorpay caps receipt at 40 chars — use the first order id.
      receipt: orderIds[0],
      notes: { orderIds: orderIds.join(',') },
    })
  } catch (e) {
    console.error('[YFF] razorpay order create failed:', e)
    return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 502 })
  }

  const { error: updErr } = await supabase
    .from('orders')
    .update({ razorpay_order_id: rzpOrder.id })
    .in('id', orderIds)
  if (updErr) {
    console.error('[YFF] razorpay order id stamp failed:', updErr.message)
    return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    keyId: getRazorpayKeyId(),
    razorpayOrderId: rzpOrder.id,
    amount: amountPaise,
    currency: 'INR',
    platformFee: platformFeeRupees,
    deliveryFee: deliveryFeeRupees,
  })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { getRazorpayClient, getRazorpayKeyId } from '@/lib/razorpay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Step 2 of the Razorpay flow: the browser has already placed the orders
// (status pending) via /api/orders/place. Here we create the matching
// Razorpay order for the AUTHORITATIVE total read from the DB, never an
// amount sent by the client, and stamp its id onto our rows.
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

  const { data: orders } = await supabase
    .from('orders')
    .select('id, consumer_id, total_price, payment_status')
    .in('id', orderIds)

  if (!orders || orders.length !== orderIds.length) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }
  if (orders.some((o) => o.consumer_id !== session.consumerId)) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  // Don't let an already-paid batch be charged a second time.
  if (orders.some((o) => o.payment_status === 'paid')) {
    return NextResponse.json({ error: 'These orders are already paid.' }, { status: 409 })
  }

  // Authoritative amount: sum the product line totals stored at placement.
  // Delivery fee is intentionally excluded — it's collected as cash by the
  // rider, matching the existing UX. Razorpay works in paise.
  const totalRupees = orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0)
  if (totalRupees <= 0) return NextResponse.json({ error: 'Invalid order total.' }, { status: 400 })
  const amountPaise = Math.round(totalRupees * 100)

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
  })
}

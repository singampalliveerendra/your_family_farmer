import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { verifyGuestOrderToken } from '@/lib/guest-order-token'
import { verifyPaymentSignature, fetchPaymentMethodLabel } from '@/lib/razorpay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Step 4: Checkout returns three values to the browser, which posts them
// here. We re-verify the signature server-side and only then mark the orders
// paid. A forged callback fails the HMAC check and changes nothing.
export async function POST(req: NextRequest) {
  // Guests have no session — they authorize with the guestToken from
  // /api/orders/place (validated below against the rows we resolve).
  const session = getConsumerSessionFromRequest(req)

  const body = await req.json().catch(() => null) as
    | {
        razorpayOrderId?: string
        razorpayPaymentId?: string
        razorpaySignature?: string
        guestToken?: string
      }
    | null

  const razorpayOrderId = String(body?.razorpayOrderId ?? '')
  const razorpayPaymentId = String(body?.razorpayPaymentId ?? '')
  const razorpaySignature = String(body?.razorpaySignature ?? '')
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return NextResponse.json({ error: 'Missing payment fields.' }, { status: 400 })
  }

  const valid = verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature: razorpaySignature })
  if (!valid) {
    console.warn('[YFF] razorpay signature verification FAILED for', razorpayOrderId)
    return NextResponse.json({ error: 'Payment could not be verified.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Find our rows by the Razorpay order id we stamped at create time, and
  // confirm they belong to this consumer before flipping them to paid.
  const { data: orders } = await supabase
    .from('orders')
    .select('id, consumer_id')
    .eq('razorpay_order_id', razorpayOrderId)

  if (!orders || orders.length === 0) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }
  if (session) {
    if (orders.some((o) => o.consumer_id !== session.consumerId)) {
      return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
    }
  } else {
    // Guest: rows must be guest orders, and the token must cover exactly them.
    if (orders.some((o) => o.consumer_id !== null)) {
      return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
    }
    if (!verifyGuestOrderToken(body?.guestToken, orders.map((o) => o.id))) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 })
    }
  }

  // Resolve the friendly payment method (PhonePe / Google Pay / UPI / Card…)
  // from the Razorpay payment so we can show it instead of "Razorpay". A
  // failure here just leaves the label null — it never blocks marking paid.
  const methodLabel = await fetchPaymentMethodLabel(razorpayPaymentId)

  const { error } = await supabase
    .from('orders')
    .update({
      payment_status: 'paid',
      razorpay_payment_id: razorpayPaymentId,
      ...(methodLabel ? { payment_method_detail: methodLabel } : {}),
    })
    .eq('razorpay_order_id', razorpayOrderId)

  if (error) {
    console.error('[YFF] razorpay verify update failed:', error.message)
    return NextResponse.json({ error: 'Could not record payment. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, orderIds: orders.map((o) => o.id) })
}

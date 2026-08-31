import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { authorizeGuestBatches } from '@/lib/guest-batch-auth'
import { verifyPaymentSignature, fetchPaymentMethodLabel, fetchPaymentSettlement } from '@/lib/razorpay'

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
        guestBatches?: Array<{ orderIds: string[]; token: string }>
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
    .select('id, consumer_id, payment_method')
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
    if (!authorizeGuestBatches(orders.map((o) => o.id), body?.guestToken, body?.guestBatches)) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 })
    }
  }

  // The signature proves Razorpay issued this payment against this order, but
  // not that the money actually landed or that the full amount was taken. With
  // partial payments enabled on an account, a signed callback can reference a
  // capture worth a fraction of the order. Ask Razorpay directly and only accept
  // a captured payment whose amount covers what we asked for.
  const settlement = await fetchPaymentSettlement(razorpayPaymentId)
  if (settlement) {
    if (settlement.status !== 'captured') {
      return NextResponse.json({ error: 'Payment is not complete.' }, { status: 400 })
    }
    if (settlement.orderId && settlement.orderId !== razorpayOrderId) {
      console.warn('[YFF] razorpay payment/order mismatch for', razorpayPaymentId)
      return NextResponse.json({ error: 'Payment could not be verified.' }, { status: 400 })
    }
    if (settlement.expectedAmount != null && settlement.amount < settlement.expectedAmount) {
      console.warn('[YFF] razorpay underpayment on', razorpayOrderId, settlement.amount, '<', settlement.expectedAmount)
      return NextResponse.json({ error: 'The payment did not cover the order total.' }, { status: 400 })
    }
  }

  // Resolve the friendly payment method (PhonePe / Google Pay / UPI / Card…)
  // from the Razorpay payment so we can show it instead of "Razorpay". A
  // failure here just leaves the label null — it never blocks marking paid.
  const methodLabel = await fetchPaymentMethodLabel(razorpayPaymentId)

  // On a COD order this payment is the DEPOSIT, not the whole bill — the buyer
  // still owes cod_balance_due in cash at the door. Marking it 'paid' would
  // tell the farmer the money is all in and let the rider close the order
  // without collecting anything. 'deposit_paid' becomes 'completed' only when
  // the cash is actually taken (see /api/rider/orders/[id]/deliver).
  const isCod = orders.some((o) => (o as { payment_method?: string | null }).payment_method === 'cod')
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('orders')
    .update({
      payment_status: isCod ? 'deposit_paid' : 'paid',
      ...(isCod ? { cod_deposit_paid_at: now } : { paid_at: now }),
      razorpay_payment_id: razorpayPaymentId,
      ...(methodLabel ? { payment_method_detail: methodLabel } : {}),
    })
    .eq('razorpay_order_id', razorpayOrderId)
    // Guarded like the webhook is. Without this, a replayed /verify on a COD
    // order the rider had already closed ('completed') would drag it back to
    // 'deposit_paid' and ask for the cash a second time.
    .not('payment_status', 'in', '("completed","paid")')

  if (error) {
    console.error('[YFF] razorpay verify update failed:', error.message)
    return NextResponse.json({ error: 'Could not record payment. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, orderIds: orders.map((o) => o.id) })
}

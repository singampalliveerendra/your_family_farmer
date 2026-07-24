import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/razorpay'
import { getPostHogClient } from '@/lib/posthog-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Razorpay → our server, independent of the buyer's browser. This is the
// authoritative payment confirmation: if the buyer's phone dies right after
// paying, the browser-side /verify never runs, but this webhook still marks
// the order paid. Configure it in the Razorpay dashboard:
//   Settings → Webhooks → add URL .../api/orders/razorpay/webhook
//   events: payment.captured, payment.failed  (+ a webhook secret)
// and set RAZORPAY_WEBHOOK_SECRET to that secret.
//
// We always answer 200 once the signature is valid so Razorpay stops
// retrying; processing failures are logged, not surfaced to Razorpay.
export async function POST(req: NextRequest) {
  // Read the RAW body first — signature is computed over these exact bytes.
  const raw = await req.text()
  const signature = req.headers.get('x-razorpay-signature')

  let valid: boolean
  try {
    valid = verifyWebhookSignature(raw, signature)
  } catch (e) {
    console.error('[YFF] webhook secret missing/misconfigured:', e)
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 })
  }
  if (!valid) {
    console.warn('[YFF] razorpay webhook signature INVALID')
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
  }

  let event: {
    event?: string
    payload?: { payment?: { entity?: { id?: string; order_id?: string } } }
  }
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Bad JSON.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const payment = event.payload?.payment?.entity
  const razorpayOrderId = payment?.order_id
  const razorpayPaymentId = payment?.id

  try {
    if (event.event === 'payment.captured' && razorpayOrderId) {
      // Two updates, split by payment method, because a captured payment means
      // different things. On a COD order the capture is only the DEPOSIT — the
      // buyer still owes cash at the door — so it lands on 'deposit_paid'. A
      // blanket 'paid' here would overwrite deposit_paid and let the rider
      // close the order without collecting the balance.
      //
      // Each update is guarded so the webhook stays idempotent against
      // Razorpay's retries and against a browser /verify that already ran.
      const now = new Date().toISOString()

      const { error: codErr } = await supabase
        .from('orders')
        .update({
          payment_status: 'deposit_paid',
          cod_deposit_paid_at: now,
          razorpay_payment_id: razorpayPaymentId ?? null,
        })
        .eq('razorpay_order_id', razorpayOrderId)
        .eq('payment_method', 'cod')
        .not('payment_status', 'in', '("deposit_paid","completed","paid")')
      if (codErr) console.error('[YFF] webhook captured (cod) update failed:', codErr.message)

      const { error } = await supabase
        .from('orders')
        .update({ payment_status: 'paid', paid_at: now, razorpay_payment_id: razorpayPaymentId ?? null })
        .eq('razorpay_order_id', razorpayOrderId)
        .neq('payment_method', 'cod')
        .neq('payment_status', 'paid')
      if (error) console.error('[YFF] webhook captured update failed:', error.message)

      const posthog = getPostHogClient()
      if (posthog) {
        posthog.capture({
          distinctId: razorpayOrderId,
          event: 'payment_captured',
          properties: {
            razorpay_order_id: razorpayOrderId,
            razorpay_payment_id: razorpayPaymentId ?? null,
          },
        })
        await posthog.flush()
      }
    } else if (event.event === 'payment.failed' && razorpayOrderId) {
      const { error } = await supabase
        .from('orders')
        .update({ payment_status: 'failed' })
        .eq('razorpay_order_id', razorpayOrderId)
        .eq('payment_status', 'pending')
      if (error) console.error('[YFF] webhook failed update failed:', error.message)
    }
    // Unknown events are acknowledged and ignored.
  } catch (e) {
    console.error('[YFF] webhook processing error:', e)
  }

  return NextResponse.json({ ok: true })
}

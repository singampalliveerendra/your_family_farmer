import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getSettlement, verifyWebhookSignature } from '@/lib/cashfree'
import { markCashfreePaid } from '@/lib/cashfree-settle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Cashfree → our server, independent of the buyer's browser. If the buyer's
// phone dies right after paying, /verify never runs, but this still marks the
// order paid. Configure it in the Cashfree dashboard:
//   Developers → Webhooks → add URL .../api/orders/cashfree/webhook
//   events: Payment Success, Payment Failed
// It is signed with CASHFREE_SECRET_KEY — there is no separate webhook secret.
//
// A valid signature gets 200 so Cashfree stops retrying; processing failures
// are logged, not surfaced.
export async function POST(req: NextRequest) {
  // Raw body first — the signature covers these exact bytes.
  const raw = await req.text()

  let valid: boolean
  try {
    valid = verifyWebhookSignature(
      raw,
      req.headers.get('x-webhook-timestamp'),
      req.headers.get('x-webhook-signature'),
    )
  } catch (e) {
    console.error('[YFF cashfree/webhook] secret missing/misconfigured:', e)
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 })
  }
  if (!valid) {
    console.warn('[YFF cashfree/webhook] signature INVALID')
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
  }

  let event: { type?: string; data?: { order?: { order_id?: string } } }
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Bad JSON.' }, { status: 400 })
  }

  const cashfreeOrderId = event.data?.order?.order_id
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    if (event.type === 'PAYMENT_SUCCESS_WEBHOOK' && cashfreeOrderId) {
      // The signed payload would do, but going back to the API applies the
      // exact same full-amount rule /verify uses, in one place.
      const s = await getSettlement(cashfreeOrderId)
      if (s.paid) {
        const err = await markCashfreePaid(supabase, { cashfreeOrderId, paymentId: s.paymentId, label: s.label })
        if (err) console.error('[YFF cashfree/webhook] success update failed:', err)
      } else {
        console.warn('[YFF cashfree/webhook] success event but order not settled:', cashfreeOrderId, s.orderStatus)
      }
    } else if (event.type === 'PAYMENT_FAILED_WEBHOOK' && cashfreeOrderId) {
      // One failed attempt. The buyer may retry inside the same checkout, and a
      // later success overwrites this (markCashfreePaid only skips paid rows).
      const { error } = await supabase
        .from('orders')
        .update({ payment_status: 'failed' })
        .eq('cashfree_order_id', cashfreeOrderId)
        .eq('payment_status', 'pending')
      if (error) console.error('[YFF cashfree/webhook] failed update failed:', error.message)
    }
    // Other events (USER_DROPPED, refunds…) are acknowledged and ignored.
  } catch (e) {
    console.error('[YFF cashfree/webhook] processing error:', e)
  }

  return NextResponse.json({ ok: true })
}

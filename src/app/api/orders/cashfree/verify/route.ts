import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { authorizeGuestBatches } from '@/lib/guest-batch-auth'
import { getSettlement } from '@/lib/cashfree'
import { markCashfreePaid } from '@/lib/cashfree-settle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Step 4: the Cashfree checkout closed. The browser posts the order id here —
// on success AND on close/failure, because the modal's own result is only a
// hint. We ask Cashfree directly and mark the rows paid only if it says PAID
// for the full amount. Nothing the browser sends can make an order paid.
//
// Returns { ok: true } when paid, { ok: false, paid: false } when Cashfree says
// it isn't (the client then abandons the order).
export async function POST(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)

  const body = await req.json().catch(() => null) as
    | {
        cashfreeOrderId?: string
        guestToken?: string
        guestBatches?: Array<{ orderIds: string[]; token: string }>
      }
    | null

  const cashfreeOrderId = String(body?.cashfreeOrderId ?? '')
  if (!/^[A-Za-z0-9_-]{1,45}$/.test(cashfreeOrderId)) {
    return NextResponse.json({ error: 'Missing payment fields.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: orders } = await supabase
    .from('orders')
    .select('id, consumer_id')
    .eq('cashfree_order_id', cashfreeOrderId)

  if (!orders || orders.length === 0) {
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
    if (!authorizeGuestBatches(orders.map((o) => o.id), body?.guestToken, body?.guestBatches)) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 })
    }
  }

  let settlement
  try {
    settlement = await getSettlement(cashfreeOrderId)
  } catch (e) {
    // Can't reach Cashfree. Say so rather than guessing either way; the webhook
    // and the reconcile cron will record the payment if it went through.
    console.error('[YFF cashfree/verify] settlement lookup failed:', e)
    return NextResponse.json(
      { error: 'Could not confirm the payment yet. If money was taken, your order will update shortly.', retryable: true },
      { status: 502 },
    )
  }

  if (!settlement.paid) {
    return NextResponse.json({ ok: false, paid: false, orderStatus: settlement.orderStatus })
  }

  const err = await markCashfreePaid(supabase, {
    cashfreeOrderId,
    paymentId: settlement.paymentId,
    label: settlement.label,
  })
  if (err) {
    console.error('[YFF cashfree/verify] update failed:', err)
    return NextResponse.json({ error: 'Could not record payment. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, paymentId: settlement.paymentId, orderIds: orders.map((o) => o.id) })
}

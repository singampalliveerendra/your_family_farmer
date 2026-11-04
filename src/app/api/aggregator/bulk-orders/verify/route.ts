import { NextRequest, NextResponse } from 'next/server'
import { requireAggregator, svc } from '@/lib/aggregator-auth'
import { getSettlement } from '@/lib/cashfree'
import { markCashfreePaid } from '@/lib/cashfree-settle'
import { isOrderPaid } from '@/lib/payment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// "Did my bulk payment go through?" — asked by the browser after the Cashfree
// checkout closes. Same answer shape as /api/orders/cashfree/verify, so the
// shop's polling rules (src/lib/cashfreePoll.ts) apply unchanged. Only the
// aggregator's own bulk orders; the answer always comes from Cashfree.

const CF_ID = /^gg_[0-9a-f]{32}_[0-9a-z]+$/

export async function POST(req: NextRequest) {
  const agg = await requireAggregator(req)
  if (!agg) return NextResponse.json({ error: 'Aggregator login required.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { cashfreeOrderId?: unknown } | null
  const cashfreeOrderId = typeof body?.cashfreeOrderId === 'string' ? body.cashfreeOrderId : ''
  if (!CF_ID.test(cashfreeOrderId)) return NextResponse.json({ error: 'Invalid payment.' }, { status: 400 })

  const supabase = svc()
  const { data } = await supabase
    .from('orders')
    .select('id, buyer_aggregator_id, payment_status')
    .eq('cashfree_order_id', cashfreeOrderId)
  const rows = (data ?? []) as Array<{ id: string; buyer_aggregator_id: string | null; payment_status: string | null }>
  if (!rows.length || rows.some((r) => r.buyer_aggregator_id !== agg.id)) {
    return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
  }
  if (rows.every((r) => isOrderPaid(r.payment_status))) {
    return NextResponse.json({ ok: true, paid: true, paymentId: 'settled', orderId: rows[0].id })
  }

  let s
  try {
    s = await getSettlement(cashfreeOrderId)
  } catch (e) {
    console.error('[YFF bulk verify] Cashfree unreachable:', e)
    return NextResponse.json({ error: 'Could not check the payment yet.' }, { status: 502 })
  }
  if (!s.paid) return NextResponse.json({ ok: false, paid: false, pending: s.inFlight, orderStatus: s.orderStatus })
  const err = await markCashfreePaid(supabase, { cashfreeOrderId, paymentId: s.paymentId, label: s.label })
  if (err) {
    console.error('[YFF bulk verify] mark paid failed:', err)
    return NextResponse.json({ error: 'Payment received — confirming your order. Please refresh in a minute.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, paid: true, paymentId: s.paymentId, orderId: rows[0].id })
}

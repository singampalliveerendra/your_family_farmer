import { NextRequest, NextResponse } from 'next/server'
import { requireAggregator, svc } from '@/lib/aggregator-auth'
import { getSettlement } from '@/lib/cashfree'
import { settleSubscriptionPayment } from '@/lib/subscriptionSettle'
import { isSubscriptionOrderId } from '@/lib/subscriptionLifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The browser asks "did my plan payment go through?" after the Cashfree
// checkout closes. Same answer shape as the shop's /api/orders/cashfree/verify,
// so the polling rules in src/lib/cashfreePoll.ts apply unchanged. The answer
// always comes from Cashfree itself; the checkout's own result is never trusted.

export async function POST(req: NextRequest) {
  const agg = await requireAggregator(req)
  if (!agg) return NextResponse.json({ error: 'Aggregator login required.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { cashfreeOrderId?: unknown } | null
  const cashfreeOrderId = typeof body?.cashfreeOrderId === 'string' ? body.cashfreeOrderId : ''
  if (!isSubscriptionOrderId(cashfreeOrderId)) return NextResponse.json({ error: 'Invalid payment.' }, { status: 400 })

  const supabase = svc()
  const { data: row } = await supabase
    .from('aggregator_subscriptions')
    .select('id, aggregator_id, status')
    .eq('cashfree_order_id', cashfreeOrderId)
    .maybeSingle()
  // Another aggregator's payment reads exactly like one that does not exist.
  if (!row || (row as { aggregator_id: string }).aggregator_id !== agg.id) {
    return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
  }
  if ((row as { status: string }).status === 'active') {
    return NextResponse.json({ ok: true, paid: true, paymentId: 'settled', subscriptionId: (row as { id: string }).id })
  }

  let s
  try {
    s = await getSettlement(cashfreeOrderId)
  } catch (e) {
    console.error('[YFF aggregator/subscription/verify] Cashfree unreachable:', e)
    return NextResponse.json({ error: 'Could not check the payment yet.' }, { status: 502 })
  }
  if (!s.paid) return NextResponse.json({ ok: false, paid: false, pending: s.inFlight, orderStatus: s.orderStatus })

  const r = await settleSubscriptionPayment(supabase, { cashfreeOrderId, paymentId: s.paymentId, label: s.label })
  if (!r.ok) {
    console.error('[YFF aggregator/subscription/verify] settle failed:', r.error)
    return NextResponse.json({ error: 'Payment received — activating your plan. Please refresh in a minute.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, paid: true, paymentId: s.paymentId, subscriptionId: r.subscriptionId })
}

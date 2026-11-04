import { NextRequest, NextResponse } from 'next/server'
import { requireAggregator, svc } from '@/lib/aggregator-auth'
import { cashfreeMode, createCashfreeOrder } from '@/lib/cashfree'
import { PUBLIC_PLAN_COLUMNS } from '@/lib/publicPlans'
import { SUB_ROW_COLUMNS, releaseHolds } from '@/lib/subscriptionSettle'
import { makeSubscriptionOrderId, quotePurchase, subscriptionReceiptNo, type StartMode } from '@/lib/subscriptionLifecycle'
import { unlocksSelling, type PlanKind, type PlanRow, type SubscriptionRow } from '@/lib/subscriptionPlans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Start a plan: { planId, startMode: 'now' | 'after_current' }.
// The price is re-quoted HERE from the live plan — never taken from the
// browser — so an offer that ended a second ago is not given.
//   ₹0 plan → active at once (source 'free_plan', with a receipt).
//   Paid    → a 'pending' row + a Cashfree order; the browser opens the
//             checkout with the session id. The row only turns active once
//             Cashfree says PAID in full (verify / webhook / reconcile).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const agg = await requireAggregator(req)
  if (!agg) return NextResponse.json({ error: 'Aggregator login required.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { planId?: unknown; startMode?: unknown } | null
  const planId = typeof body?.planId === 'string' ? body.planId : ''
  if (!UUID_RE.test(planId)) return NextResponse.json({ error: 'Choose a plan.' }, { status: 400 })
  const mode: StartMode = body?.startMode === 'after_current' ? 'after_current' : 'now'

  const supabase = svc()
  const [{ data: plan }, { data: subs }, { data: me }] = await Promise.all([
    supabase.from('subscription_plans').select(PUBLIC_PLAN_COLUMNS).eq('id', planId).maybeSingle(),
    supabase.from('aggregator_subscriptions').select(SUB_ROW_COLUMNS).eq('aggregator_id', agg.id),
    supabase.from('farmers').select('id, name, phone').eq('id', agg.id).maybeSingle(),
  ])
  if (!plan) return NextResponse.json({ error: 'This plan is not available any more.' }, { status: 404 })
  const now = new Date()
  const q = quotePurchase(plan as PlanRow, (subs ?? []) as SubscriptionRow[], mode, now)
  if (!q.ok) return NextResponse.json({ error: q.error }, { status: 400 })
  const p = plan as PlanRow

  const base = {
    aggregator_id: agg.id,
    plan_id: p.id,
    kind: p.kind,
    plan_name: p.name_en,
    price_actual: q.actual,
    duration_days: q.durationDays,
    start_mode: mode,
    starts_at: q.startsAt,
    ends_at: q.endsAt,
  }

  if (q.free) {
    const { data: row, error } = await supabase
      .from('aggregator_subscriptions')
      .insert({ ...base, source: 'free_plan', status: 'active', amount_paid: 0 })
      .select('id')
      .single()
    if (error || !row) {
      console.error('[YFF aggregator/subscription/start] free insert failed:', error?.message)
      return NextResponse.json({ error: 'Could not start the plan. Please try again.' }, { status: 500 })
    }
    const id = (row as { id: string }).id
    await supabase.from('aggregator_subscriptions').update({ receipt_no: subscriptionReceiptNo(id, now) }).eq('id', id)
    if (unlocksSelling(p.kind as PlanKind) && mode === 'now') await releaseHolds(supabase, agg.id)
    return NextResponse.json({ ok: true, free: true, subscriptionId: id })
  }

  const phone = String((me as { phone?: string } | null)?.phone ?? '').replace(/\D/g, '').slice(-10)
  if (phone.length !== 10) return NextResponse.json({ error: 'Add a valid phone number to your profile first.' }, { status: 400 })

  const { data: row, error } = await supabase
    .from('aggregator_subscriptions')
    .insert({ ...base, source: 'payment', status: 'pending', amount_paid: q.amount })
    .select('id')
    .single()
  if (error || !row) {
    console.error('[YFF aggregator/subscription/start] pending insert failed:', error?.message)
    return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 500 })
  }
  const id = (row as { id: string }).id
  const cashfreeOrderId = makeSubscriptionOrderId(id, now.getTime())

  let sessionId: string | null | undefined
  try {
    const created = await createCashfreeOrder({
      orderId: cashfreeOrderId,
      amountRupees: q.amount,
      customerId: `agg_${agg.id.replace(/-/g, '')}`.slice(0, 50),
      customerPhone: phone,
      customerName: (me as { name?: string } | null)?.name ?? null,
      note: `Go Grameen plan: ${p.name_en}`,
      tags: { kind: 'subscription', plan: p.id },
    })
    sessionId = created.payment_session_id
  } catch (e) {
    console.error('[YFF aggregator/subscription/start] Cashfree create failed:', e)
  }
  if (!sessionId) {
    await supabase.from('aggregator_subscriptions').update({ status: 'cancelled', note: 'Payment could not start' }).eq('id', id)
    return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 502 })
  }
  const { error: stampErr } = await supabase.from('aggregator_subscriptions').update({ cashfree_order_id: cashfreeOrderId }).eq('id', id)
  if (stampErr) {
    console.error('[YFF aggregator/subscription/start] order id stamp failed:', stampErr.message)
    return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 500 })
  }
  return NextResponse.json({
    ok: true,
    free: false,
    subscriptionId: id,
    mode: cashfreeMode(),
    cashfreeOrderId,
    paymentSessionId: sessionId,
    amount: q.amount,
  })
}

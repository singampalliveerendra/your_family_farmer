import { NextRequest, NextResponse } from 'next/server'
import { requireAggregator, svc } from '@/lib/aggregator-auth'
import { PUBLIC_PLAN_COLUMNS } from '@/lib/publicPlans'
import { SUB_ROW_COLUMNS } from '@/lib/subscriptionSettle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The aggregator's own subscription screen: the plans on offer and every row
// they hold (pending, active, ended, cancelled — newest first), from which the
// screen works out its status with src/lib/subscriptionLifecycle.ts. Only the
// logged-in aggregator's own rows; aggregator_subscriptions is server-only.

export async function GET(req: NextRequest) {
  const agg = await requireAggregator(req)
  if (!agg) return NextResponse.json({ error: 'Aggregator login required.' }, { status: 401 })
  const supabase = svc()
  const [plans, subs] = await Promise.all([
    supabase.from('subscription_plans').select(PUBLIC_PLAN_COLUMNS).eq('active', true).order('sort_order', { ascending: true }),
    supabase.from('aggregator_subscriptions').select(SUB_ROW_COLUMNS).eq('aggregator_id', agg.id).order('created_at', { ascending: false }),
  ])
  if (plans.error || subs.error) {
    return NextResponse.json({ plans: [], subscriptions: [], configured: false })
  }
  return NextResponse.json({ plans: plans.data ?? [], subscriptions: subs.data ?? [], configured: true })
}

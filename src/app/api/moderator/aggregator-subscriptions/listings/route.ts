import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getModeratorId, isModeratorRequest } from '@/lib/moderator-session'
import { holdListings, releaseHolds } from '@/lib/subscriptionSettle'
import { HIDE_AFTER_DAYS, hideDue } from '@/lib/subscriptionLifecycle'
import type { SubscriptionRow } from '@/lib/subscriptionPlans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// { aggregatorId, action: 'hide' | 'restore' } — the moderator's step after a
// plan has been over for 10+ days and they have spoken to the aggregator
// (decision 2026-11-04). Hiding is refused before the 10 days are up: the
// server holds that rule, not the button.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { aggregatorId?: unknown; action?: unknown } | null
  const aggregatorId = typeof body?.aggregatorId === 'string' ? body.aggregatorId : ''
  if (!UUID_RE.test(aggregatorId)) return NextResponse.json({ error: 'Invalid aggregator.' }, { status: 400 })
  const action = body?.action
  if (action !== 'hide' && action !== 'restore') return NextResponse.json({ error: 'Choose hide or restore.' }, { status: 400 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: agg } = await supabase.from('farmers').select('id, account_type').eq('id', aggregatorId).maybeSingle()
  if (!agg || (agg as { account_type?: string }).account_type !== 'aggregator') {
    return NextResponse.json({ error: 'Aggregator not found.' }, { status: 404 })
  }

  if (action === 'restore') {
    const r = await releaseHolds(supabase, aggregatorId)
    if (!r.ok) return NextResponse.json({ error: 'Could not restore. Run scripts/subscription-payments-migration.sql first.' }, { status: 500 })
    if (r.blocked > 0 && r.released === 0) {
      return NextResponse.json({ error: 'These listings cannot go back on sale: the aggregator has no Selling plan. Activate a plan for them first — the listings come back by themselves when they pay.' }, { status: 409 })
    }
    return NextResponse.json({ ok: true, restored: r.released, blocked: r.blocked })
  }

  const { data: subs } = await supabase
    .from('aggregator_subscriptions')
    .select('id, kind, source, status, starts_at, ends_at')
    .eq('aggregator_id', aggregatorId)
  const d = hideDue((subs ?? []) as SubscriptionRow[])
  if (!d.due) {
    return NextResponse.json({
      error: d.endedAt
        ? `Listings stay visible for ${HIDE_AFTER_DAYS} days after a plan ends (${d.daysSince} so far).`
        : 'This aggregator’s selling plan has not ended.',
    }, { status: 409 })
  }
  const r = await holdListings(supabase, aggregatorId, getModeratorId(req))
  if (!r.ok) return NextResponse.json({ error: 'Could not hide. Run scripts/subscription-payments-migration.sql first.' }, { status: 500 })
  return NextResponse.json({ ok: true, hidden: r.held })
}

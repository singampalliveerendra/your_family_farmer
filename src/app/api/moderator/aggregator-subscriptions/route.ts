import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getModeratorId, isModeratorRequest } from '@/lib/moderator-session'
import { manualGrant } from '@/lib/subscriptionPlans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Who holds what, and the moderator's manual switch (decision 2026-11-04:
// moderators can activate a subscription by hand, or give Free forever, e.g.
// to the client's own accounts). Platform-wide — moderators are super-users.
// aggregator_subscriptions has no anon access at all; it is read only here.

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Payment columns (scripts/subscription-payments-migration.sql) are asked for
// first and dropped if that migration has not run, so the list still loads.
const BASE_SUB_COLUMNS = 'id, aggregator_id, kind, source, status, starts_at, ends_at, amount_paid, plan_name, note, created_at'
const SUB_COLUMNS = `${BASE_SUB_COLUMNS}, paid_at, receipt_no, payment_label`

/**
 * Every aggregator with all their subscription rows (newest first), how many
 * listings buyers can see now, and how many a moderator has hidden.
 */
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const supabase = client()
  const aggs = await supabase
    .from('farmers')
    .select('id, name, village, phone, active, created_at')
    .eq('account_type', 'aggregator')
    .order('created_at', { ascending: false })
  if (aggs.error) return NextResponse.json({ error: 'Could not load aggregators.' }, { status: 500 })
  const ids = ((aggs.data ?? []) as Array<{ id: string }>).map((a) => a.id)

  let subs: { data: unknown[] | null; error: unknown } = await supabase.from('aggregator_subscriptions').select(SUB_COLUMNS).order('created_at', { ascending: false })
  if (subs.error) subs = await supabase.from('aggregator_subscriptions').select(BASE_SUB_COLUMNS).order('created_at', { ascending: false })
  if (subs.error) return NextResponse.json({ aggregators: aggs.data ?? [], subscriptions: [], configured: false })

  const [listings, holds] = ids.length
    ? await Promise.all([
        supabase.from('produce_listings').select('farmer_id').in('farmer_id', ids).in('status', ['available', 'sold_out', 'coming_soon']),
        supabase.from('subscription_listing_holds').select('aggregator_id').in('aggregator_id', ids).is('released_at', null),
      ])
    : [{ data: [] }, { data: [] }]
  const count = (rows: unknown, key: string) => {
    const m: Record<string, number> = {}
    for (const r of (Array.isArray(rows) ? rows : []) as Array<Record<string, string>>) m[r[key]] = (m[r[key]] ?? 0) + 1
    return m
  }
  return NextResponse.json({
    aggregators: aggs.data ?? [],
    subscriptions: subs.data ?? [],
    visibleListings: count(listings.data, 'farmer_id'),
    hiddenListings: count(holds.data, 'aggregator_id'),
    configured: true,
  })
}

/** Turn a subscription on by hand: { aggregatorId, kind, days | forever, note }. */
export async function POST(req: NextRequest) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const aggregatorId = typeof body.aggregatorId === 'string' ? body.aggregatorId : ''
  if (!UUID_RE.test(aggregatorId)) return NextResponse.json({ error: 'Invalid aggregator.' }, { status: 400 })
  const g = manualGrant({ kind: body.kind, days: body.days, forever: body.forever, note: body.note })
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: 400 })

  const supabase = client()
  // Only an aggregator account can hold one — never a farmer (farmers are free).
  const { data: agg } = await supabase
    .from('farmers')
    .select('id, account_type')
    .eq('id', aggregatorId)
    .maybeSingle()
  if (!agg || (agg as { account_type?: string }).account_type !== 'aggregator') {
    return NextResponse.json({ error: 'Aggregator not found.' }, { status: 404 })
  }
  const { data, error } = await supabase
    .from('aggregator_subscriptions')
    .insert({ ...g.row, aggregator_id: aggregatorId, status: 'active', granted_by: getModeratorId(req) })
    .select(SUB_COLUMNS)
    .single()
  if (error) {
    console.error('[YFF moderator/aggregator-subscriptions] grant failed:', error.message)
    return NextResponse.json({ error: 'Could not activate. Run scripts/subscription-migration.sql first.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, subscription: data })
}

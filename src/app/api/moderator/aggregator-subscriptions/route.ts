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
const SUB_COLUMNS = 'id, aggregator_id, kind, source, status, starts_at, ends_at, amount_paid, plan_name, note, created_at'

/** Every aggregator with all their subscription rows (newest first). */
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const supabase = client()
  const [aggs, subs] = await Promise.all([
    supabase
      .from('farmers')
      .select('id, name, village, phone, active, created_at')
      .eq('account_type', 'aggregator')
      .order('created_at', { ascending: false }),
    supabase
      .from('aggregator_subscriptions')
      .select(SUB_COLUMNS)
      .order('created_at', { ascending: false }),
  ])
  if (aggs.error) return NextResponse.json({ error: 'Could not load aggregators.' }, { status: 500 })
  if (subs.error) return NextResponse.json({ aggregators: aggs.data ?? [], subscriptions: [], configured: false })
  return NextResponse.json({ aggregators: aggs.data ?? [], subscriptions: subs.data ?? [], configured: true })
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

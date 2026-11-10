import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getModeratorId, isModeratorRequest } from '@/lib/moderator-session'
import { PLAN_ROW_KINDS, validatePlan, type PlanInput } from '@/lib/subscriptionPlans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Edit one plan: price, offer on/off, end date, show/hide — the screen sends
// the whole plan every time, so one validation covers every change. A plan is
// never deleted: aggregators who bought it keep their row (plan_id is kept,
// and the name/price were copied onto the subscription at purchase). Hide it
// instead (active = false). A plan's kind never changes (2026-11-10: exactly
// one Buying and one Selling plan), so `kind` is never written here.

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 })
  const body = (await req.json().catch(() => null)) as PlanInput | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const v = validatePlan(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const columns: Partial<typeof v.columns> = { ...v.columns }
  delete columns.kind
  const { data, error } = await client()
    .from('subscription_plans')
    .update({ ...columns, updated_by: getModeratorId(req), updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('kind', [...PLAN_ROW_KINDS])
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('[YFF moderator/subscription-plans] update failed:', error.message)
    return NextResponse.json({ error: 'Could not save the plan.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Plan not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

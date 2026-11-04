import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getModeratorId, isModeratorRequest } from '@/lib/moderator-session'
import { validatePlan, type PlanInput } from '@/lib/subscriptionPlans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Aggregator subscription plans (scripts/subscription-migration.sql).
// Moderators are the super-users for now (decision 2026-11-04): every
// moderator sees and edits every plan, whatever their zone. The homepage reads
// active plans with the public key (RLS allows that one read); every write
// goes through here with the service role.

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const PLAN_COLUMNS =
  'id, kind, name_en, name_te, duration_days, actual_price, offer_enabled, offer_price, offer_ends_at, offer_label_en, offer_label_te, highlights_en, highlights_te, active, sort_order, created_at, updated_at'

const NOT_READY = 'Subscriptions are not switched on yet. Run scripts/subscription-migration.sql first.'

/** Every plan, hidden ones too. */
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const { data, error } = await client()
    .from('subscription_plans')
    .select(PLAN_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ plans: [], configured: false })
  return NextResponse.json({ plans: data ?? [], configured: true })
}

/** Add a plan. */
export async function POST(req: NextRequest) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as PlanInput | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const v = validatePlan(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { data, error } = await client()
    .from('subscription_plans')
    .insert({ ...v.columns, updated_by: getModeratorId(req), updated_at: new Date().toISOString() })
    .select(PLAN_COLUMNS)
    .single()
  if (error) {
    console.error('[YFF moderator/subscription-plans] insert failed:', error.message)
    return NextResponse.json({ error: NOT_READY }, { status: 500 })
  }
  return NextResponse.json({ ok: true, plan: data })
}

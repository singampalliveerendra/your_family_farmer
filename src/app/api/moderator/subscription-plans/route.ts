import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest } from '@/lib/moderator-session'
import { PLAN_ROW_KINDS } from '@/lib/subscriptionPlans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Aggregator subscription plans (scripts/subscription-migration.sql).
// Since 2026-11-10 there are exactly two plans, Buying and Selling, created by
// scripts/two-plans-migration.sql. Moderators edit them (PUT …/[id]); they
// cannot add or delete plans, so there is no POST. Moderators are the super-users for now (decision 2026-11-04): every
// moderator sees and edits every plan, whatever their zone. The homepage reads
// active plans with the public key (RLS allows that one read); every write
// goes through here with the service role.

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const PLAN_COLUMNS =
  'id, kind, name_en, name_te, duration_days, actual_price, offer_enabled, offer_price, offer_ends_at, offer_label_en, offer_label_te, highlights_en, highlights_te, active, sort_order, created_at, updated_at'

/** The two plans (Buying first), hidden ones too. */
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const { data, error } = await client()
    .from('subscription_plans')
    .select(PLAN_COLUMNS)
    .in('kind', [...PLAN_ROW_KINDS])
  if (error) return NextResponse.json({ plans: [], configured: false })
  const order = (k: string) => PLAN_ROW_KINDS.indexOf(k as (typeof PLAN_ROW_KINDS)[number])
  const plans = (data ?? []).slice().sort((a, b) => order(a.kind) - order(b.kind))
  // Both rows must exist; if one is missing the two-plans migration has not run.
  return NextResponse.json({ plans, configured: plans.length === PLAN_ROW_KINDS.length })
}

/** Plans are fixed: there is nothing to add. */
export async function POST(req: NextRequest) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  return NextResponse.json({ error: 'There are only two plans, Buying and Selling. Edit one of them instead.' }, { status: 405 })
}

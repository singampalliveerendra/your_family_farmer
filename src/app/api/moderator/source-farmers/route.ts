import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'
import {
  UUID_RE,
  createSourceFarmer,
  listSourceFarmers,
  validateSourceFarmer,
} from '@/lib/source-farmers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Moderator access to an aggregator's source-farmer list — full CRUD, the same
// rules the aggregator gets. Everything shared lives in @/lib/source-farmers so
// validation and the delete guard cannot drift between the two surfaces.
//
// Scoped to the moderator's zone throughout, like every other moderator route:
// an aggregator outside the zone reads as not found.

function svc(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Confirms the target is an aggregator inside this moderator's zone. */
async function resolveAggregator(
  supabase: SupabaseClient,
  aggregatorId: string,
  zone: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data } = await supabase
    .from('farmers')
    .select('id, account_type, region_slug')
    .eq('id', aggregatorId)
    .maybeSingle()

  if (!data || data.region_slug !== zone) {
    return { ok: false, status: 404, error: 'Aggregator not found in your zone.' }
  }
  if (data.account_type !== 'aggregator') {
    return { ok: false, status: 400, error: 'That account is not an aggregator.' }
  }
  return { ok: true }
}

export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }

  const aggregatorId = req.nextUrl.searchParams.get('aggregatorId') ?? ''
  if (!UUID_RE.test(aggregatorId)) {
    return NextResponse.json({ error: 'Invalid aggregator id.' }, { status: 400 })
  }

  const supabase = svc()
  const allowed = await resolveAggregator(supabase, aggregatorId, getModeratorZone(req))
  if (!allowed.ok) return NextResponse.json({ error: allowed.error }, { status: allowed.status })

  const { data, error } = await listSourceFarmers(supabase, aggregatorId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, sourceFarmers: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const aggregatorId = String((body as { aggregatorId?: unknown }).aggregatorId ?? '')
  if (!UUID_RE.test(aggregatorId)) {
    return NextResponse.json({ error: 'Invalid aggregator id.' }, { status: 400 })
  }

  const parsed = validateSourceFarmer(body as Record<string, unknown>)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const supabase = svc()
  const allowed = await resolveAggregator(supabase, aggregatorId, getModeratorZone(req))
  if (!allowed.ok) return NextResponse.json({ error: allowed.error }, { status: allowed.status })

  const { data, error } = await createSourceFarmer(supabase, aggregatorId, parsed.value)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, sourceFarmer: data })
}

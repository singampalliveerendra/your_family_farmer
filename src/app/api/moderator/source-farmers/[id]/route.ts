import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'
import {
  UUID_RE,
  deleteSourceFarmer,
  updateSourceFarmer,
  validateSourceFarmer,
} from '@/lib/source-farmers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function svc(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Walks source farmer → owning aggregator → zone. Returns the aggregator id so
 * the shared helpers can scope their writes to it, exactly as they do for the
 * aggregator's own routes.
 */
async function ownerInZone(
  supabase: SupabaseClient,
  sourceFarmerId: string,
  zone: string,
): Promise<{ ok: true; aggregatorId: string } | { ok: false; error: string; status: number }> {
  const { data: sf } = await supabase
    .from('source_farmers')
    .select('id, aggregator_id')
    .eq('id', sourceFarmerId)
    .maybeSingle()

  if (!sf) return { ok: false, status: 404, error: 'Farmer not found.' }

  const { data: agg } = await supabase
    .from('farmers')
    .select('id, region_slug')
    .eq('id', sf.aggregator_id as string)
    .maybeSingle()

  if (!agg || agg.region_slug !== zone) {
    return { ok: false, status: 404, error: 'Farmer not found in your zone.' }
  }
  return { ok: true, aggregatorId: sf.aggregator_id as string }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const parsed = validateSourceFarmer(body as Record<string, unknown>)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const supabase = svc()
  const owner = await ownerInZone(supabase, id, getModeratorZone(req))
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const { data, error } = await updateSourceFarmer(supabase, owner.aggregatorId, id, parsed.value)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Farmer not found.' }, { status: 404 })

  return NextResponse.json({ ok: true, sourceFarmer: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 })

  const supabase = svc()
  const owner = await ownerInZone(supabase, id, getModeratorZone(req))
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  // Same guard the aggregator hits: a farmer with harvests on record keeps their
  // attribution and cannot be deleted.
  const result = await deleteSourceFarmer(supabase, owner.aggregatorId, id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ ok: true })
}

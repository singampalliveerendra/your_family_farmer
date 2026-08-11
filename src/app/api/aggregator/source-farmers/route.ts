import { NextRequest, NextResponse } from 'next/server'
import { requireAggregator, svc } from '@/lib/aggregator-auth'
import {
  createSourceFarmer,
  listSourceFarmers,
  validateSourceFarmer,
} from '@/lib/source-farmers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The aggregator's own view of their source-farmer list. Moderators reach the
// same records through /api/moderator/source-farmers, which shares the rules in
// @/lib/source-farmers so the two surfaces cannot drift.

export async function GET(req: NextRequest) {
  const agg = await requireAggregator(req)
  if (!agg) return NextResponse.json({ error: 'Aggregator login required.' }, { status: 401 })

  const { data, error } = await listSourceFarmers(svc(), agg.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, sourceFarmers: data ?? [] })
}

export async function POST(req: NextRequest) {
  const agg = await requireAggregator(req)
  if (!agg) return NextResponse.json({ error: 'Aggregator login required.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const parsed = validateSourceFarmer(body as Record<string, unknown>)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await createSourceFarmer(svc(), agg.id, parsed.value)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, sourceFarmer: data })
}

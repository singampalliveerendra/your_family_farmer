import { NextRequest, NextResponse } from 'next/server'
import {
  UUID_RE,
  deleteSourceFarmer,
  updateSourceFarmer,
  validateSourceFarmer,
} from '@/lib/source-farmers'
import { requireAggregator, svc } from '@/lib/aggregator-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const agg = await requireAggregator(req)
  if (!agg) return NextResponse.json({ error: 'Aggregator login required.' }, { status: 401 })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const parsed = validateSourceFarmer(body as Record<string, unknown>)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await updateSourceFarmer(svc(), agg.id, id, parsed.value)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Scoped to aggregator_id, so a miss means it is not theirs.
  if (!data) return NextResponse.json({ error: 'Farmer not found.' }, { status: 404 })

  return NextResponse.json({ ok: true, sourceFarmer: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const agg = await requireAggregator(req)
  if (!agg) return NextResponse.json({ error: 'Aggregator login required.' }, { status: 401 })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 })

  const result = await deleteSourceFarmer(svc(), agg.id, id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ ok: true })
}

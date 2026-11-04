import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The platform fee on bulk orders (Phase 6). 0% for now (decision
// 2026-11-04); moderators can change it. Charged on the produce only — never
// on the seller's transport charge (src/lib/bulkOrder.ts). Separate from the
// household platform fee (/api/moderator/platform-fee).

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const { data, error } = await client().from('platform_settings').select('bulk_fee_percent').eq('id', 1).maybeSingle()
  if (error) return NextResponse.json({ feePercent: 0, configured: false })
  return NextResponse.json({ feePercent: Number((data as { bulk_fee_percent?: unknown } | null)?.bulk_fee_percent ?? 0), configured: true })
}

export async function POST(req: NextRequest) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { feePercent?: unknown } | null
  const raw = body?.feePercent
  const pct = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return NextResponse.json({ error: 'Enter a percentage between 0 and 100.' }, { status: 400 })
  }
  const value = Math.round(pct * 100) / 100
  const { error } = await client()
    .from('platform_settings')
    .upsert({ id: 1, bulk_fee_percent: value, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  if (error) {
    console.error('[YFF moderator/bulk-fee] save failed:', error.message)
    return NextResponse.json({ error: 'Could not save. Run scripts/bulk-orders-migration.sql first.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, feePercent: value })
}

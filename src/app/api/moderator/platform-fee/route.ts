import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Read the current global platform-fee percentage.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const supabase = client()
  const { data, error } = await supabase
    .from('platform_settings')
    .select('fee_percent')
    .eq('id', 1)
    .maybeSingle()
  if (error) {
    // Table likely not migrated yet — report 0 rather than failing the screen.
    return NextResponse.json({ feePercent: 0, configured: false })
  }
  return NextResponse.json({ feePercent: Number(data?.fee_percent ?? 0), configured: true })
}

// Set the global platform-fee percentage (applies to all new orders).
export async function POST(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const body = await req.json().catch(() => null) as { feePercent?: unknown } | null
  const pct = Number(body?.feePercent)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return NextResponse.json({ error: 'Enter a percentage between 0 and 100.' }, { status: 400 })
  }
  const supabase = client()
  const { error } = await supabase
    .from('platform_settings')
    .upsert({ id: 1, fee_percent: pct, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  if (error) {
    console.error('[YFF moderator/platform-fee] save failed:', error.message)
    return NextResponse.json({ error: 'Could not save. Run the platform-fee migration first.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, feePercent: pct })
}

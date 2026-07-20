import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest } from '@/lib/moderator-session'
import {
  DELIVERY_FEE_MAX,
  DEFAULT_DELIVERY_BASE_FEE,
  DEFAULT_DELIVERY_EXTRA_FEE,
} from '@/lib/delivery-fee'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Read the current delivery charges. base = charged once per checkout; extra =
// added for each farmer beyond the first.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const supabase = client()
  const { data, error } = await supabase
    .from('platform_settings')
    .select('delivery_base_fee, delivery_extra_fee')
    .eq('id', 1)
    .maybeSingle()
  if (error) {
    // Columns likely not migrated yet — report the defaults rather than failing.
    return NextResponse.json({
      base: DEFAULT_DELIVERY_BASE_FEE,
      extra: DEFAULT_DELIVERY_EXTRA_FEE,
      configured: false,
    })
  }
  return NextResponse.json({
    base: Number(data?.delivery_base_fee ?? DEFAULT_DELIVERY_BASE_FEE),
    extra: Number(data?.delivery_extra_fee ?? DEFAULT_DELIVERY_EXTRA_FEE),
    configured: true,
  })
}

// Set the delivery charges (apply to all new checkouts).
export async function POST(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const body = await req.json().catch(() => null) as { base?: unknown; extra?: unknown } | null
  const base = Number(body?.base)
  const extra = Number(body?.extra)
  if (!Number.isFinite(base) || base < 0 || base > DELIVERY_FEE_MAX) {
    return NextResponse.json({ error: `Enter a base charge between 0 and ${DELIVERY_FEE_MAX}.` }, { status: 400 })
  }
  if (!Number.isFinite(extra) || extra < 0 || extra > DELIVERY_FEE_MAX) {
    return NextResponse.json({ error: `Enter an additional charge between 0 and ${DELIVERY_FEE_MAX}.` }, { status: 400 })
  }
  const supabase = client()
  const { error } = await supabase
    .from('platform_settings')
    .upsert(
      { id: 1, delivery_base_fee: base, delivery_extra_fee: extra, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    )
  if (error) {
    console.error('[YFF moderator/delivery-fee] save failed:', error.message)
    return NextResponse.json({ error: 'Could not save. Run the delivery-charge migration first.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, base, extra })
}

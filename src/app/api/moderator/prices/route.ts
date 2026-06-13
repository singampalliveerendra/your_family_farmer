import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Parse a price input into a non-negative number, or null when blank.
// Returns `undefined` when the value is present but not a valid number.
function parsePrice(v: unknown): number | null | undefined {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.round(n * 100) / 100
}

// GET — every price guideline in the moderator's zone, alphabetical by crop.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone(req)
  const supabase = svc()

  const { data: prices, error } = await supabase
    .from('price_guidelines')
    .select('id, crop_name, region_slug, min_price, max_price, unit, updated_at')
    .eq('region_slug', zone)
    .order('crop_name', { ascending: true })
  if (error) {
    console.error('[YFF moderator/prices] query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ prices: prices ?? [] })
}

// POST — add a guideline for a crop not yet listed in this zone.
//   { crop_name, min_price?, max_price?, unit? }
export async function POST(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone(req)
  const supabase = svc()

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })

  const crop_name = String(body.crop_name ?? '').trim()
  if (!crop_name) return NextResponse.json({ error: 'Crop name is required.' }, { status: 400 })

  const min_price = parsePrice(body.min_price)
  const max_price = parsePrice(body.max_price)
  if (min_price === undefined || max_price === undefined) {
    return NextResponse.json({ error: 'Prices must be non-negative numbers.' }, { status: 400 })
  }
  if (min_price != null && max_price != null && min_price > max_price) {
    return NextResponse.json({ error: 'Min price cannot be more than max price.' }, { status: 400 })
  }
  const unit = String(body.unit ?? 'kg').trim() || 'kg'

  // Guard against duplicates in this zone (case-insensitive). The unique index
  // also enforces it, but this gives a friendlier message.
  const { data: existing } = await supabase
    .from('price_guidelines')
    .select('id')
    .eq('region_slug', zone)
    .ilike('crop_name', crop_name)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: `${crop_name} already has a guideline.` }, { status: 409 })
  }

  const { data: inserted, error } = await supabase
    .from('price_guidelines')
    .insert({ crop_name, region_slug: zone, min_price, max_price, unit })
    .select('id, crop_name, region_slug, min_price, max_price, unit, updated_at')
    .single()
  if (error) {
    console.error('[YFF moderator/prices] insert failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ price: inserted })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// GET /api/prices?crop=Tomato&region=tadepalligudem
// Public read for the farmer listing form's suggested-price hint. Returns the
// moderator's guideline for that crop in that zone, or { price: null } when
// none is set. price_guidelines is service-role only, so this reads it server
// side rather than exposing the table to the anon key.
// Moderator price guidelines change rarely; let the CDN absorb repeat lookups
// (the farmer form asks once per crop typed).
const HINT_CACHE = 'public, s-maxage=300, stale-while-revalidate=600'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const crop = (searchParams.get('crop') ?? '').trim()
  const region = (searchParams.get('region') ?? '').trim()
  if (!crop || !region) {
    return NextResponse.json({ price: null }, { headers: { 'Cache-Control': HINT_CACHE } })
  }

  const supabase = svc()
  const { data, error } = await supabase
    .from('price_guidelines')
    .select('crop_name, min_price, max_price, unit')
    .eq('region_slug', region)
    .ilike('crop_name', crop)
    .maybeSingle()
  if (error) {
    console.error('[YFF prices] query failed:', error.message)
    return NextResponse.json({ price: null })
  }
  // Only useful as a hint if at least one bound is set.
  if (!data || (data.min_price == null && data.max_price == null)) {
    return NextResponse.json({ price: null }, { headers: { 'Cache-Control': HINT_CACHE } })
  }
  return NextResponse.json({ price: data }, { headers: { 'Cache-Control': HINT_CACHE } })
}

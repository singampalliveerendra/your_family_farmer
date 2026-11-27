import { NextRequest, NextResponse } from 'next/server'
import { farmAreas } from '@/lib/farmArea'

export const dynamic = 'force-dynamic'

// GET ?ids=<uuid>,<uuid> — the rough (~5 km grid) farm point of each farmer,
// for the cart's "is this buyer within 20 km, or does it go by cargo?"
// (src/lib/courierOptions.ts cargoNeeded, 2026-11-27). The same rough point
// /api/produce already sends with every produce — never the exact farm.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_IDS = 50

export async function GET(req: NextRequest) {
  const ids = [...new Set((req.nextUrl.searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter((s) => UUID_RE.test(s)))].slice(0, MAX_IDS)
  if (!ids.length) return NextResponse.json({ areas: {} })
  const areas = await farmAreas(ids)
  const out: Record<string, { lat: number; lng: number }> = {}
  for (const [id, a] of Object.entries(areas)) out[id] = { lat: a.lat, lng: a.lng }
  return NextResponse.json({ areas: out }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } })
}

import { NextRequest, NextResponse } from 'next/server'
import { listingOfModerator, svc, UUID_RE } from '@/lib/sellerAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The quality fields a moderator sets after saving a listing (category, soil
// pH, pesticide result, photo gallery). Best-effort by design — these columns
// may not exist before the quality migration — and, since the security fix
// (2026-11-04), through here rather than a direct write with the public key.
// Zone-checked like every moderator listing route.

const isHttps = (u: unknown) => typeof u === 'string' && /^https:\/\//.test(u) && u.length < 600

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = svc()
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid listing.' }, { status: 400 })
  if (!(await listingOfModerator(supabase, req, id))) return NextResponse.json({ error: 'Listing not found in your zone.' }, { status: 404 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const ph = b.soil_ph === null || b.soil_ph === '' || b.soil_ph === undefined ? null : Number(b.soil_ph)
  const patch = {
    category: typeof b.category === 'string' && b.category.trim() ? b.category.trim().slice(0, 40) : null,
    soil_ph: ph !== null && Number.isFinite(ph) && ph >= 0 && ph <= 14 ? ph : null,
    pesticide_result: typeof b.pesticide_result === 'string' && b.pesticide_result.trim() ? b.pesticide_result.trim().slice(0, 200) : null,
    image_urls: Array.isArray(b.image_urls) ? b.image_urls.filter(isHttps).slice(0, 12) : null,
  }
  const { error } = await supabase.from('produce_listings').update(patch).eq('id', id)
  if (error) return NextResponse.json({ ok: false, skipped: error.message }, { status: 200 })
  return NextResponse.json({ ok: true })
}

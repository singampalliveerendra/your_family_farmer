import { NextRequest, NextResponse } from 'next/server'
import { requireSeller, svc } from '@/lib/sellerAuth'
import { reqLang, tr } from '@/lib/serverLang'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Add a photo to the logged-in seller's farm gallery (`media`). The photo must
// already be in THEIR OWN folder of farm-images (uploaded through
// /api/uploads/farm-image) — a URL pointing anywhere else is refused.
export async function POST(req: NextRequest) {
  const supabase = svc()
  const me = await requireSeller(req, supabase)
  if (!me) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { url?: unknown; caption?: unknown } | null
  const url = typeof body?.url === 'string' ? body.url : ''
  const ownFolder = supabase.storage.from('farm-images').getPublicUrl(`${me.id}/`).data.publicUrl
  // A plain file name right inside their folder — no "../" into another farmer's.
  if (!url.startsWith(ownFolder) || !/^[A-Za-z0-9_-]+\.[a-z0-9]+$/.test(url.slice(ownFolder.length))) {
    return NextResponse.json({ error: tr(reqLang(req), 'Upload the photo first.', 'ముందుగా ఫోటో అప్‌లోడ్ చేయండి.') }, { status: 400 })
  }
  const { count } = await supabase.from('media').select('id', { count: 'exact', head: true }).eq('farmer_id', me.id)
  const caption = typeof body?.caption === 'string' && body.caption.trim() ? body.caption.trim().slice(0, 200) : null
  const { data, error } = await supabase
    .from('media')
    .insert({ farmer_id: me.id, type: 'photo', url, caption, sort_order: count ?? 0 })
    .select('id, url, caption')
    .single()
  if (error || !data) return NextResponse.json({ error: tr(reqLang(req), 'Could not save the photo.', 'ఫోటో సేవ్ కాలేదు.') }, { status: 500 })
  return NextResponse.json({ ok: true, photo: data })
}

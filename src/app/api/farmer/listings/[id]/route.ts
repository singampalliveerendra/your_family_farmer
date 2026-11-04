import { NextRequest, NextResponse } from 'next/server'
import { UUID_RE, listingOfSeller, requireSeller, svc } from '@/lib/sellerAuth'
import { reqLang, tr } from '@/lib/serverLang'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Delete one of the logged-in seller's own produce. (Edits, pause / resume and
// the quality fields go through /api/farmer/update-listing.)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = svc()
  const me = await requireSeller(req, supabase)
  if (!me) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })
  const lang = reqLang(req)
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid listing.' }, { status: 400 })
  if (!(await listingOfSeller(supabase, id, me.id))) {
    return NextResponse.json({ error: tr(lang, 'Produce not found or not yours.', 'ఉత్పత్తి కనబడలేదు లేదా మీది కాదు.') }, { status: 403 })
  }
  const { error } = await supabase.from('produce_listings').delete().eq('id', id).eq('farmer_id', me.id)
  if (error) {
    return NextResponse.json({ error: tr(lang, 'This produce has orders, so it cannot be deleted. Pause it instead.', 'ఈ ఉత్పత్తికి ఆర్డర్లు ఉన్నాయి, కాబట్టి తొలగించలేరు. బదులుగా ఆపివేయండి.') }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}

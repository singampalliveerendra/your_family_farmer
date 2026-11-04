import { NextRequest, NextResponse } from 'next/server'
import { UUID_RE, requireSeller, svc } from '@/lib/sellerAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Remove a photo from the logged-in seller's own gallery.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = svc()
  const me = await requireSeller(req, supabase)
  if (!me) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid photo.' }, { status: 400 })
  const { data, error } = await supabase.from('media').delete().eq('id', id).eq('farmer_id', me.id).select('id')
  if (error) return NextResponse.json({ error: 'Could not remove the photo.' }, { status: 500 })
  if (!Array.isArray(data) || !data.length) return NextResponse.json({ error: 'Photo not found or not yours.' }, { status: 403 })
  return NextResponse.json({ ok: true })
}

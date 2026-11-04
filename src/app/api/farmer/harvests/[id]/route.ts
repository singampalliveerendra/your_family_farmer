import { NextRequest, NextResponse } from 'next/server'
import { listingOfSeller, requireSeller, svc } from '@/lib/sellerAuth'
import { deleteHarvest, patchHarvest } from '@/lib/harvestWriteServer'
import { reqLang, tr } from '@/lib/serverLang'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Edit (time / quantity), pause / resume, or delete one of the seller's harvests.

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = svc()
  const me = await requireSeller(req, supabase)
  if (!me) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const lang = reqLang(req)
  return patchHarvest(supabase, (id) => listingOfSeller(supabase, id, me.id), (await ctx.params).id, body, (en, te) => tr(lang, en, te))
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = svc()
  const me = await requireSeller(req, supabase)
  if (!me) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })
  const lang = reqLang(req)
  return deleteHarvest(supabase, (id) => listingOfSeller(supabase, id, me.id), (await ctx.params).id, (en, te) => tr(lang, en, te))
}

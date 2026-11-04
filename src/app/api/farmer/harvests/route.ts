import { NextRequest, NextResponse } from 'next/server'
import { listingOfSeller, requireSeller, svc } from '@/lib/sellerAuth'
import { createHarvest } from '@/lib/harvestWriteServer'
import { reqLang, tr } from '@/lib/serverLang'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Log a harvest on one of the logged-in seller's own produce (harvest manager).
export async function POST(req: NextRequest) {
  const supabase = svc()
  const me = await requireSeller(req, supabase)
  if (!me) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const lang = reqLang(req)
  return createHarvest(supabase, (id) => listingOfSeller(supabase, id, me.id), body, (en, te) => tr(lang, en, te))
}

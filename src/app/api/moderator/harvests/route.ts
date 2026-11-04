import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest } from '@/lib/moderator-session'
import { listingOfModerator, svc } from '@/lib/sellerAuth'
import { createHarvest } from '@/lib/harvestWriteServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// A moderator logs a harvest for a farmer in their own zone (harvest manager
// on the moderator listing form). English, like the rest of the moderator area.
export async function POST(req: NextRequest) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const supabase = svc()
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  return createHarvest(supabase, (id) => listingOfModerator(supabase, req, id), body, (en) => en)
}

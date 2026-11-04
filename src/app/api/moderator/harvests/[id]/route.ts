import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest } from '@/lib/moderator-session'
import { listingOfModerator, svc } from '@/lib/sellerAuth'
import { deleteHarvest, patchHarvest } from '@/lib/harvestWriteServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Edit, pause / resume or delete a harvest of a farmer in the moderator's zone.

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const supabase = svc()
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  return patchHarvest(supabase, (id) => listingOfModerator(supabase, req, id), (await ctx.params).id, body, (en) => en)
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const supabase = svc()
  return deleteHarvest(supabase, (id) => listingOfModerator(supabase, req, id), (await ctx.params).id, (en) => en)
}

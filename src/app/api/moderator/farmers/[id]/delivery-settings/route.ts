import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'
import { forModerator, loadSettings, saveSettings } from '@/lib/deliverySettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// A farmer's delivery settings, for the moderator (same as the farmer's own
// /api/farmer/delivery-settings — Farmer↔Moderator parity). Zone-scoped.

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function farmerInZone(req: NextRequest, id: string) {
  if (!UUID_RE.test(id)) return null
  const supabase = svc()
  const { data } = await supabase.from('farmers').select('id, region_slug').eq('id', id).maybeSingle()
  if (!data || (data as { region_slug?: string | null }).region_slug !== getModeratorZone(req)) return null
  return supabase
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const { id } = await params
  const supabase = await farmerInZone(req, id)
  if (!supabase) return NextResponse.json({ error: 'Farmer not found in your zone.' }, { status: 404 })
  const { ready, settings } = await loadSettings(supabase, id)
  return NextResponse.json({ ready, settings }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const { id } = await params
  const supabase = await farmerInZone(req, id)
  if (!supabase) return NextResponse.json({ error: 'Farmer not found in your zone.' }, { status: 404 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const r = await saveSettings(supabase, id, body)
  if (!r.ok) return NextResponse.json({ error: forModerator(r.error.en) }, { status: r.status })
  return NextResponse.json({ ok: true, settings: r.settings })
}

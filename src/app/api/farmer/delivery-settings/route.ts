import { NextRequest, NextResponse } from 'next/server'
import { requireSeller, svc } from '@/lib/sellerAuth'
import { reqLang, tr } from '@/lib/serverLang'
import { loadSettings, saveSettings } from '@/lib/deliverySettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The logged-in seller's delivery settings (profile, 2026-11-27): cargo
// services + who pays, local delivery who pays / charge / distance. Set once,
// used by every produce (src/lib/deliverySettings.ts).

export async function GET(req: NextRequest) {
  const supabase = svc()
  const me = await requireSeller(req, supabase)
  if (!me) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })
  const { ready, settings } = await loadSettings(supabase, me.id)
  return NextResponse.json({ ready, settings }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest) {
  const supabase = svc()
  const me = await requireSeller(req, supabase)
  if (!me) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const r = await saveSettings(supabase, me.id, body)
  if (!r.ok) return NextResponse.json({ error: tr(reqLang(req), r.error.en, r.error.te) }, { status: r.status })
  return NextResponse.json({ ok: true, settings: r.settings })
}

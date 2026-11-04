import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { parseIntent } from '@/lib/demandIntent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Edit or remove one of the logged-in buyer's OWN requests.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const p = parseIntent(body ?? {}, false)
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 })
  const { data, error } = await svc().from('demand_intents').update(p.fields).eq('id', id).eq('consumer_id', session.consumerId).select('id')
  if (error) return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
  if (!Array.isArray(data) || !data.length) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const { data, error } = await svc().from('demand_intents').delete().eq('id', id).eq('consumer_id', session.consumerId).select('id')
  if (error) return NextResponse.json({ error: 'Could not remove.' }, { status: 500 })
  if (!Array.isArray(data) || !data.length) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { rateLimit } from '@/lib/rate-limit'
import { parseIntent } from '@/lib/demandIntent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Buyer requests ("demand intents") — security fix 2026-11-04. Before, the
// table was public: anyone could read every buyer's phone and location, and
// edit or delete anyone's request. Now:
//   GET  — the logged-in buyer's own requests.
//   POST — post one (logged-in or not, rate-limited). consumer_id comes from
//          the cookie, never the request.

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })
  const { data, error } = await svc()
    .from('demand_intents')
    .select('id, crop_name, quantity_kg, needed_by_date, delivery_location, fulfilled, created_at')
    .eq('consumer_id', session.consumerId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Could not load your requests.' }, { status: 500 })
  return NextResponse.json({ intents: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (!rateLimit(`intent:${ip}`, 10, 60 * 60 * 1000)) return NextResponse.json({ error: 'Too many requests. Please try later.' }, { status: 429 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const p = parseIntent(body, true)
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 })
  const session = getConsumerSessionFromRequest(req)
  const { error } = await svc().from('demand_intents').insert({ ...p.fields, consumer_id: session?.consumerId ?? null })
  if (error) return NextResponse.json({ error: 'Could not post your request. Please try again.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

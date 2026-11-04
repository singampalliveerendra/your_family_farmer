import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Switch a subscription off. Never deleted — the row stays as the record of
// what the aggregator held (and, for a paid one, what they paid). No refund
// is made here: there are no refunds (decision 2026-11-04).

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid subscription.' }, { status: 400 })
  const { data, error } = await client()
    .from('aggregator_subscriptions')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'active')
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not switch it off.' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Already off, or not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Count this farmer's followers (head count, no rows transferred).
async function followerCount(supabase: ReturnType<typeof admin>, farmerId: string): Promise<number> {
  const { count } = await supabase
    .from('farmer_follows')
    .select('id', { count: 'exact', head: true })
    .eq('farmer_id', farmerId)
  return count ?? 0
}

// GET — public. Returns { count, following }. `following` reflects the logged-in
// consumer (false when anonymous). Used by the profile to render the live count
// + button state on load.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid farmer id.' }, { status: 400 })

  const supabase = admin()
  const count = await followerCount(supabase, id)

  let following = false
  const session = getConsumerSessionFromRequest(req)
  if (session) {
    const { data } = await supabase
      .from('farmer_follows')
      .select('id')
      .eq('farmer_id', id)
      .eq('consumer_id', session.consumerId)
      .maybeSingle()
    following = !!data
  }

  return NextResponse.json({ ok: true, count, following })
}

// POST — toggle follow/unfollow. Requires a logged-in consumer so each person
// counts once. Returns the resulting { count, following }.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in to follow.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid farmer id.' }, { status: 400 })

  const supabase = admin()

  // Already following? Then this tap unfollows.
  const { data: existing } = await supabase
    .from('farmer_follows')
    .select('id')
    .eq('farmer_id', id)
    .eq('consumer_id', session.consumerId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('farmer_follows').delete().eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, count: await followerCount(supabase, id), following: false })
  }

  // Insert; ignore a duplicate (a double-tap race) — the unique index protects us.
  const { error } = await supabase
    .from('farmer_follows')
    .insert({ farmer_id: id, consumer_id: session.consumerId })
  if (error && !/duplicate key|unique/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, count: await followerCount(supabase, id), following: true })
}

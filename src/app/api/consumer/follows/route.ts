import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET — the farmer ids the signed-in buyer follows (empty when signed out).
// Split out of /api/consumer/farmers so that list can be CDN-cached for
// everyone; this one is personal and must never be cached.
export async function GET(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)
  const noStore = { 'Cache-Control': 'private, no-store' }
  if (!session) return NextResponse.json({ followingIds: [] }, { headers: noStore })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await supabase
    .from('farmer_follows')
    .select('farmer_id')
    .eq('consumer_id', session.consumerId)
  return NextResponse.json(
    { followingIds: ((data ?? []) as Array<{ farmer_id: string }>).map((r) => r.farmer_id) },
    { headers: noStore },
  )
}

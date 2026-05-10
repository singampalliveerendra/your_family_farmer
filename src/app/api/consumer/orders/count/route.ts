import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Lightweight count for the home-page badge — avoids pulling full rows.
// "Pending" includes anything that still needs the buyer's or farmer's attention:
//  - status pending (farmer hasn't approved)
//  - payment awaiting verification (buyer paid, farmer hasn't confirmed)
//  - payment failed (buyer needs to retry)
export async function GET(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ pending: 0, total: 0 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data } = await supabase
    .from('orders')
    .select('status, payment_status')
    .eq('consumer_id', session.consumerId)
    .neq('status', 'declined')

  const rows = data ?? []
  const pending = rows.filter((o) =>
    o.status === 'pending'
    || o.payment_status === 'pending_confirmation'
    || o.payment_status === 'payment_claimed'
    || o.payment_status === 'failed',
  ).length

  return NextResponse.json({ pending, total: rows.length })
}

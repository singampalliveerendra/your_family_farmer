import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Farmer approves a pending order and commits to a pickup/delivery date.
//
// The `status = 'pending'` guard is load-bearing and moved here verbatim from
// the client: without it, an order the buyer cancelled while the farmer had the
// screen open would be resurrected into 'approved' — the buyer's money is
// already refunded at that point, so the farmer would be shipping for free.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  const body = await req.json().catch(() => null) as { fulfillmentDate?: unknown } | null
  const fulfillmentDate = String(body?.fulfillmentDate ?? '').trim()
  if (!fulfillmentDate || Number.isNaN(Date.parse(fulfillmentDate))) {
    return NextResponse.json({ error: 'Choose a pickup or delivery date.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await supabase
    .from('orders')
    .update({
      status: 'approved',
      fulfillment_date: fulfillmentDate,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('farmer_id', session.farmerId)
    .eq('status', 'pending')
    .select('id, status, fulfillment_date, confirmed_at')

  if (error) {
    console.error('[YFF farmer/approve] update failed:', error.message)
    return NextResponse.json({ error: 'Could not approve. Please try again.' }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: 'This order can no longer be approved — the buyer may have cancelled it.' },
      { status: 409 },
    )
  }

  return NextResponse.json({ ok: true, order: data[0] })
}

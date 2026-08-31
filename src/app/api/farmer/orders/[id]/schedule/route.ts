import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Farmer moves an already-approved order to a new pickup/delivery date, with an
// optional reason the buyer sees.
//
// The reason is written in the SAME update as the date, not a second one. The
// old client code did two sequential updates and swallowed a failure on the
// reason "so a missing column never blocks the date change" — but the columns
// have existed since scripts/reschedule-reason-migration.sql was applied, and
// two updates meant a buyer could see a new date with the previous reason still
// attached if the second call failed.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  const body = await req.json().catch(() => null) as { fulfillmentDate?: unknown; reason?: unknown } | null
  const fulfillmentDate = String(body?.fulfillmentDate ?? '').trim()
  if (!fulfillmentDate || Number.isNaN(Date.parse(fulfillmentDate))) {
    return NextResponse.json({ error: 'Choose a new date.' }, { status: 400 })
  }
  const reason = String(body?.reason ?? '').trim().slice(0, 300)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const patch: Record<string, unknown> = { fulfillment_date: fulfillmentDate }
  if (reason) {
    patch.reschedule_reason = reason
    patch.rescheduled_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', id)
    .eq('farmer_id', session.farmerId)
    .select('id, fulfillment_date, reschedule_reason, rescheduled_at')

  if (error) {
    console.error('[YFF farmer/schedule] update failed:', error.message)
    return NextResponse.json({ error: 'Could not save the new date.' }, { status: 500 })
  }
  if (!data || data.length === 0) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })

  return NextResponse.json({ ok: true, order: data[0] })
}

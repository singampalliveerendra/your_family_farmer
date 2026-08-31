import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'
import { FARMER_ORDER_DETAIL_COLUMNS, FARMER_ORDER_RESCHEDULE_COLUMNS } from '@/lib/orderColumns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// One order, for the farmer's order-detail screen. Ownership is enforced with
// .eq('farmer_id', session.farmerId) rather than checked after the fact, so a
// farmer asking for someone else's order id gets a 404 and learns nothing
// about whether that order exists.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const load = (cols: string) =>
    supabase
      .from('orders')
      .select(cols)
      .eq('id', id)
      .eq('farmer_id', session.farmerId)
      .maybeSingle()

  // Ask for the reschedule columns, but never let their absence take the page
  // down — an environment that hasn't run reschedule-reason-migration.sql should
  // show the order without a reason, exactly as it did before.
  let { data, error } = await load(FARMER_ORDER_DETAIL_COLUMNS + FARMER_ORDER_RESCHEDULE_COLUMNS)
  if (error) {
    ;({ data, error } = await load(FARMER_ORDER_DETAIL_COLUMNS))
  }

  if (error) {
    console.error('[YFF farmer/orders/[id]] load failed:', error.message)
    return NextResponse.json({ error: 'Could not load the order.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })

  return NextResponse.json({ order: data })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest, refreshFarmerSessionCookie } from '@/lib/farmer-session'
import { FARMER_ORDER_COLUMNS, FARMER_ORDER_PREORDER_COLUMNS } from '@/lib/orderColumns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The farmer's orders, read with the service role and scoped to the farmer id
// carried by the signed session cookie.
//
// This replaces the browser reading `orders` directly with the anon key. The
// old client queries already filtered `.eq('farmer_id', farmerData.id)`, but
// that filter was a suggestion: the anon key ships in the JS bundle, so anyone
// could send a different farmer_id — or drop the filter entirely — and read
// every buyer's phone, address and handover code. Here the id comes from the
// cookie and the caller cannot influence it.
//
// ?scope=active  → the dashboard's active list (pending / approved-awaiting /
//                  buyer-cancelled-unacknowledged) plus the summary counts.
// ?scope=all     → the full Orders page list.
export async function GET(req: NextRequest) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const scope = req.nextUrl.searchParams.get('scope') === 'active' ? 'active' : 'all'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  if (scope === 'all') {
    // Ask for the pre-order columns, then drop them if this database has not
    // run scripts/preorder-migration.sql — the farmer's order list must never
    // go blank over a column that only adds a badge.
    const listAll = (columns: string) => supabase
      .from('orders')
      .select(columns)
      .eq('farmer_id', session.farmerId)
      .order('created_at', { ascending: false })
      .limit(500)

    let { data, error } = await listAll(FARMER_ORDER_COLUMNS + FARMER_ORDER_PREORDER_COLUMNS)
    if (error) {
      ;({ data, error } = await listAll(FARMER_ORDER_COLUMNS))
    }

    if (error) {
      console.error('[YFF farmer/orders] list failed:', error.message)
      return NextResponse.json({ error: 'Could not load orders.' }, { status: 500 })
    }
    const res = NextResponse.json({ orders: data ?? [] })
    refreshFarmerSessionCookie(res, session)
    return res
  }

  // Dashboard: the active list plus the three summary figures the tiles show.
  // Local midnight is the client's, so it is passed in rather than computed
  // here — a farmer in IST and a server in UTC disagree about "today".
  const todayStartRaw = req.nextUrl.searchParams.get('todayStart')
  const todayStart = todayStartRaw && !Number.isNaN(Date.parse(todayStartRaw))
    ? todayStartRaw
    : new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
  const monthStartRaw = req.nextUrl.searchParams.get('monthStart')
  const monthStart = monthStartRaw && !Number.isNaN(Date.parse(monthStartRaw))
    ? monthStartRaw
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  const activeList = (columns: string) => supabase
    .from('orders')
    .select(columns)
    .eq('farmer_id', session.farmerId)
    .or('status.eq.pending,status.eq.approved,and(status.eq.cancelled,acknowledged_at.is.null)')
    .order('created_at', { ascending: false })

  const [activeFirst, weekRes, monthRes, todayRes] = await Promise.all([
    activeList(FARMER_ORDER_COLUMNS + FARMER_ORDER_PREORDER_COLUMNS),
    supabase
      .from('orders')
      .select('id, total_price')
      .eq('farmer_id', session.farmerId)
      .eq('status', 'approved')
      .gte('created_at', weekAgo),
    supabase
      .from('orders')
      .select('id, total_price, created_at')
      .eq('farmer_id', session.farmerId)
      .eq('status', 'approved')
      .gte('created_at', monthStart),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('farmer_id', session.farmerId)
      .gte('created_at', todayStart),
  ])

  // Same fallback as the 'all' branch: without the pre-order migration the
  // select fails outright, and a dashboard with no orders on it is far worse
  // than one without a pre-order badge.
  const activeRes = activeFirst.error
    ? await activeList(FARMER_ORDER_COLUMNS)
    : activeFirst

  if (activeRes.error) {
    console.error('[YFF farmer/orders] active failed:', activeRes.error.message)
    return NextResponse.json({ error: 'Could not load orders.' }, { status: 500 })
  }

  const res = NextResponse.json({
    orders: activeRes.data ?? [],
    weekOrders: weekRes.data ?? [],
    monthOrders: monthRes.data ?? [],
    todayCount: todayRes.count ?? 0,
  })
  refreshFarmerSessionCookie(res, session)
  return res
}

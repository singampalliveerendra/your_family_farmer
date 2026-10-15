import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'
import { attachFarmerResolved } from '@/lib/farmerResolve'
import { FARMER_ORDER_COLUMNS, FARMER_ORDER_PREORDER_COLUMNS, FARMER_ORDER_SELF_COLUMNS } from '@/lib/orderColumns'
import { reportFarmerIds } from '@/lib/moderatorOrderReport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET — the moderator's Order Report data: the farmers in their zone (for the
// picker) and the orders of one of them (?farmer=<id>) or all of them
// (?farmer=all). Same columns as the farmer's own Orders page, so the shared
// OrderReportSheet computes exactly what the farmer sees. Zone-scoped: a
// farmer id outside the moderator's zone gets a 403, never another zone's data.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone(req)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: zoneFarmers, error: fErr } = await supabase
    .from('farmers')
    .select('id, name, village, account_type')
    .eq('region_slug', zone)
    .order('name', { ascending: true })
  if (fErr) {
    console.error('[YFF moderator/orders/report] farmers query failed:', fErr.message)
    return NextResponse.json({ error: 'Could not load farmers.' }, { status: 500 })
  }
  const farmers = zoneFarmers ?? []

  const pick = reportFarmerIds(req.nextUrl.searchParams.get('farmer'), farmers.map((f) => f.id as string))
  if (pick.error === 'forbidden') return NextResponse.json({ error: 'That farmer is not in your zone.' }, { status: 403 })
  // No farmer chosen yet: just the list, for the picker.
  if (pick.ids === null || pick.ids.length === 0) return NextResponse.json({ farmers, orders: [] })

  const ids = pick.ids
  const list = (columns: string) => supabase
    .from('orders')
    .select(columns)
    .in('farmer_id', ids)
    .order('created_at', { ascending: false })
    .limit(5000)

  // Optional columns first, dropped one migration at a time — the same
  // fallback the farmer's own list uses, so a missing column costs a badge,
  // never the report.
  let { data, error } = await list(FARMER_ORDER_COLUMNS + FARMER_ORDER_PREORDER_COLUMNS + FARMER_ORDER_SELF_COLUMNS)
  if (error) ({ data, error } = await list(FARMER_ORDER_COLUMNS + FARMER_ORDER_PREORDER_COLUMNS))
  if (error) ({ data, error } = await list(FARMER_ORDER_COLUMNS))
  if (error) {
    console.error('[YFF moderator/orders/report] orders query failed:', error.message)
    return NextResponse.json({ error: 'Could not load orders.' }, { status: 500 })
  }

  const orders = await attachFarmerResolved(supabase, (data ?? []) as unknown as Array<{ id: string }>)
  return NextResponse.json({ farmers, orders })
}

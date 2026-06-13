import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Resolve the period label to a [from, to) window.
function windowFor(period: string): { from: Date; to: Date } {
  const now = new Date()
  if (period === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
  }
  if (period === 'lastmonth') {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 1),
    }
  }
  // default: this week (last 7 days)
  return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now }
}

export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone(req)
  const supabase = svc()
  const period = req.nextUrl.searchParams.get('period') ?? 'week'
  const { from, to } = windowFor(period)

  // Farmers in zone — orders are scoped through them.
  const { data: zoneFarmers, error: fErr } = await supabase
    .from('farmers').select('id, name').eq('region_slug', zone)
  if (fErr) {
    console.error('[YFF moderator/reports] farmers query failed:', fErr.message)
    return NextResponse.json({ error: fErr.message }, { status: 500 })
  }
  const nameById = new Map((zoneFarmers ?? []).map((f) => [f.id, f.name]))
  const farmerIds = (zoneFarmers ?? []).map((f) => f.id)

  // Empty zone → zeroed report.
  if (farmerIds.length === 0) {
    return NextResponse.json({
      period,
      report: { orders: 0, gmv: 0, avgOrder: 0, escalationsResolved: 0, escalationsTotal: 0, topFarmer: null, topCrop: null },
    })
  }

  // Orders in the window. NOTE: this counts every order regardless of status,
  // matching the dashboard's "orders / GMV this week" cards so the two agree.
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('farmer_id, produce_name, total_price')
    .in('farmer_id', farmerIds)
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString())
  if (oErr) {
    console.error('[YFF moderator/reports] orders query failed:', oErr.message)
    return NextResponse.json({ error: oErr.message }, { status: 500 })
  }

  const list = orders ?? []
  const count = list.length
  const gmv = list.reduce((s, o) => s + Number(o.total_price ?? 0), 0)
  const avgOrder = count > 0 ? Math.round(gmv / count) : 0

  // Top farmer by GMV.
  const gmvByFarmer = new Map<string, number>()
  for (const o of list) {
    if (!o.farmer_id) continue
    gmvByFarmer.set(o.farmer_id, (gmvByFarmer.get(o.farmer_id) ?? 0) + Number(o.total_price ?? 0))
  }
  let topFarmer: { name: string; gmv: number } | null = null
  for (const [id, g] of gmvByFarmer) {
    if (!topFarmer || g > topFarmer.gmv) topFarmer = { name: nameById.get(id) ?? '—', gmv: g }
  }

  // Most popular crop by order count.
  const countByCrop = new Map<string, number>()
  for (const o of list) {
    const crop = (o.produce_name ?? '').trim()
    if (crop) countByCrop.set(crop, (countByCrop.get(crop) ?? 0) + 1)
  }
  let topCrop: { name: string; orders: number } | null = null
  for (const [name, c] of countByCrop) {
    if (!topCrop || c > topCrop.orders) topCrop = { name, orders: c }
  }

  // Escalation resolution rate in the same window.
  const { data: escs } = await supabase
    .from('escalations')
    .select('status')
    .eq('region_slug', zone)
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString())
  const escalationsTotal = escs?.length ?? 0
  const escalationsResolved = (escs ?? []).filter((e) => e.status === 'resolved').length

  return NextResponse.json({
    period,
    report: { orders: count, gmv, avgOrder, escalationsResolved, escalationsTotal, topFarmer, topCrop },
  })
}

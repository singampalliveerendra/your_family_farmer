import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'
import { getPlatformFeePercent } from '@/lib/platform-fee'

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
      report: { orders: 0, gmv: 0, avgOrder: 0, escalationsResolved: 0, escalationsTotal: 0, topFarmer: null, topCrop: null, commissionPercent: 0, payouts: [] },
    })
  }

  // Orders in the window. NOTE: this counts every order regardless of status,
  // matching the dashboard's "orders / GMV this week" cards so the two agree.
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('farmer_id, produce_name, total_price, status, collected_at, received_at, delivered_at')
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

  // Farmer payouts with rejection deductions (Case 4). A farmer earns the full
  // produce price on every fulfilled order, but each order he REJECTS is
  // penalised: rejected_amount × commission% is deducted from his payout (it
  // recovers the gateway/refund cost GoGrameen ate by refunding the buyer in
  // full). Commission is the same moderator-set platform fee percentage.
  const commissionPercent = await getPlatformFeePercent(supabase)
  type Payout = {
    farmerId: string
    name: string
    earned: number          // produce price on fulfilled (delivered/collected/received) orders
    rejectedOrders: number
    rejectedAmount: number  // produce price across rejected orders
    deduction: number       // rejectedAmount × commission%, rounded per order
    net: number             // earned − deduction
  }
  const payoutByFarmer = new Map<string, Payout>()
  for (const o of list) {
    const fid = o.farmer_id
    if (!fid) continue
    let rec = payoutByFarmer.get(fid)
    if (!rec) {
      rec = { farmerId: fid, name: nameById.get(fid) ?? '—', earned: 0, rejectedOrders: 0, rejectedAmount: 0, deduction: 0, net: 0 }
      payoutByFarmer.set(fid, rec)
    }
    const price = Number(o.total_price ?? 0)
    if (o.status === 'declined') {
      rec.rejectedOrders += 1
      rec.rejectedAmount += price
      rec.deduction += Math.round((price * commissionPercent) / 100)
    } else if (o.collected_at || o.received_at || o.delivered_at) {
      // Fulfilled — the farmer is owed the produce price for it.
      rec.earned += price
    }
  }
  const payouts = Array.from(payoutByFarmer.values())
    .map((p) => ({ ...p, net: p.earned - p.deduction }))
    .filter((p) => p.earned > 0 || p.rejectedOrders > 0)
    .sort((a, b) => b.net - a.net)

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
    report: { orders: count, gmv, avgOrder, escalationsResolved, escalationsTotal, topFarmer, topCrop, commissionPercent, payouts },
  })
}

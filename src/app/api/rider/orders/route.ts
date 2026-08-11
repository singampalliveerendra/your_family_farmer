import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getRiderSessionFromRequest } from '@/lib/rider-session'
import { groupByJob } from '@/lib/rider-jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DeliveryStatus = 'unassigned' | 'assigned' | 'picked_up' | 'out_for_delivery' | 'delivered'

type OrderRow = {
  id: string
  farmer_id: string
  checkout_id: string | null
  produce_name: string | null
  quantity: number | null
  unit: string | null
  total_price: number | null
  buyer_name: string | null
  buyer_phone: string | null
  payment_method: string | null
  payment_status: string | null
  delivery_status: DeliveryStatus | null
  // Cash the rider must take at the door on a part-paid COD order.
  cod_balance_due: number | null
  delivery_address: string | null
  delivery_city: string | null
  delivery_landmark: string | null
  delivery_pincode: string | null
  delivery_alt_phone: string | null
  delivery_boy_id: string | null
  delivery_fee: number | null
  assigned_at: string | null
  picked_up_at: string | null
  out_for_delivery_at: string | null
  delivered_at: string | null
  created_at: string
}

type Farmer = { id: string; name: string; village: string; phone: string | null; farm_address: string | null }

// ── Job aggregation ──────────────────────────────────────────────────────
// Rows come back one-per-cart-line; the rider works in jobs (see rider-jobs.ts).
// Everything below folds a job's rows into the single card the rider sees.

// The lines inside a job, listed so the rider knows what to collect.
function itemsOf(rows: OrderRow[]) {
  return rows.map((r) => ({
    id: r.id,
    produce_name: r.produce_name,
    quantity: r.quantity,
    unit: r.unit,
    total_price: r.total_price,
  }))
}

function sumOf(rows: OrderRow[], pick: (r: OrderRow) => number | null | undefined): number {
  return rows.reduce((s, r) => s + (Number(pick(r)) || 0), 0)
}

// A job's delivery status is its LEAST advanced row. The pipeline routes move
// every row together, so in practice they agree — but a job that was half
// advanced before grouping existed must show the rider the step still outstanding
// rather than claiming work is done.
const STATUS_RANK: Record<string, number> = { assigned: 0, picked_up: 1, out_for_delivery: 2, delivered: 3 }
function jobStatus(rows: OrderRow[]): DeliveryStatus {
  let least = rows[0]?.delivery_status ?? 'assigned'
  for (const r of rows) {
    const s = r.delivery_status ?? 'assigned'
    if ((STATUS_RANK[s] ?? 0) < (STATUS_RANK[least ?? 'assigned'] ?? 0)) least = s
  }
  return (least ?? 'assigned') as DeliveryStatus
}

// Earliest / latest non-null timestamp across a job.
function earliest(rows: OrderRow[], pick: (r: OrderRow) => string | null): string | null {
  const times = rows.map(pick).filter((t): t is string => !!t).sort()
  return times[0] ?? null
}
function latest(rows: OrderRow[], pick: (r: OrderRow) => string | null): string | null {
  const times = rows.map(pick).filter((t): t is string => !!t).sort()
  return times[times.length - 1] ?? null
}

export async function GET(req: NextRequest) {
  const session = getRiderSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not logged in.' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Gate: only active riders see orders. Suspended/pending accounts are kicked
  // out of /api/rider/me as well, but we double-check here to be safe.
  const { data: rider } = await supabase
    .from('delivery_boys')
    .select('id, status, service_pincodes')
    .eq('id', session.riderId)
    .maybeSingle() as { data: { id: string; status: string; service_pincodes: string[] | null } | null }

  if (!rider || rider.status !== 'active') {
    return NextResponse.json({ error: 'Account not active.' }, { status: 403 })
  }

  // Available — farmer-approved home deliveries that no rider has taken yet.
  // Mine — anything currently assigned to me and not yet delivered.
  //
  // Availability is scoped to the rider's declared pincodes. A rider with none
  // on file covers nothing and sees nothing: showing them every order on the
  // platform (the old fallback) is how a rider in one district ends up looking
  // at deliveries in another. /api/rider/orders/[id]/accept enforces the same
  // rule, so this filter isn't the only thing standing between them.
  const ridersPincodes = (rider.service_pincodes ?? []).filter((p) => /^\d{6}$/.test(p))

  // No pincodes on file → nothing is offered. Deliveries the rider already
  // accepted still load below: taking their service area away must not strand
  // a buyer whose food is already on a bike.
  let availableRaw: OrderRow[] | null = []
  if (ridersPincodes.length > 0) {
    const { data, error: availErr } = await supabase
      .from('orders')
      .select(
        'id, farmer_id, checkout_id, produce_name, quantity, unit, total_price, payment_method, payment_status, delivery_pincode, delivery_status, delivery_fee, created_at',
      )
      .eq('delivery_type', 'home_delivery')
      .eq('status', 'approved')
      .is('delivery_boy_id', null)
      .or('delivery_status.is.null,delivery_status.eq.unassigned')
      .in('delivery_pincode', ridersPincodes)
      .order('created_at', { ascending: true })
      .limit(50) as { data: OrderRow[] | null; error: { message: string } | null }

    if (availErr) {
      console.error('[YFF rider/orders] available query failed:', availErr.message)
      return NextResponse.json({ error: 'Could not load orders.' }, { status: 500 })
    }
    availableRaw = data
  }

  const { data: mineRaw, error: mineErr } = await supabase
    .from('orders')
    .select(
      'id, farmer_id, checkout_id, produce_name, quantity, unit, total_price, buyer_name, buyer_phone, payment_method, payment_status, cod_balance_due, delivery_status, delivery_address, delivery_city, delivery_landmark, delivery_pincode, delivery_alt_phone, delivery_boy_id, delivery_fee, assigned_at, picked_up_at, out_for_delivery_at, delivered_at, created_at',
    )
    .eq('delivery_boy_id', session.riderId)
    .in('delivery_status', ['assigned', 'picked_up', 'out_for_delivery'])
    .order('assigned_at', { ascending: true })
    .limit(50) as { data: OrderRow[] | null; error: { message: string } | null }

  if (mineErr) {
    console.error('[YFF rider/orders] mine query failed:', mineErr.message)
    return NextResponse.json({ error: 'Could not load your deliveries.' }, { status: 500 })
  }

  // Past deliveries this rider has finished. Most recent first.
  const { data: historyRaw, error: historyErr } = await supabase
    .from('orders')
    .select(
      'id, farmer_id, checkout_id, produce_name, quantity, unit, total_price, buyer_name, payment_method, delivery_status, delivery_pincode, delivery_fee, delivered_at, created_at',
    )
    .eq('delivery_boy_id', session.riderId)
    .eq('delivery_status', 'delivered')
    .order('delivered_at', { ascending: false })
    .limit(100) as { data: OrderRow[] | null; error: { message: string } | null }

  if (historyErr) {
    console.error('[YFF rider/orders] history query failed:', historyErr.message)
    return NextResponse.json({ error: 'Could not load your delivery history.' }, { status: 500 })
  }

  const farmerIds = [...new Set([
    ...(availableRaw ?? []).map((o) => o.farmer_id),
    ...(mineRaw ?? []).map((o) => o.farmer_id),
    ...(historyRaw ?? []).map((o) => o.farmer_id),
  ].filter(Boolean))]

  let farmerMap: Record<string, Farmer> = {}
  if (farmerIds.length > 0) {
    let farmersData: Array<{ id: string; name: string; village: string; phone: string | null; farm_address?: string | null }> | null = null
    const withAddress = await supabase
      .from('farmers')
      .select('id, name, village, phone, farm_address')
      .in('id', farmerIds)
    if (withAddress.error) {
      // farm_address column not migrated yet — fall back so the rider still
      // sees orders, just without the pickup address.
      console.warn('[YFF rider/orders] farm_address select failed, falling back:', withAddress.error.message)
      const fallback = await supabase
        .from('farmers')
        .select('id, name, village, phone')
        .in('id', farmerIds)
      farmersData = fallback.data ?? null
    } else {
      farmersData = withAddress.data ?? null
    }
    farmerMap = Object.fromEntries(
      (farmersData ?? []).map((f) => [f.id, {
        id: f.id,
        name: f.name,
        village: f.village,
        phone: f.phone ?? null,
        farm_address: f.farm_address ?? null,
      }]),
    )
  }

  // Available jobs are public to all active riders — withhold consumer name,
  // phone, and street so a rider can't fish for personal info by browsing.
  // `id` is the anchor row the Accept button posts to; the route re-derives the
  // rest of the job server-side, so the client never dictates what gets claimed.
  const available = groupByJob(availableRaw ?? []).map(({ rows }) => {
    const head = rows[0]
    const farmer = farmerMap[head.farmer_id] ?? null
    return {
      id: head.id,
      itemCount: rows.length,
      items: itemsOf(rows),
      total_price: sumOf(rows, (r) => r.total_price),
      payment_method: head.payment_method,
      payment_status: head.payment_status,
      delivery_pincode: head.delivery_pincode,
      // Summed because place/route.ts stamps the farmer's whole share on one
      // row of the batch — per row these read ₹30, ₹0, ₹0 for one ₹30 trip.
      delivery_fee: sumOf(rows, (r) => r.delivery_fee),
      created_at: head.created_at,
      farmer: farmer
        ? { name: farmer.name, village: farmer.village, farm_address: farmer.farm_address }
        : null,
    }
  })

  const mine = groupByJob(mineRaw ?? []).map(({ rows }) => {
    const head = rows[0]
    return {
      id: head.id,
      itemCount: rows.length,
      items: itemsOf(rows),
      total_price: sumOf(rows, (r) => r.total_price),
      buyer_name: head.buyer_name,
      buyer_phone: head.buyer_phone,
      payment_method: head.payment_method,
      payment_status: head.payment_status,
      // Cash at the door is one figure for the whole bag, not one per line.
      // Null only when NO row carries a balance (legacy pre-deposit COD), which
      // is what the card's "collect the full price" fallback keys off.
      cod_balance_due: rows.some((r) => r.cod_balance_due != null)
        ? sumOf(rows, (r) => r.cod_balance_due)
        : null,
      delivery_status: jobStatus(rows),
      delivery_address: head.delivery_address,
      delivery_city: head.delivery_city,
      delivery_landmark: head.delivery_landmark,
      delivery_pincode: head.delivery_pincode,
      delivery_alt_phone: head.delivery_alt_phone,
      delivery_fee: sumOf(rows, (r) => r.delivery_fee),
      assigned_at: earliest(rows, (r) => r.assigned_at),
      picked_up_at: earliest(rows, (r) => r.picked_up_at),
      out_for_delivery_at: earliest(rows, (r) => r.out_for_delivery_at),
      farmer: farmerMap[head.farmer_id] ?? null,
    }
  })

  const history = groupByJob(historyRaw ?? []).map(({ rows }) => {
    const head = rows[0]
    const farmer = farmerMap[head.farmer_id] ?? null
    return {
      id: head.id,
      itemCount: rows.length,
      items: itemsOf(rows),
      total_price: sumOf(rows, (r) => r.total_price),
      buyer_name: head.buyer_name,
      payment_method: head.payment_method,
      delivery_pincode: head.delivery_pincode,
      delivery_fee: sumOf(rows, (r) => r.delivery_fee),
      delivered_at: latest(rows, (r) => r.delivered_at),
      created_at: head.created_at,
      farmer: farmer ? { name: farmer.name, village: farmer.village } : null,
    }
  })

  // No earnings are reported to riders. orders.rider_payout is still stamped at
  // placement as the accounting record, but rider pay is being settled outside
  // the app, so quoting a per-delivery figure here would promise something this
  // system no longer decides. Deliberately absent from the payload, not just
  // hidden in the UI.
  return NextResponse.json({
    available,
    mine,
    history,
    notice: ridersPincodes.length === 0
      ? 'No service area on file. Ask the moderator to set the pincodes you cover.'
      : null,
  })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getRiderSessionFromRequest } from '@/lib/rider-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DeliveryStatus = 'unassigned' | 'assigned' | 'picked_up' | 'out_for_delivery' | 'delivered'

type OrderRow = {
  id: string
  farmer_id: string
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
  rider_payout: number | null
  assigned_at: string | null
  picked_up_at: string | null
  out_for_delivery_at: string | null
  delivered_at: string | null
  created_at: string
}

type Farmer = { id: string; name: string; village: string; phone: string | null; farm_address: string | null }

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
        'id, farmer_id, produce_name, quantity, unit, total_price, payment_method, payment_status, delivery_pincode, delivery_status, delivery_fee, rider_payout, created_at',
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
      'id, farmer_id, produce_name, quantity, unit, total_price, buyer_name, buyer_phone, payment_method, payment_status, cod_balance_due, delivery_status, delivery_address, delivery_city, delivery_landmark, delivery_pincode, delivery_alt_phone, delivery_boy_id, delivery_fee, rider_payout, assigned_at, picked_up_at, out_for_delivery_at, delivered_at, created_at',
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
      'id, farmer_id, produce_name, quantity, unit, total_price, buyer_name, payment_method, delivery_status, delivery_pincode, delivery_fee, rider_payout, delivered_at, created_at',
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

  // Available rows are public to all active riders — withhold consumer name,
  // phone, and street so a rider can't fish for personal info by browsing.
  const available = (availableRaw ?? []).map((o) => {
    const farmer = farmerMap[o.farmer_id] ?? null
    return {
      id: o.id,
      produce_name: o.produce_name,
      quantity: o.quantity,
      unit: o.unit,
      total_price: o.total_price,
      payment_method: o.payment_method,
      payment_status: o.payment_status,
      delivery_pincode: o.delivery_pincode,
      delivery_fee: o.delivery_fee ?? 0,
      rider_payout: o.rider_payout ?? 0,
      created_at: o.created_at,
      farmer: farmer
        ? { name: farmer.name, village: farmer.village, farm_address: farmer.farm_address }
        : null,
    }
  })

  const mine = (mineRaw ?? []).map((o) => ({
    ...o,
    farmer: farmerMap[o.farmer_id] ?? null,
  }))

  const history = (historyRaw ?? []).map((o) => {
    const farmer = farmerMap[o.farmer_id] ?? null
    return {
      id: o.id,
      produce_name: o.produce_name,
      quantity: o.quantity,
      unit: o.unit,
      total_price: o.total_price,
      buyer_name: o.buyer_name,
      payment_method: o.payment_method,
      delivery_pincode: o.delivery_pincode,
      delivery_fee: o.delivery_fee ?? 0,
      rider_payout: o.rider_payout ?? 0,
      delivered_at: o.delivered_at,
      created_at: o.created_at,
      farmer: farmer ? { name: farmer.name, village: farmer.village } : null,
    }
  })

  const totalEarned = history.reduce((s, o) => s + (o.rider_payout ?? 0), 0)

  return NextResponse.json({
    available,
    mine,
    history,
    totalEarned,
    notice: ridersPincodes.length === 0
      ? 'No service area on file. Ask the moderator to set the pincodes you cover.'
      : null,
  })
}

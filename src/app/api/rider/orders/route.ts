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
  delivery_address: string | null
  delivery_landmark: string | null
  delivery_pincode: string | null
  delivery_alt_phone: string | null
  delivery_boy_id: string | null
  assigned_at: string | null
  picked_up_at: string | null
  out_for_delivery_at: string | null
  created_at: string
}

type Farmer = { id: string; name: string; village: string; phone: string | null }

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
    .select('id, status')
    .eq('id', session.riderId)
    .maybeSingle()

  if (!rider || rider.status !== 'active') {
    return NextResponse.json({ error: 'Account not active.' }, { status: 403 })
  }

  // Available — farmer-approved home deliveries that no rider has taken yet.
  // Mine — anything currently assigned to me and not yet delivered.
  const { data: availableRaw, error: availErr } = await supabase
    .from('orders')
    .select(
      'id, farmer_id, produce_name, quantity, unit, total_price, payment_method, payment_status, delivery_pincode, delivery_status, created_at',
    )
    .eq('delivery_type', 'home_delivery')
    .eq('status', 'approved')
    .is('delivery_boy_id', null)
    .or('delivery_status.is.null,delivery_status.eq.unassigned')
    .order('created_at', { ascending: true })
    .limit(50) as { data: OrderRow[] | null; error: { message: string } | null }

  if (availErr) {
    console.error('[YFF rider/orders] available query failed:', availErr.message)
    return NextResponse.json({ error: 'Could not load orders.' }, { status: 500 })
  }

  const { data: mineRaw, error: mineErr } = await supabase
    .from('orders')
    .select(
      'id, farmer_id, produce_name, quantity, unit, total_price, buyer_name, buyer_phone, payment_method, payment_status, delivery_status, delivery_address, delivery_landmark, delivery_pincode, delivery_alt_phone, delivery_boy_id, assigned_at, picked_up_at, out_for_delivery_at, created_at',
    )
    .eq('delivery_boy_id', session.riderId)
    .in('delivery_status', ['assigned', 'picked_up', 'out_for_delivery'])
    .order('assigned_at', { ascending: true })
    .limit(50) as { data: OrderRow[] | null; error: { message: string } | null }

  if (mineErr) {
    console.error('[YFF rider/orders] mine query failed:', mineErr.message)
    return NextResponse.json({ error: 'Could not load your deliveries.' }, { status: 500 })
  }

  const farmerIds = [...new Set([
    ...(availableRaw ?? []).map((o) => o.farmer_id),
    ...(mineRaw ?? []).map((o) => o.farmer_id),
  ].filter(Boolean))]

  let farmerMap: Record<string, Farmer> = {}
  if (farmerIds.length > 0) {
    const { data: farmers } = await supabase
      .from('farmers')
      .select('id, name, village, phone')
      .in('id', farmerIds)
    farmerMap = Object.fromEntries(
      (farmers ?? []).map((f) => [f.id, { id: f.id, name: f.name, village: f.village, phone: f.phone ?? null }]),
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
      created_at: o.created_at,
      farmer: farmer ? { name: farmer.name, village: farmer.village } : null,
    }
  })

  const mine = (mineRaw ?? []).map((o) => ({
    ...o,
    farmer: farmerMap[o.farmer_id] ?? null,
  }))

  return NextResponse.json({ available, mine })
}

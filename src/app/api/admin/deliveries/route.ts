import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Every home-delivery order, newest first. The admin is the safety net for
  // anything stuck (e.g. no rider accepted) so we include unassigned rows too.
  const { data: orders, error } = await supabase
    .from('orders')
    .select(
      'id, farmer_id, produce_name, quantity, unit, total_price, buyer_name, buyer_phone, status, payment_method, payment_status, delivery_type, delivery_status, delivery_address, delivery_city, delivery_landmark, delivery_pincode, delivery_alt_phone, delivery_boy_id, handover_otp, assigned_at, picked_up_at, out_for_delivery_at, delivered_at, created_at',
    )
    .eq('delivery_type', 'home_delivery')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[YFF admin/deliveries] query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const farmerIds = [...new Set((orders ?? []).map((o) => o.farmer_id).filter(Boolean))]
  const riderIds = [...new Set((orders ?? []).map((o) => o.delivery_boy_id).filter((v): v is string => !!v))]

  let farmerMap: Record<string, { id: string; name: string; village: string; phone: string | null }> = {}
  if (farmerIds.length > 0) {
    const { data: farmers } = await supabase
      .from('farmers')
      .select('id, name, village, phone')
      .in('id', farmerIds)
    farmerMap = Object.fromEntries(
      (farmers ?? []).map((f) => [f.id, { id: f.id, name: f.name, village: f.village, phone: f.phone ?? null }]),
    )
  }

  let riderMap: Record<string, { id: string; name: string | null; phone: string }> = {}
  if (riderIds.length > 0) {
    const { data: riders } = await supabase
      .from('delivery_boys')
      .select('id, name, phone')
      .in('id', riderIds)
    riderMap = Object.fromEntries(
      (riders ?? []).map((r) => [r.id, { id: r.id, name: r.name ?? null, phone: r.phone }]),
    )
  }

  // Also expose the list of currently active riders so the admin can reassign
  // straight from the same payload — saves a second round-trip.
  const { data: activeRiders } = await supabase
    .from('delivery_boys')
    .select('id, name, phone, vehicle_number')
    .eq('status', 'active')
    .order('name', { ascending: true })

  const enriched = (orders ?? []).map((o) => ({
    ...o,
    farmer: farmerMap[o.farmer_id] ?? null,
    rider: o.delivery_boy_id ? riderMap[o.delivery_boy_id] ?? null : null,
  }))

  return NextResponse.json({ orders: enriched, riders: activeRiders ?? [] })
}

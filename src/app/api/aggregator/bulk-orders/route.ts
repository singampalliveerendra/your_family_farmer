import { NextRequest, NextResponse } from 'next/server'
import { requireAggregator, svc } from '@/lib/aggregator-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// "My bulk orders" — the bulk lots this aggregator has bought (Phase 6),
// newest first, with each seller's name and phone (they are now a customer of
// that seller). The pickup code is the buyer's own, so it is shown here, the
// same as on a household buyer's order page.

const COLUMNS =
  'id, order_code, farmer_id, produce_name, quantity, unit, total_price, platform_fee, transport_charge, transport_state, status, payment_status, payment_method_detail, delivery_type, delivery_address, delivery_city, delivery_pincode, pickup_location, handover_otp, created_at, paid_at, decline_reason, refund_status, refund_amount, shipped_at, received_at, collected_at'

export async function GET(req: NextRequest) {
  const agg = await requireAggregator(req)
  if (!agg) return NextResponse.json({ error: 'Aggregator login required.' }, { status: 401 })
  const supabase = svc()
  const { data, error } = await supabase
    .from('orders')
    .select(COLUMNS)
    .eq('buyer_aggregator_id', agg.id)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ orders: [], configured: false })
  const orders = (data ?? []) as Array<Record<string, unknown>>
  const sellerIds = [...new Set(orders.map((o) => o.farmer_id as string))]
  const { data: sellers } = sellerIds.length
    ? await supabase.from('farmers').select('id, name, village, district, phone').in('id', sellerIds)
    : { data: [] }
  const byId = new Map(((sellers ?? []) as Array<Record<string, unknown>>).map((s) => [s.id as string, s]))
  return NextResponse.json({
    orders: orders.map((o) => ({ ...o, seller: byId.get(o.farmer_id as string) ?? null })),
    configured: true,
  })
}

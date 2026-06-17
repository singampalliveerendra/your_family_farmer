import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'id, order_code, consumer_id, produce_name, quantity, unit, total_price, pickup_location, status, payment_method, payment_method_detail, payment_status, paid_at, confirmed_at, razorpay_payment_id, refund_status, refund_id, refund_amount, refunded_at, decline_reason, payment_proof_path, created_at, farmer_id, delivery_type, delivery_status, delivery_address, delivery_landmark, delivery_pincode, delivery_alt_phone, delivery_boy_id, handover_otp, assigned_at, picked_up_at, out_for_delivery_at, delivered_at, collected_at, shipped_at, received_at, fulfillment_date',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.consumer_id !== session.consumerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }

  // Manual farmer join (no FK on orders.farmer_id → farmers.id, so embedding fails)
  let farmer: { name: string; slug: string; village: string; phone: string | null; upi_id: string | null } | null = null
  if (order.farmer_id) {
    const { data: f } = await supabase
      .from('farmers')
      .select('id, name, slug, village, phone, upi_id')
      .eq('id', order.farmer_id)
      .maybeSingle()
    if (f) {
      farmer = {
        name: f.name,
        slug: f.slug,
        village: f.village,
        phone: f.phone ?? null,
        upi_id: (f.upi_id as string | null) ?? null,
      }
    }
  }

  // Rider contact (only after a rider has been assigned). Minimal exposure:
  // name + phone, nothing else.
  let rider: { id: string; name: string | null; phone: string } | null = null
  const dbi = (order as { delivery_boy_id?: string | null }).delivery_boy_id ?? null
  if (dbi) {
    const { data: r } = await supabase
      .from('delivery_boys')
      .select('id, name, phone')
      .eq('id', dbi)
      .maybeSingle()
    if (r) rider = { id: r.id, name: r.name ?? null, phone: r.phone }
  }

  return NextResponse.json({ order: { ...order, farmer, rider } })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ orders: [] }, { status: 200 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: orders, error } = await supabase
    .from('orders')
    .select(
      'id, order_code, produce_name, produce_listing_id, quantity, unit, total_price, platform_fee, pickup_location, status, payment_method, payment_status, refund_status, refund_id, refund_amount, refunded_at, decline_reason, payment_proof_path, created_at, fulfillment_date, farmer_id, delivery_type, delivery_status, delivery_address, delivery_landmark, delivery_pincode, delivery_alt_phone, delivery_boy_id, handover_otp, assigned_at, picked_up_at, out_for_delivery_at, delivered_at, shipped_at, collected_at, received_at, acknowledged_at',
    )
    .eq('consumer_id', session.consumerId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Manual join — orders.farmer_id has no FK constraint, so PostgREST can't
  // embed the farmer resource for us. One extra query keeps it simple.
  const farmerIds = [...new Set((orders ?? []).map((o) => o.farmer_id).filter(Boolean))]
  let farmerMap: Record<string, { name: string; slug: string; village: string; phone: string | null; upi_id: string | null }> = {}
  if (farmerIds.length > 0) {
    const { data: farmers } = await supabase
      .from('farmers')
      .select('id, name, slug, village, phone, upi_id')
      .in('id', farmerIds)
    farmerMap = Object.fromEntries(
      (farmers ?? []).map((f) => [
        f.id,
        { name: f.name, slug: f.slug, village: f.village, phone: f.phone ?? null, upi_id: (f.upi_id as string | null) ?? null },
      ]),
    )
  }

  // Pull rider contact for any order that's been assigned. Only ever expose
  // the rider's name + phone — never id-proof or password fields.
  const riderIds = [...new Set(
    (orders ?? [])
      .map((o) => (o as { delivery_boy_id?: string | null }).delivery_boy_id)
      .filter((v): v is string => !!v),
  )]
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

  // The buyer's own produce feedback per order, so each card can show "Give
  // feedback" vs the rating they already left. Guarded: if the produce_reviews
  // table hasn't been created yet (migration not run), we just skip it rather
  // than fail the whole orders list.
  const orderIds = (orders ?? []).map((o) => o.id)
  let reviewMap: Record<string, { id: string; star_rating: number; review_text: string | null; created_at: string }> = {}
  if (orderIds.length > 0) {
    const { data: reviews } = await supabase
      .from('produce_reviews')
      .select('id, order_id, star_rating, review_text, created_at')
      .in('order_id', orderIds)
    if (reviews) {
      reviewMap = Object.fromEntries(
        reviews.map((r) => [
          r.order_id,
          { id: r.id, star_rating: r.star_rating, review_text: r.review_text ?? null, created_at: r.created_at },
        ]),
      )
    }
  }

  const enriched = (orders ?? []).map((o) => {
    const riderId = (o as { delivery_boy_id?: string | null }).delivery_boy_id ?? null
    return {
      ...o,
      farmer: farmerMap[o.farmer_id] ?? null,
      rider: riderId ? riderMap[riderId] ?? null : null,
      my_review: reviewMap[o.id] ?? null,
    }
  })
  return NextResponse.json({ orders: enriched })
}

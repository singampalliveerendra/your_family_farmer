import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Recompute and cache a listing's rating aggregate after a review changes.
async function refreshAggregate(supabase: ReturnType<typeof admin>, listingId: string) {
  const { data: rows } = await supabase
    .from('produce_reviews')
    .select('star_rating')
    .eq('produce_listing_id', listingId)
    .eq('approved', true)
  const count = rows?.length ?? 0
  const avg = count > 0
    ? Math.round((rows!.reduce((s, r: { star_rating: number }) => s + r.star_rating, 0) / count) * 10) / 10
    : null
  await supabase
    .from('produce_listings')
    .update({ rating_avg: avg, review_count: count })
    .eq('id', listingId)
}

// GET /api/produce-reviews?listing_id=<uuid>
// Public — returns approved reviews + aggregate for a produce listing.
export async function GET(req: NextRequest) {
  const listingId = new URL(req.url).searchParams.get('listing_id') ?? ''
  if (!UUID_RE.test(listingId)) {
    return NextResponse.json({ error: 'Invalid listing id.' }, { status: 400 })
  }

  const supabase = admin()
  const { data: reviews, error } = await supabase
    .from('produce_reviews')
    .select('id, reviewer_name, star_rating, review_text, created_at')
    .eq('produce_listing_id', listingId)
    .eq('approved', true)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const count = reviews?.length ?? 0
  const avg = count > 0
    ? Math.round((reviews!.reduce((s, r) => s + r.star_rating, 0) / count) * 10) / 10
    : null

  return NextResponse.json({ reviews: reviews ?? [], rating_avg: avg, review_count: count })
}

// POST /api/produce-reviews
// Verified buyer leaves a review on a produce they ordered, once the order is
// delivered / picked up. Body: { order_id, star_rating, review_text? }.
export async function POST(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required.' }, { status: 401 })

  let body: { order_id?: unknown; star_rating?: unknown; review_text?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const orderId = typeof body.order_id === 'string' ? body.order_id : ''
  if (!UUID_RE.test(orderId)) {
    return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })
  }
  const rating = typeof body.star_rating === 'number' ? body.star_rating : NaN
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be 1-5.' }, { status: 400 })
  }
  const text = typeof body.review_text === 'string' ? body.review_text.trim().slice(0, 600) : ''

  const supabase = admin()

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, consumer_id, produce_listing_id, farmer_id, buyer_name, buyer_phone, status, received_at, collected_at, delivered_at, delivery_status')
    .eq('id', orderId)
    .maybeSingle()

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.consumer_id !== session.consumerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  if (!order.produce_listing_id) {
    return NextResponse.json({ error: 'This order cannot be reviewed.' }, { status: 400 })
  }

  // Only completed orders may be reviewed — delivered, picked up, or buyer-
  // confirmed received. Declined/cancelled orders never qualify.
  const completed =
    order.status !== 'declined' &&
    order.status !== 'cancelled' &&
    (!!order.received_at || !!order.collected_at || !!order.delivered_at || order.delivery_status === 'delivered')
  if (!completed) {
    return NextResponse.json({ error: 'You can review after the order is delivered or picked up.' }, { status: 400 })
  }

  // One review per order.
  const { data: existing } = await supabase
    .from('produce_reviews')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'already_reviewed' }, { status: 409 })
  }

  const { data: review, error: insErr } = await supabase
    .from('produce_reviews')
    .insert({
      order_id: orderId,
      produce_listing_id: order.produce_listing_id,
      farmer_id: order.farmer_id ?? null,
      consumer_id: order.consumer_id ?? null,
      reviewer_name: (order.buyer_name as string | null)?.trim()?.slice(0, 80) || 'Buyer',
      reviewer_phone: order.buyer_phone ? String(order.buyer_phone).replace(/\D/g, '').slice(-10) : null,
      star_rating: rating,
      review_text: text || null,
      approved: true,
    })
    .select('id, reviewer_name, star_rating, review_text, created_at')
    .single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  await refreshAggregate(supabase, order.produce_listing_id)

  return NextResponse.json({ review })
}

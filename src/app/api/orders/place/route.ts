import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { getTierPrice } from '@/lib/pricing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type IncomingItem = { listingId: string; qty: number }

type ListingRow = {
  id: string
  name: string
  unit: string | null
  stock_qty: number | null
  farmer_id: string
  price_tier_1_qty: number | null
  price_tier_1_price: number | null
  price_tier_2_qty: number | null
  price_tier_2_price: number | null
  price_tier_3_price: number | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return bad('Please log in to place an order.', 401)

  const body = await req.json().catch(() => null) as
    | {
        farmerId?: string
        paymentMethod?: string
        pickupLocation?: string | null
        pickupDay?: string | null
        items?: IncomingItem[]
      }
    | null

  if (!body) return bad('Invalid request body.')
  // pickupDay is currently UI-only (not a DB column); accept and ignore.
  const { farmerId, paymentMethod, pickupLocation, items } = body

  if (!farmerId || !UUID_RE.test(farmerId)) return bad('Invalid farmer.')
  if (paymentMethod !== 'upi' && paymentMethod !== 'cod') return bad('Invalid payment method.')
  if (!Array.isArray(items) || items.length === 0) return bad('Cart is empty.')
  if (items.length > 50) return bad('Too many items.')
  for (const it of items) {
    if (!it || typeof it !== 'object') return bad('Invalid item.')
    if (!it.listingId || !UUID_RE.test(it.listingId)) return bad('Invalid listing id.')
    if (!Number.isFinite(it.qty) || it.qty <= 0 || it.qty > 10000) return bad('Invalid quantity.')
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Authoritative consumer profile (we never trust the client for buyer name/phone)
  const { data: consumer } = await supabase
    .from('consumers_auth')
    .select('id, name, phone')
    .eq('id', session.consumerId)
    .maybeSingle()

  if (!consumer) return bad('Account not found. Please log in again.', 401)

  // Farmer COD acceptance check
  const { data: farmer } = await supabase
    .from('farmers')
    .select('id, cod_enabled')
    .eq('id', farmerId)
    .maybeSingle()

  if (!farmer) return bad('Farmer not found.', 404)
  if (paymentMethod === 'cod' && farmer.cod_enabled !== true) {
    return bad('This farmer is not accepting Cash on Delivery.')
  }

  // Pull live listing rows — never trust prices from the client cart
  const listingIds = items.map((i) => i.listingId)
  const { data: listings } = await supabase
    .from('produce_listings')
    .select(
      'id, name, unit, stock_qty, farmer_id, price_tier_1_qty, price_tier_1_price, price_tier_2_qty, price_tier_2_price, price_tier_3_price',
    )
    .in('id', listingIds) as { data: ListingRow[] | null }

  if (!listings || listings.length !== listingIds.length) {
    return bad('One or more items in your cart are no longer available.')
  }

  const listingById = new Map(listings.map((l) => [l.id, l]))
  const rows: Array<Record<string, unknown>> = []
  let total = 0

  for (const item of items) {
    const listing = listingById.get(item.listingId)
    if (!listing) return bad('Item missing.')
    if (listing.farmer_id !== farmerId) return bad('Items must belong to the same farmer.')
    if (listing.stock_qty != null && item.qty > listing.stock_qty) {
      return bad(`Only ${listing.stock_qty} ${listing.unit || 'kg'} of ${listing.name} available right now.`)
    }

    const unitPrice = getTierPrice(item.qty, {
      priceTier1Qty: listing.price_tier_1_qty,
      priceTier1Price: listing.price_tier_1_price,
      priceTier2Qty: listing.price_tier_2_qty,
      priceTier2Price: listing.price_tier_2_price,
      priceTier3Price: listing.price_tier_3_price,
    })

    const linePrice = unitPrice != null ? Math.round(unitPrice * item.qty) : null
    if (linePrice == null || linePrice <= 0) {
      return bad(`Price not set for ${listing.name}. Please ask the farmer.`)
    }
    total += linePrice

    rows.push({
      farmer_id: farmerId,
      produce_listing_id: listing.id,
      produce_name: listing.name,
      quantity: item.qty,
      unit: listing.unit || 'kg',
      total_price: linePrice,
      buyer_name: consumer.name || 'Buyer',
      buyer_phone: consumer.phone,
      consumer_id: consumer.id,
      pickup_location: typeof pickupLocation === 'string' ? pickupLocation.slice(0, 200) : null,
      status: 'pending',
      payment_method: paymentMethod,
      payment_status: 'pending',
    })
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('orders')
    .insert(rows)
    .select('id')

  if (insertErr || !inserted) {
    console.error('[YFF] place-order insert failed:', insertErr?.message)
    return bad('Could not place order. Please try again.', 500)
  }

  return NextResponse.json({
    ok: true,
    orderIds: inserted.map((r) => r.id),
    total,
  })
}

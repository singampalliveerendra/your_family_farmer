import { createClient } from '@supabase/supabase-js'
import { randomInt } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { getTierPrice } from '@/lib/pricing'
import { normalizePhone } from '@/lib/phone'
import { DELIVERY_FEE_RUPEES } from '@/lib/delivery-fee'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type IncomingItem = { listingId: string; qty: number }

// 4-digit handover code, generated server-side at order placement. The
// customer reads it off their order page and reads it aloud to the rider at
// the door. crypto.randomInt avoids Math.random's predictability.
function generateHandoverOtp(): string {
  return String(randomInt(0, 10000)).padStart(4, '0')
}

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
        deliveryType?: string
        deliveryAddress?: string | null
        deliveryLandmark?: string | null
        deliveryPincode?: string | null
        deliveryAltPhone?: string | null
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

  const deliveryType = body.deliveryType === 'home_delivery' ? 'home_delivery' : 'self_pickup'
  let deliveryAddress: string | null = null
  let deliveryLandmark: string | null = null
  let deliveryPincode: string | null = null
  let deliveryAltPhone: string | null = null

  if (deliveryType === 'home_delivery') {
    deliveryAddress = String(body.deliveryAddress ?? '').trim().slice(0, 400)
    deliveryLandmark = String(body.deliveryLandmark ?? '').trim().slice(0, 200) || null
    const rawPincode = String(body.deliveryPincode ?? '').trim()
    deliveryPincode = /^\d{6}$/.test(rawPincode) ? rawPincode : null
    const altPhone = normalizePhone(body.deliveryAltPhone)
    deliveryAltPhone = altPhone || null

    if (!deliveryAddress) return bad('Enter your delivery address.')
    if (deliveryAddress.length < 10) return bad('Delivery address looks too short. Please add door no, street, and area.')
    if (!deliveryPincode) return bad('Enter a valid 6-digit pincode.')
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
  // One OTP for the whole batch — rider does a single handover at the door,
  // so all rows from this checkout share the same code.
  const sharedHandoverOtp = deliveryType === 'home_delivery' ? generateHandoverOtp() : null
  const deliveryFee = deliveryType === 'home_delivery' ? DELIVERY_FEE_RUPEES : 0

  // Validate first (price + ownership) before we touch any stock. Stock
  // claims happen below with the RPC so two cart submits can't oversell.
  for (const item of items) {
    const listing = listingById.get(item.listingId)
    if (!listing) return bad('Item missing.')
    if (listing.farmer_id !== farmerId) return bad('Items must belong to the same farmer.')

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
      delivery_type: deliveryType,
      delivery_status: deliveryType === 'home_delivery' ? 'unassigned' : null,
      delivery_address: deliveryAddress,
      delivery_landmark: deliveryLandmark,
      delivery_pincode: deliveryPincode,
      delivery_alt_phone: deliveryAltPhone,
      handover_otp: sharedHandoverOtp,
      // Fee is paid once per cart, so we stamp it on the first row only.
      // sum(delivery_fee) and sum(rider_payout) over a batch === one fee.
      delivery_fee: 0,
      rider_payout: 0,
    })
  }

  if (rows.length > 0 && deliveryFee > 0) {
    rows[0].delivery_fee = deliveryFee
    rows[0].rider_payout = deliveryFee
  }

  // Atomic stock claim. decrement_stock returns false if the listing went
  // below zero (or vanished). On any failure we revert prior claims so we
  // don't leak inventory.
  const claimed: Array<{ listingId: string; qty: number }> = []
  const revertClaims = async () => {
    for (const c of claimed) {
      try {
        await supabase.rpc('increment_stock', { p_listing_id: c.listingId, p_qty: c.qty })
      } catch (e) {
        console.error('[YFF] increment_stock revert failed:', e)
      }
    }
  }
  for (const item of items) {
    const listing = listingById.get(item.listingId)!
    const { data: ok, error: rpcErr } = await supabase.rpc('decrement_stock', {
      p_listing_id: item.listingId,
      p_qty: item.qty,
    })
    if (rpcErr) {
      console.error('[YFF] decrement_stock rpc failed:', rpcErr.message)
      await revertClaims()
      return bad('Could not place order. Please try again.', 500)
    }
    if (!ok) {
      await revertClaims()
      return bad(`${listing.name} just sold out. Please reduce the quantity and try again.`)
    }
    claimed.push({ listingId: item.listingId, qty: item.qty })
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('orders')
    .insert(rows)
    .select('id')

  if (insertErr || !inserted) {
    console.error('[YFF] place-order insert failed:', insertErr?.message)
    // Roll the stock back so the row isn't lost.
    await revertClaims()
    return bad('Could not place order. Please try again.', 500)
  }

  return NextResponse.json({
    ok: true,
    orderIds: inserted.map((r) => r.id),
    total,
    deliveryFee,
    grandTotal: total + deliveryFee,
  })
}

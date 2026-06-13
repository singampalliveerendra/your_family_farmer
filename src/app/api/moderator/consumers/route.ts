import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Orders in these states never happened as a sale, so they don't count toward
// a buyer's spend or order tally.
const NON_SALE = new Set(['declined', 'cancelled'])

// GET — two lists for the zone:
//   buyers:  everyone who ordered from a farmer in the zone, with order count
//            and total spend, biggest spender first.
//   intents: open (unfulfilled) demand intents, soonest needed first.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone()
  const supabase = svc()

  // Farmers in zone → their orders define the zone's buyers.
  const { data: farmers, error: fErr } = await supabase
    .from('farmers').select('id').eq('region_slug', zone)
  if (fErr) {
    console.error('[YFF moderator/consumers] farmers query failed:', fErr.message)
    return NextResponse.json({ error: fErr.message }, { status: 500 })
  }
  const farmerIds = (farmers ?? []).map((f) => f.id)

  type Buyer = { key: string; name: string; phone: string | null; consumer_id: string | null; order_count: number; total_spend: number; last_order_at: string | null }
  const buyersByKey = new Map<string, Buyer>()

  if (farmerIds.length > 0) {
    const { data: orders, error: oErr } = await supabase
      .from('orders')
      .select('consumer_id, buyer_name, buyer_phone, total_price, status, created_at')
      .in('farmer_id', farmerIds)
    if (oErr) {
      console.error('[YFF moderator/consumers] orders query failed:', oErr.message)
      return NextResponse.json({ error: oErr.message }, { status: 500 })
    }
    for (const o of orders ?? []) {
      // Group by phone, falling back to the consumer account id, then name.
      const key = (o.buyer_phone || o.consumer_id || o.buyer_name || 'unknown') as string
      let b = buyersByKey.get(key)
      if (!b) {
        b = { key, name: o.buyer_name || 'Buyer', phone: o.buyer_phone ?? null, consumer_id: o.consumer_id ?? null, order_count: 0, total_spend: 0, last_order_at: null }
        buyersByKey.set(key, b)
      }
      if (!NON_SALE.has(String(o.status))) {
        b.order_count += 1
        b.total_spend += Number(o.total_price) || 0
      }
      if (o.created_at && (!b.last_order_at || o.created_at > b.last_order_at)) b.last_order_at = o.created_at
      if (!b.phone && o.buyer_phone) b.phone = o.buyer_phone
      if (!b.consumer_id && o.consumer_id) b.consumer_id = o.consumer_id
    }
  }

  // Resolve which buyers have a login account (and whether it is suspended), so
  // the moderator can deactivate it. Match on account id first, then phone.
  const acctById = new Map<string, { id: string; suspended: boolean; reason: string | null }>()
  const acctByPhone = new Map<string, { id: string; suspended: boolean; reason: string | null }>()
  const buyerList = Array.from(buyersByKey.values()).filter((b) => b.order_count > 0)
  const ids = buyerList.map((b) => b.consumer_id).filter(Boolean) as string[]
  const phones = buyerList.map((b) => b.phone).filter(Boolean) as string[]
  if (ids.length > 0 || phones.length > 0) {
    const { data: accounts } = await supabase
      .from('consumers_auth')
      .select('id, phone, suspended, suspended_reason')
      .or([
        ids.length ? `id.in.(${ids.join(',')})` : '',
        phones.length ? `phone.in.(${phones.map((p) => `"${p}"`).join(',')})` : '',
      ].filter(Boolean).join(','))
    for (const a of accounts ?? []) {
      const rec = { id: a.id, suspended: a.suspended === true, reason: (a.suspended_reason as string | null) ?? null }
      acctById.set(a.id, rec)
      if (a.phone) acctByPhone.set(a.phone, rec)
    }
  }

  const buyers = buyerList
    .map((b) => {
      const acct = (b.consumer_id && acctById.get(b.consumer_id)) || (b.phone && acctByPhone.get(b.phone)) || null
      return {
        name: b.name,
        phone: b.phone,
        order_count: b.order_count,
        total_spend: Math.round(b.total_spend),
        last_order_at: b.last_order_at,
        account_id: acct?.id ?? null,
        suspended: acct?.suspended ?? false,
        suspended_reason: acct?.reason ?? null,
      }
    })
    .sort((a, b) => b.total_spend - a.total_spend)

  // Open demand intents in the zone, soonest-needed first (nulls last).
  const { data: intents, error: iErr } = await supabase
    .from('demand_intents')
    .select('id, crop_name, quantity_kg, needed_by_date, delivery_location, requester_name, requester_phone, created_at')
    .eq('region_slug', zone)
    .eq('fulfilled', false)
  if (iErr) {
    console.error('[YFF moderator/consumers] intents query failed:', iErr.message)
    return NextResponse.json({ error: iErr.message }, { status: 500 })
  }
  const sortedIntents = (intents ?? []).sort((a, b) => {
    if (!a.needed_by_date) return 1
    if (!b.needed_by_date) return -1
    return a.needed_by_date.localeCompare(b.needed_by_date)
  })

  return NextResponse.json({ buyers, intents: sortedIntents })
}

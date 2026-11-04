import { NextRequest, NextResponse } from 'next/server'
import { requireAggregator, svc } from '@/lib/aggregator-auth'
import { buildMarket, type MarketGrowerRow, type MarketHarvestRow, type MarketListingRow, type MarketSellerRow } from '@/lib/bulkMarket'
import { accessOf, type SubscriptionRow } from '@/lib/subscriptionPlans'
import { standingOf } from '@/lib/subscriptionLifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The aggregators' bulk market (Phase 5). GET → every bulk listing this
// aggregator may see; GET ?id=<listing> → one of them.
// Aggregators only — never a household buyer, never a farmer (farmers sell
// bulk, they do not buy it). Seller phone / WhatsApp / address are put into
// the response ONLY for an aggregator holding a Buying or Combined plan
// (src/lib/bulkMarket.ts); everyone else gets name, village and district.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LISTING_COLUMNS =
  'id, farmer_id, name, variety, emoji, category, unit, image_url, image_urls, status, sale_mode, sale_step, stock_qty, wholesale_price, wholesale_min_qty, wholesale_pack_size, wholesale_transport_states, source_farmer_id, method, description'

export async function GET(req: NextRequest) {
  const agg = await requireAggregator(req)
  if (!agg) return NextResponse.json({ error: 'Aggregator login required.' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (id !== null && !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid listing.' }, { status: 400 })

  const supabase = svc()
  // What this aggregator holds. No subscription table yet = no plan, so the
  // market still opens, just locked.
  const { data: subs } = await supabase
    .from('aggregator_subscriptions')
    .select('id, kind, source, status, starts_at, ends_at')
    .eq('aggregator_id', agg.id)
  const held = (subs ?? []) as SubscriptionRow[]
  const access = accessOf(held)

  let q = supabase
    .from('produce_listings')
    .select(LISTING_COLUMNS)
    .in('sale_mode', ['wholesale', 'both'])
    .eq('status', 'available')
  if (id) q = q.eq('id', id)
  const { data: listings, error } = await q.limit(500)
  if (error) {
    // Before scripts/wholesale-migration.sql there is no bulk produce at all.
    return NextResponse.json({ items: [], access: { buying: access.buying, standing: standingOf(held).state }, configured: false })
  }
  const rows = (listings ?? []) as MarketListingRow[]
  const listingIds = rows.map((l) => l.id)
  const sellerIds = [...new Set(rows.map((l) => l.farmer_id))]
  const growerIds = [...new Set(rows.map((l) => l.source_farmer_id).filter(Boolean))] as string[]

  const [harvests, sellers, growers] = await Promise.all([
    listingIds.length
      ? supabase.from('harvests').select('id, produce_listing_id, stock_qty, paused, harvested_at').in('produce_listing_id', listingIds).eq('paused', false)
      : Promise.resolve({ data: [] }),
    sellerIds.length
      ? supabase.from('farmers').select('id, name, village, district, state, phone, farm_address, account_type, active').in('id', sellerIds)
      : Promise.resolve({ data: [] }),
    growerIds.length
      ? supabase.from('source_farmers').select('id, name, village').in('id', growerIds)
      : Promise.resolve({ data: [] }),
  ])

  const items = buildMarket({
    listings: rows,
    harvests: (harvests.data ?? []) as MarketHarvestRow[],
    sellers: (sellers.data ?? []) as MarketSellerRow[],
    growers: (growers.data ?? []) as MarketGrowerRow[],
    viewerId: agg.id,
    canContact: access.buying,
  })
  const accessOut = { buying: access.buying, standing: standingOf(held).state }
  if (id) {
    const item = items[0]
    if (!item) return NextResponse.json({ error: 'This bulk listing is not available any more.' }, { status: 404 })
    return NextResponse.json({ item, access: accessOut, configured: true })
  }
  return NextResponse.json({ items, access: accessOut, configured: true })
}

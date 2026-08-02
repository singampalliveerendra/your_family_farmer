import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'
import { purchaseCountsFor } from '@/lib/purchaseCounts'
import { normalizeUrl } from '@/lib/links'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Which DB status(es) each UI tab maps to. The "rejected" tab doubles as the
// home for moderator-suspended listings so a pulled listing is still visible.
const TAB_STATUS: Record<string, string[]> = {
  pending: ['pending_review'],
  active: ['available'],
  rejected: ['rejected', 'suspended'],
}

// GET — listings in the moderator's zone for one tab, newest-pending first.
// Each row carries the farmer's name so the card can show it.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone(req)
  const supabase = svc()

  const tab = req.nextUrl.searchParams.get('tab') ?? 'pending'
  const statuses = TAB_STATUS[tab] ?? TAB_STATUS.pending

  // Farmers in this zone — listings are scoped through them.
  const { data: zoneFarmers, error: fErr } = await supabase
    .from('farmers')
    .select('id, name')
    .eq('region_slug', zone)
  if (fErr) {
    console.error('[YFF moderator/listings] farmers query failed:', fErr.message)
    return NextResponse.json({ error: fErr.message }, { status: 500 })
  }
  const nameById = new Map((zoneFarmers ?? []).map((f) => [f.id, f.name]))
  const farmerIds = (zoneFarmers ?? []).map((f) => f.id)
  if (farmerIds.length === 0) return NextResponse.json({ listings: [] })

  // Pending oldest-first (act on the longest-waiting first); others newest-first.
  const ascending = tab === 'pending'
  const { data: listings, error } = await supabase
    .from('produce_listings')
    .select('id, farmer_id, name, variety, method, unit, stock_qty, brix, price_tier_1_price, status, rejection_reason, created_at, harvest_date, shelf_life_days, rating_avg, review_count')
    .in('farmer_id', farmerIds)
    .in('status', statuses)
    .order('created_at', { ascending })
  if (error) {
    console.error('[YFF moderator/listings] listings query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Purchase counts so the moderator can sort harvests by popularity.
  const counts = await purchaseCountsFor((listings ?? []).map((l) => l.id as string))
  const rows = (listings ?? []).map((l) => ({
    ...l,
    farmer_name: nameById.get(l.farmer_id) ?? '—',
    purchase_count: counts[l.id as string] ?? 0,
  }))
  return NextResponse.json({ listings: rows })
}

const METHODS = ['natural', 'organic', 'low_chemical', 'chemical'] as const
const UNITS = ['kg', 'g', 'litre', 'dozen', 'piece', 'bunch'] as const

function toNum(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

// datetime-local string (or any parseable date) → stored UTC ISO, else null.
function toIso(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// POST — moderator adds a produce listing on behalf of a farmer in their zone.
// Moderator-created listings are trusted, so they go live immediately
// (status 'available') rather than into the pending_review queue.
//   { farmer_id, name, variety?, method, unit, stock_qty?, description?,
//     brix?, price_tier_1_*, price_tier_2_*, availability_from?, availability_to?,
//     harvest_frequency?, harvest_frequency_count? }
export async function POST(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone(req)
  const supabase = svc()

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
  const b = body as Record<string, unknown>

  const farmer_id = String(b.farmer_id ?? '').trim()
  const name = String(b.name ?? '').trim()
  if (!farmer_id) return NextResponse.json({ error: 'Choose a farmer.' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'Harvest name is required.' }, { status: 400 })

  // Harvest date/time + shelf life are mandatory (drive the buyer freshness clock).
  const harvestDate = toIso(b.harvest_date)
  if (!harvestDate) return NextResponse.json({ error: 'Harvest date & time is required.' }, { status: 400 })
  const shelfLife = toNum(b.shelf_life_days)
  if (!shelfLife) return NextResponse.json({ error: 'Shelf life (days) is required.' }, { status: 400 })

  // The chosen farmer must belong to this moderator's zone.
  const { data: farmer } = await supabase
    .from('farmers').select('id, region_slug').eq('id', farmer_id).maybeSingle()
  if (!farmer || farmer.region_slug !== zone) {
    return NextResponse.json({ error: 'That farmer is not in your zone.' }, { status: 400 })
  }

  const methodRaw = String(b.method ?? 'natural')
  const method = (METHODS as readonly string[]).includes(methodRaw) ? methodRaw : 'natural'
  const unitRaw = String(b.unit ?? 'kg')
  const unit = (UNITS as readonly string[]).includes(unitRaw) ? unitRaw : 'kg'

  const price1 = toNum(b.price_tier_1_price)
  const price1Qty = toNum(b.price_tier_1_qty)
  const price2 = toNum(b.price_tier_2_price)
  const price2Qty = toNum(b.price_tier_2_qty)
  const price3 = toNum(b.price_tier_3_price)

  // Delivery method (pickup | courier | both). Charge & radius only apply when
  // the farmer offers courier — null for pickup-only, matching the farmer form.
  const deliveryModeRaw = String(b.delivery_mode ?? 'pickup')
  const deliveryMode = (['pickup', 'courier', 'both'] as const).includes(deliveryModeRaw as 'pickup' | 'courier' | 'both')
    ? deliveryModeRaw : 'pickup'

  const insert: Record<string, unknown> = {
    farmer_id,
    name,
    emoji: String(b.emoji ?? '📦') || '📦',
    method,
    unit,
    variety: String(b.variety ?? '').trim() || null,
    stock_qty: toNum(b.stock_qty),
    description: String(b.description ?? '').trim() || null,
    video_url: normalizeUrl(b.video_url as string | null | undefined),
    brix: toNum(b.brix),
    soil_organic_carbon: toNum(b.soil_organic_carbon),
    delivery_mode: deliveryMode,
    delivery_charge: deliveryMode === 'pickup' ? null : toNum(b.delivery_charge),
    delivery_radius_km: deliveryMode === 'pickup' ? null : toNum(b.delivery_radius_km),
    image_url: (typeof b.image_url === 'string' && b.image_url) ? b.image_url : null,
    availability_from: String(b.availability_from ?? '').trim() || null,
    availability_to: String(b.availability_to ?? '').trim() || null,
    harvest_frequency: String(b.harvest_frequency ?? '').trim() || null,
    harvest_frequency_count: toNum(b.harvest_frequency_count),
    harvest_date: harvestDate,
    shelf_life_days: shelfLife,
    status: 'available',
  }
  if (price1) { insert.price_tier_1_price = price1; insert.price_tier_1_qty = price1Qty ?? 1 }
  if (price2 && price2Qty) { insert.price_tier_2_price = price2; insert.price_tier_2_qty = price2Qty }
  // Tier 3 sits just above tier 2's band (matches the farmer form's qty rule).
  if (price3) { insert.price_tier_3_price = price3; insert.price_tier_3_qty = (price2Qty ?? 1) + 1 }

  const { data: created, error } = await supabase
    .from('produce_listings')
    .insert(insert)
    .select('id')
    .single()
  if (error) {
    console.error('[YFF moderator/listings POST] insert failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Parity with the farmer flow: log a matching harvest row so this produce
  // becomes a sellable HARVEST (appears in the Fresh/Upcoming feeds with its own
  // stock), not just a template. The listing's stock is the harvest's sellable
  // quantity. Best-effort — never fail the listing save on it.
  const harvestQty = toNum(b.stock_qty)
  const { error: hErr } = await supabase.from('harvests').insert({
    produce_listing_id: created.id,
    farmer_id,
    harvested_at: harvestDate,
    shelf_life_days: shelfLife,
    approx_quantity: harvestQty,
    stock_qty: harvestQty,
    unit,
  })
  if (hErr) console.error('[YFF moderator/listings POST] harvest insert failed:', hErr.message)

  return NextResponse.json({ id: created.id })
}

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

// Actions the moderator can take on a listing, and the status each sets.
//   approve  → available   (goes live on the consumer page)
//   reject   → rejected    (requires a reason)
//   suspend  → suspended   (pull a live listing; distinct from an organically
//                           sold-out one so it can surface in the Rejected tab)
const ACTION_STATUS: Record<string, string> = {
  approve: 'available',
  reject: 'rejected',
  suspend: 'suspended',
}

// PATCH — approve / reject / suspend a listing. Zone-scoped: the listing's
// farmer must be in this moderator's region before any write.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const { id } = await params
  const zone = getModeratorZone(req)
  const supabase = svc()

  const body = await req.json().catch(() => null)
  const action = String((body as { action?: unknown })?.action ?? '')
  const status = ACTION_STATUS[action]
  if (!status) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  const reason = String((body as { reason?: unknown })?.reason ?? '').trim()
  if (action === 'reject' && !reason) {
    return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 })
  }

  // Confirm the listing belongs to a farmer in this zone.
  const { data: listing } = await supabase
    .from('produce_listings')
    .select('id, farmer_id')
    .eq('id', id)
    .maybeSingle()
  if (!listing?.farmer_id) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  }
  const { data: farmer } = await supabase
    .from('farmers')
    .select('region_slug')
    .eq('id', listing.farmer_id)
    .maybeSingle()
  if (!farmer || farmer.region_slug !== zone) {
    return NextResponse.json({ error: 'Listing not found in your zone.' }, { status: 404 })
  }

  // Clear any old rejection reason on approve/suspend; set it on reject.
  const update: Record<string, unknown> = { status, rejection_reason: action === 'reject' ? reason : null }

  const { data: updated, error } = await supabase
    .from('produce_listings')
    .update(update)
    .eq('id', id)
    .select('id, status, rejection_reason')
    .single()
  if (error) {
    console.error('[YFF moderator/listings PATCH] failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ listing: updated })
}

// Confirm a listing exists AND its farmer is in this moderator's zone.
// Returns the farmer_id when in-zone, otherwise null.
async function listingFarmerInZone(
  supabase: ReturnType<typeof svc>,
  id: string,
  zone: string | null,
): Promise<string | null> {
  const { data: listing } = await supabase
    .from('produce_listings').select('id, farmer_id').eq('id', id).maybeSingle()
  if (!listing?.farmer_id) return null
  const { data: farmer } = await supabase
    .from('farmers').select('region_slug').eq('id', listing.farmer_id).maybeSingle()
  if (!farmer || farmer.region_slug !== zone) return null
  return listing.farmer_id as string
}

// GET — full listing for the edit form. Zone-scoped; includes the farmer name
// so the edit screen can show which farmer this harvest belongs to.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const { id } = await params
  const zone = getModeratorZone(req)
  const supabase = svc()

  const farmerId = await listingFarmerInZone(supabase, id, zone)
  if (!farmerId) return NextResponse.json({ error: 'Listing not found in your zone.' }, { status: 404 })

  const { data: listing, error } = await supabase
    .from('produce_listings').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: farmer } = await supabase
    .from('farmers').select('name').eq('id', farmerId).maybeSingle()

  return NextResponse.json({ listing, farmer_name: farmer?.name ?? '—' })
}

const METHODS = ['natural', 'organic', 'low_chemical', 'chemical'] as const
const UNITS = ['kg', 'g', 'litre', 'dozen', 'piece', 'bunch'] as const

// Positive number (prices, min quantities) — else null.
function toPos(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}
// Non-negative number (stock, brix) — 0 is valid; else null.
function toNonNeg(v: unknown): number | null {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}
// datetime-local string (or any parseable date) → stored UTC ISO, else null.
function toIso(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// PUT — edit a listing's fields (name, pricing, stock, shelf life, …). Zone-
// scoped. Does not change status or ownership; use PATCH actions for those.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const { id } = await params
  const zone = getModeratorZone(req)
  const supabase = svc()

  const farmerId = await listingFarmerInZone(supabase, id, zone)
  if (!farmerId) return NextResponse.json({ error: 'Listing not found in your zone.' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
  const b = body as Record<string, unknown>

  const name = String(b.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Harvest name is required.' }, { status: 400 })

  // Harvest date/time + shelf life are mandatory (drive the buyer freshness clock).
  const harvestDate = toIso(b.harvest_date)
  if (!harvestDate) return NextResponse.json({ error: 'Harvest date & time is required.' }, { status: 400 })
  const shelfLife = toPos(b.shelf_life_days)
  if (!shelfLife) return NextResponse.json({ error: 'Shelf life (days) is required.' }, { status: 400 })

  const methodRaw = String(b.method ?? 'natural')
  const method = (METHODS as readonly string[]).includes(methodRaw) ? methodRaw : 'natural'
  const unitRaw = String(b.unit ?? 'kg')
  const unit = (UNITS as readonly string[]).includes(unitRaw) ? unitRaw : 'kg'

  const price1 = toPos(b.price_tier_1_price)
  const price1Qty = toPos(b.price_tier_1_qty)
  const price2 = toPos(b.price_tier_2_price)
  const price2Qty = toPos(b.price_tier_2_qty)
  const price3 = toPos(b.price_tier_3_price)

  const update: Record<string, unknown> = {
    name,
    emoji: String(b.emoji ?? '📦') || '📦',
    method,
    unit,
    variety: String(b.variety ?? '').trim() || null,
    stock_qty: toNonNeg(b.stock_qty),
    description: String(b.description ?? '').trim() || null,
    brix: toNonNeg(b.brix),
    soil_organic_carbon: toNonNeg(b.soil_organic_carbon),
    image_url: (typeof b.image_url === 'string' && b.image_url) ? b.image_url : null,
    harvest_date: harvestDate,
    shelf_life_days: shelfLife,
    availability_from: String(b.availability_from ?? '').trim() || null,
    availability_to: String(b.availability_to ?? '').trim() || null,
    harvest_frequency: String(b.harvest_frequency ?? '').trim() || null,
    harvest_frequency_count: toPos(b.harvest_frequency_count),
    // Clear tiers when blanked; only set when a valid price is given.
    price_tier_1_price: price1,
    price_tier_1_qty: price1 ? (price1Qty ?? 1) : null,
    price_tier_2_price: price2 && price2Qty ? price2 : null,
    price_tier_2_qty: price2 && price2Qty ? price2Qty : null,
    // Tier 3 sits just above tier 2's band (matches the farmer form's qty rule).
    price_tier_3_price: price3,
    price_tier_3_qty: price3 ? ((price2Qty ?? 1) + 1) : null,
  }

  const { data: updated, error } = await supabase
    .from('produce_listings')
    .update(update)
    .eq('id', id)
    .select('id, farmer_id')
    .single()
  if (error) {
    console.error('[YFF moderator/listings PUT] update failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Parity with the farmer flow: keep this produce's harvest in sync so it stays
  // a sellable HARVEST (with its own stock) in the Fresh/Upcoming feeds. Update
  // the most recent harvest row; create one if none exists yet (e.g. a listing
  // predating the harvest-as-product change). Best-effort.
  const harvestQty = toNonNeg(b.stock_qty)
  const { data: latest } = await supabase
    .from('harvests')
    .select('id')
    .eq('produce_listing_id', id)
    .order('harvested_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const harvestFields = {
    harvested_at: harvestDate,
    shelf_life_days: shelfLife,
    approx_quantity: harvestQty,
    stock_qty: harvestQty,
    unit,
  }
  const { error: hErr } = latest
    ? await supabase.from('harvests').update(harvestFields).eq('id', latest.id)
    : await supabase.from('harvests').insert({ produce_listing_id: id, farmer_id: updated.farmer_id, ...harvestFields })
  if (hErr) console.error('[YFF moderator/listings PUT] harvest sync failed:', hErr.message)

  return NextResponse.json({ id: updated.id })
}

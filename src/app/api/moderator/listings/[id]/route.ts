import { PACKS_NOT_READY, RETAIL_PACK_COLUMNS, applyRetailPackColumns, isPackColumnMissing } from '@/lib/packPricing'
import { createClient } from '@supabase/supabase-js'
import { applyRetailReach } from '@/lib/retailReach'
import { NextRequest, NextResponse } from 'next/server'
import { unitAllowsFractions } from '@/lib/saleStep'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'
import { normalizeUrl } from '@/lib/links'
import { bothPricesError, resolveWholesaleBody, isWholesaleColumnMissing, withoutWholesale, WHOLESALE_NOT_READY } from '@/lib/wholesale'
import { SELLING_PLAN_REQUIRED_MODERATOR, isSellingPlanError } from '@/lib/sellingLock'

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
    if (isSellingPlanError(error.message)) return NextResponse.json({ error: SELLING_PLAN_REQUIRED_MODERATOR, code: 'SELLING_PLAN_REQUIRED' }, { status: 403 })
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// A source-farmer id, or null. Ownership (that the farmer belongs to this
// aggregator) is the DB trigger's job — it guards every write path, not just
// this one.
function toUuid(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return UUID_RE.test(s) ? s : null
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

  // Shelf life is mandatory (drives the buyer freshness clock).
  //
  // Harvest date is OPTIONAL here. The edit form manages picks through the
  // shared HarvestManager panel, so it omits the field; rewriting the newest
  // harvest row from a stale form value would undo a pick the moderator just
  // logged. Legacy callers that still send it keep the old sync behaviour.
  const harvestDate = toIso(b.harvest_date)
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

  // Delivery method (pickup | courier | both). Charge & radius only apply when
  // the farmer offers courier — cleared for pickup-only, matching the farmer form.
  const deliveryModeRaw = String(b.delivery_mode ?? 'pickup')
  const deliveryMode = (['pickup', 'courier', 'both'] as const).includes(deliveryModeRaw as 'pickup' | 'courier' | 'both')
    ? deliveryModeRaw : 'pickup'

  const update: Record<string, unknown> = {
    name,
    emoji: String(b.emoji ?? '📦') || '📦',
    method,
    unit,
    variety: String(b.variety ?? '').trim() || null,
    stock_qty: toNonNeg(b.stock_qty),
    // Mirrors the farmer form: whole units only where a fraction can't be sold.
    sale_step: unitAllowsFractions(unit) ? (toPos(b.sale_step) ?? 1) : 1,
    description: String(b.description ?? '').trim() || null,
    video_url: normalizeUrl(b.video_url as string | null | undefined),
    brix: toNonNeg(b.brix),
    soil_organic_carbon: toNonNeg(b.soil_organic_carbon),
    image_url: (typeof b.image_url === 'string' && b.image_url) ? b.image_url : null,
    shelf_life_days: shelfLife,
    delivery_mode: deliveryMode,
    delivery_charge: deliveryMode === 'pickup' ? null : toNonNeg(b.delivery_charge),
    delivery_radius_km: deliveryMode === 'pickup' ? null : toNonNeg(b.delivery_radius_km),
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
  if (harvestDate) update.harvest_date = harvestDate
  // Aggregator attribution. Sent only when present so a caller that predates
  // the field can't blank it, and so the column being absent (migration not yet
  // run) doesn't fail every moderator edit.
  const sourceFarmerId = toUuid(b.source_farmer_id)
  if (sourceFarmerId) update.source_farmer_id = sourceFarmerId

  // Retail / Wholesale / Both. Only when the caller sent sale_mode, so an older
  // caller can't reset a wholesale listing to retail by leaving it out.
  if ('sale_mode' in b) {
    const wholesale = resolveWholesaleBody(b, unit)
    if (!wholesale.ok) return NextResponse.json({ error: wholesale.error.en }, { status: 400 })
    Object.assign(update, wholesale.columns)
  }

  // Retail packs (2026-11-10): sent only by a form that knows packs, so an
  // older caller leaves them alone. Same rules as the farmer's; the per-unit
  // columns (sale step, tiers) are derived from the pack when one is set.
  for (const k of RETAIL_PACK_COLUMNS) if (k in b) update[k] = b[k]
  const packErr = applyRetailPackColumns(update, unit)
  if (packErr) return NextResponse.json({ error: packErr.en }, { status: 400 })

  // Local only / Transportable across AP & TG (2026-11-05).
  {
    const reachErr = applyRetailReach(update, b, String(update.delivery_mode ?? ''))
    if (reachErr) return NextResponse.json({ error: reachErr.en }, { status: 400 })
  }

  // Both: wholesale must be cheaper than every retail price (2026-11-05). This
  // edit always rewrites the retail tiers; the sale mode and wholesale price
  // come from the saved row when the caller did not send them. Best-effort read
  // — a database without the wholesale columns skips the check.
  {
    const { data: saved } = 'sale_mode' in update
      ? { data: {} as Record<string, unknown> }
      : await supabase.from('produce_listings').select('sale_mode, wholesale_price').eq('id', id).maybeSingle()
    if (saved) {
      const priceErr = bothPricesError({ ...(saved as Record<string, unknown>), ...update })
      if (priceErr) return NextResponse.json({ error: priceErr.en }, { status: 400 })
    }
  }

  const save = (row: Record<string, unknown>) =>
    supabase.from('produce_listings').update(row).eq('id', id).select('id, farmer_id').single()
  let { data: updated, error } = await save(update)
  // Server without the wholesale columns: retail drops them and saves;
  // a wholesale choice is refused rather than silently lost.
  if (error && isPackColumnMissing(error.message)) return NextResponse.json({ error: PACKS_NOT_READY.en }, { status: 503 })
  if (error && isWholesaleColumnMissing(error.message)) {
    if (update.sale_mode !== 'retail') {
      return NextResponse.json({ error: WHOLESALE_NOT_READY.en }, { status: 503 })
    }
    ;({ data: updated, error } = await save(withoutWholesale(update)))
  }
  if (error && isSellingPlanError(error.message)) {
    return NextResponse.json({ error: SELLING_PLAN_REQUIRED_MODERATOR, code: 'SELLING_PLAN_REQUIRED' }, { status: 403 })
  }
  if (error || !updated) {
    const msg = error?.message ?? 'Update failed'
    console.error('[YFF moderator/listings PUT] update failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Only a caller that supplied a harvest date owns the harvest row. When the
  // edit form omits it, harvests belong to HarvestManager and we leave them
  // alone — mirroring the farmer's update-listing route, which never touches
  // harvests either. Best-effort: a failure here must not fail the save.
  if (harvestDate) {
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
  }

  return NextResponse.json({ id: updated.id })
}

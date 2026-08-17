import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'
import { normalizePickupSchedule, normalizePickupPhones } from '@/lib/pickup-slots'
import { normalizeUrl } from '@/lib/links'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Keep in sync with the POST handler in ../route.ts.
const METHODS = ['natural', 'organic', 'low_chemical', 'chemical'] as const

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Columns the edit form needs to prefill — the same shape the moderator filled
// in when onboarding the farmer.
const EDIT_COLUMNS =
  'id, slug, name, phone, village, district, method, active, story_quote, ' +
  // Aggregators are farmers rows with account_type = 'aggregator'. The edit
  // screen needs both to show the source-farmer list and the approval control.
  'account_type, approval_status, contact_person, how_we_aggregate, ' +
  'farm_size_acres, farming_since_year, farm_address, soil_organic_carbon, soil_ph, water_source, ' +
  'facebook_url, instagram_url, youtube_url, ' +
  'upi_id, cod_enabled, bank_account_number, bank_ifsc, pickup_locations, pickup_slots, ' +
  'pickup_location_phones, ' +
  'cover_photo_url, photo_url, pesticide_cert_url, upi_qr_code_url, ' +
  'lat, lng, location_name'

// GET — a single farmer's full record, scoped to the moderator's zone so the
// edit form can prefill. Returns 404 for farmers outside the zone.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const { id } = await params
  const zone = getModeratorZone(req)
  const supabase = svc()

  const { data: farmer, error } = await supabase
    .from('farmers')
    .select(`${EDIT_COLUMNS}, region_slug`)
    .eq('id', id)
    .maybeSingle() as { data: ({ region_slug?: string } & Record<string, unknown>) | null; error: { message: string } | null }

  if (error) {
    console.error('[YFF moderator/farmers GET] failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!farmer || farmer.region_slug !== zone) {
    return NextResponse.json({ error: 'Farmer not found in your zone.' }, { status: 404 })
  }

  // Don't leak the internal zone field back to the client.
  delete farmer.region_slug
  return NextResponse.json({ farmer })
}

// PATCH — edit farmer details or toggle active status. Scoped to the zone so a
// moderator can never touch a farmer outside their own region. Only the fields
// present in the body are written, so partial updates (e.g. just `active`) are
// safe. Mirrors the validation in the POST (create) handler.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const { id } = await params
  const zone = getModeratorZone(req)
  const supabase = svc()

  // Confirm the farmer belongs to this moderator's zone before any write.
  const { data: farmer } = await supabase
    .from('farmers')
    .select('id, region_slug')
    .eq('id', id)
    .maybeSingle()
  if (!farmer || farmer.region_slug !== zone) {
    return NextResponse.json({ error: 'Farmer not found in your zone.' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
  const b = body as Record<string, unknown>

  const update: Record<string, unknown> = {}

  // Core text fields.
  if ('name' in b) {
    const name = String(b.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 })
    update.name = name
  }
  if ('phone' in b) update.phone = String(b.phone ?? '').trim() || null
  if ('village' in b) update.village = String(b.village ?? '').trim() || null
  if ('district' in b) update.district = String(b.district ?? '').trim() || null
  if ('story_quote' in b) update.story_quote = String(b.story_quote ?? '').trim() || null
  if ('farm_address' in b) update.farm_address = String(b.farm_address ?? '').trim() || null
  if ('farm_size_acres' in b) update.farm_size_acres = Number(b.farm_size_acres) || null
  if ('farming_since_year' in b) update.farming_since_year = Number(b.farming_since_year) || null
  if ('soil_organic_carbon' in b) {
    update.soil_organic_carbon = Number(b.soil_organic_carbon) > 0 ? Number(b.soil_organic_carbon) : null
  }
  if ('soil_ph' in b) update.soil_ph = Number(b.soil_ph) > 0 ? Number(b.soil_ph) : null
  if ('water_source' in b) update.water_source = String(b.water_source ?? '').trim() || null
  // Social links: normalised (scheme added, non-http dropped) before storing, so
  // nothing downstream has to trust a raw pasted string.
  if ('facebook_url' in b)  update.facebook_url  = normalizeUrl(b.facebook_url as string | null | undefined)
  if ('instagram_url' in b) update.instagram_url = normalizeUrl(b.instagram_url as string | null | undefined)
  if ('youtube_url' in b)   update.youtube_url   = normalizeUrl(b.youtube_url as string | null | undefined)
  if ('active' in b) update.active = Boolean(b.active)
  if ('cod_enabled' in b) update.cod_enabled = b.cod_enabled === true

  // Aggregator details. account_type is deliberately NOT editable: switching a
  // seller either strands an aggregator's harvests without a source farmer, or
  // hands a farmer a source-farmer list that none of their harvests reference.
  if ('contact_person' in b) {
    update.contact_person = String(b.contact_person ?? '').trim().slice(0, 80) || null
  }
  if ('how_we_aggregate' in b) {
    update.how_we_aggregate = String(b.how_we_aggregate ?? '').trim().slice(0, 800) || null
  }
  if ('method' in b) {
    const m = String(b.method ?? '')
    if ((METHODS as readonly string[]).includes(m)) update.method = m
  }

  // Payout details — validated the same way as on create.
  if ('upi_id' in b) {
    const upi = String(b.upi_id ?? '').trim()
    if (upi && !/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(upi)) {
      return NextResponse.json({ error: 'Invalid UPI ID. Example: name@ybl' }, { status: 400 })
    }
    update.upi_id = upi || null
  }
  if ('bank_account_number' in b) {
    update.bank_account_number = String(b.bank_account_number ?? '').trim() || null
  }
  if ('bank_ifsc' in b) {
    const ifsc = String(b.bank_ifsc ?? '').trim().toUpperCase()
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      return NextResponse.json({ error: 'Invalid IFSC. Example: SBIN0001234' }, { status: 400 })
    }
    update.bank_ifsc = ifsc || null
  }

  // Pickup locations — dedupe and drop blanks, as on create.
  if ('pickup_locations' in b) {
    const raw = b.pickup_locations
    update.pickup_locations = Array.isArray(raw)
      ? Array.from(new Set(raw.map((p) => String(p).trim()).filter(Boolean)))
      : []
  }

  // Pickup schedule — a per-location map { [location]: PickupSlot[] }. Scope to
  // the locations sent alongside (falling back to the map's own keys), drop
  // empty windows, and store null when empty so the column stays tidy.
  if ('pickup_slots' in b) {
    const locs = Array.isArray(b.pickup_locations)
      ? b.pickup_locations.map((p) => String(p).trim()).filter(Boolean)
      : undefined
    const clean = normalizePickupSchedule(b.pickup_slots, locs)
    update.pickup_slots = Object.keys(clean).length > 0 ? clean : null
  }

  // Contact number per pickup point — same per-location map shape, scoped the
  // same way. normalizePickupPhones drops anything that is not a full 10
  // digits, so a partial number can never reach a buyer.
  if ('pickup_location_phones' in b) {
    const locs = Array.isArray(b.pickup_locations)
      ? b.pickup_locations.map((p) => String(p).trim()).filter(Boolean)
      : undefined
    update.pickup_location_phones = normalizePickupPhones(b.pickup_location_phones, locs)
  }

  // Photos — the client sends the resolved URL (existing, newly uploaded, or
  // null to clear).
  if ('cover_photo_url' in b) update.cover_photo_url = String(b.cover_photo_url ?? '').trim() || null
  if ('photo_url' in b) update.photo_url = String(b.photo_url ?? '').trim() || null
  if ('pesticide_cert_url' in b) update.pesticide_cert_url = String(b.pesticide_cert_url ?? '').trim() || null
  if ('upi_qr_code_url' in b) update.upi_qr_code_url = String(b.upi_qr_code_url ?? '').trim() || null

  // Farm GPS. lat/lng move together; location_name follows. Clearing the
  // location (null lat/lng) also clears the stored name.
  if ('lat' in b || 'lng' in b) {
    const latRaw = b.lat
    const lngRaw = b.lng
    const lat = typeof latRaw === 'number' && Number.isFinite(latRaw) ? latRaw : null
    const lng = typeof lngRaw === 'number' && Number.isFinite(lngRaw) ? lngRaw : null
    update.lat = lat
    update.lng = lng
    if (lat != null && lng != null) {
      update.location_name = String(b.location_name ?? '').trim() || null
    } else {
      update.location_name = null
    }
  } else if ('location_name' in b) {
    update.location_name = String(b.location_name ?? '').trim() || null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('farmers')
    .update(update)
    .eq('id', id)
    .select('id, slug, name, phone, village, district, method, active')
    .single()

  if (error) {
    console.error('[YFF moderator/farmers PATCH] failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ farmer: updated })
}

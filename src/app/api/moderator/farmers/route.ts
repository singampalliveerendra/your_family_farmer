import { createClient } from '@supabase/supabase-js'
import { randomInt } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone, getModeratorId } from '@/lib/moderator-session'
import { normalizePickupSchedule, normalizePickupPhones } from '@/lib/pickup-slots'
import { normalizeUrl } from '@/lib/links'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const METHODS = ['natural', 'organic', 'low_chemical', 'chemical'] as const

// Unambiguous alphabet for activation codes — no 0/O/1/I/L so a farmer reading
// the code off WhatsApp can't mistype it.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// A shareable activation code, e.g. "YFF-7K9Q". Caller checks DB uniqueness.
function makeActivationCode(): string {
  let s = ''
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return `YFF-${s}`
}

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// GET — farmers in the moderator's zone, with a live listing count.
// `?mine=1` narrows to farmers this moderator personally onboarded (for the
// my-farmers page) and includes the activation code so it can be re-shared.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone(req)
  const mineOnly = req.nextUrl.searchParams.get('mine') === '1'
  const moderatorId = getModeratorId(req)
  const supabase = svc()

  let query = supabase
    .from('farmers')
    .select('id, slug, name, village, district, method, phone, active, created_at, activation_code, registered_by_moderator')
    .eq('region_slug', zone)
    .order('created_at', { ascending: false })

  if (mineOnly) {
    // A legacy session (no id) has no "mine" — return an empty list rather than
    // leaking the whole zone, prompting a re-login to populate the id.
    if (!moderatorId) return NextResponse.json({ farmers: [], needsRelogin: true })
    query = query.eq('registered_by_moderator', moderatorId)
  }

  const { data: farmers, error } = await query

  if (error) {
    console.error('[YFF moderator/farmers] query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Listing count per farmer (one grouped query, merged in JS).
  const ids = (farmers ?? []).map((f) => f.id)
  const counts: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: listings } = await supabase
      .from('produce_listings')
      .select('farmer_id')
      .in('farmer_id', ids)
    for (const l of listings ?? []) {
      if (l.farmer_id) counts[l.farmer_id] = (counts[l.farmer_id] ?? 0) + 1
    }
  }

  const withCounts = (farmers ?? []).map((f) => ({ ...f, listing_count: counts[f.id] ?? 0 }))
  return NextResponse.json({ farmers: withCounts })
}

// POST — register a new farmer in the zone. Auto-generates a unique slug.
export async function POST(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone(req)
  const supabase = svc()

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })

  const name = String((body as { name?: unknown }).name ?? '').trim()
  const phone = String((body as { phone?: unknown }).phone ?? '').trim()
  const village = String((body as { village?: unknown }).village ?? '').trim()
  const district = String((body as { district?: unknown }).district ?? '').trim()
  const methodRaw = String((body as { method?: unknown }).method ?? 'natural').trim()
  const story_quote = String((body as { story_quote?: unknown }).story_quote ?? '').trim()
  const farm_size_acres = Number((body as { farm_size_acres?: unknown }).farm_size_acres ?? 0) || null
  const farming_since_year = Number((body as { farming_since_year?: unknown }).farming_since_year ?? 0) || null

  // Marketing / payout details — the same things a farmer fills on their own
  // profile, so a moderator onboarding on their behalf can capture them up front.
  const farm_address = String((body as { farm_address?: unknown }).farm_address ?? '').trim()
  const upi_id = String((body as { upi_id?: unknown }).upi_id ?? '').trim()
  const cod_enabled = (body as { cod_enabled?: unknown }).cod_enabled === true
  // Bank payout + soil details collected during moderator-led onboarding.
  const bank_account_number = String((body as { bank_account_number?: unknown }).bank_account_number ?? '').trim()
  const bank_ifsc = String((body as { bank_ifsc?: unknown }).bank_ifsc ?? '').trim().toUpperCase()
  const socRaw = (body as { soil_organic_carbon?: unknown }).soil_organic_carbon
  const soil_organic_carbon = Number(socRaw) > 0 ? Number(socRaw) : null
  const phRaw = (body as { soil_ph?: unknown }).soil_ph
  const soil_ph = Number(phRaw) > 0 ? Number(phRaw) : null
  const water_source = String((body as { water_source?: unknown }).water_source ?? '').trim()
  const facebook_url  = normalizeUrl((body as { facebook_url?: string }).facebook_url)
  const instagram_url = normalizeUrl((body as { instagram_url?: string }).instagram_url)
  const youtube_url   = normalizeUrl((body as { youtube_url?: string }).youtube_url)

  // Photos & farm GPS — the same media a farmer can attach to their own profile.
  const cover_photo_url = String((body as { cover_photo_url?: unknown }).cover_photo_url ?? '').trim()
  const photo_url = String((body as { photo_url?: unknown }).photo_url ?? '').trim()
  const pesticide_cert_url = String((body as { pesticide_cert_url?: unknown }).pesticide_cert_url ?? '').trim()
  const upi_qr_code_url = String((body as { upi_qr_code_url?: unknown }).upi_qr_code_url ?? '').trim()
  const location_name = String((body as { location_name?: unknown }).location_name ?? '').trim()
  const latRaw = (body as { lat?: unknown }).lat
  const lngRaw = (body as { lng?: unknown }).lng
  const lat = typeof latRaw === 'number' && Number.isFinite(latRaw) ? latRaw : null
  const lng = typeof lngRaw === 'number' && Number.isFinite(lngRaw) ? lngRaw : null

  const rawPickups = (body as { pickup_locations?: unknown }).pickup_locations
  const pickup_locations = Array.isArray(rawPickups)
    ? Array.from(new Set(rawPickups.map((p) => String(p).trim()).filter(Boolean)))
    : []

  // pickup_slots: a per-location map { [location]: PickupSlot[] }. Normalized
  // (scoped to existing locations, drops empty-day windows) and stored as null
  // when none — matching the farmer-side profile editor.
  const cleanSchedule = normalizePickupSchedule(
    (body as { pickup_slots?: unknown }).pickup_slots,
    pickup_locations,
  )
  const pickup_slots = Object.keys(cleanSchedule).length > 0 ? cleanSchedule : null

  // Contact number per pickup point, same map shape and scoping.
  const pickup_location_phones = normalizePickupPhones(
    (body as { pickup_location_phones?: unknown }).pickup_location_phones,
    pickup_locations,
  )

  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  if (upi_id && !/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(upi_id)) {
    return NextResponse.json({ error: 'Invalid UPI ID. Example: name@ybl' }, { status: 400 })
  }
  if (bank_ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bank_ifsc)) {
    return NextResponse.json({ error: 'Invalid IFSC. Example: SBIN0001234' }, { status: 400 })
  }
  const method = (METHODS as readonly string[]).includes(methodRaw) ? methodRaw : 'natural'

  // Unique slug — append -2, -3, ... if taken.
  const base = slugify(name) || 'farmer'
  let slug = base
  for (let i = 2; i < 50; i++) {
    const { data: existing } = await supabase.from('farmers').select('id').eq('slug', slug).maybeSingle()
    if (!existing) break
    slug = `${base}-${i}`
  }

  // Unique activation code to share with the farmer for login activation.
  let activation_code = makeActivationCode()
  for (let i = 0; i < 20; i++) {
    const { data: clash } = await supabase.from('farmers').select('id').eq('activation_code', activation_code).maybeSingle()
    if (!clash) break
    activation_code = makeActivationCode()
  }

  // The moderator who is onboarding this farmer (from their signed session).
  const registered_by_moderator = getModeratorId(req)

  const { data: inserted, error } = await supabase
    .from('farmers')
    .insert({
      slug,
      name,
      phone: phone || null,
      village: village || null,
      district: district || null,
      method,
      story_quote: story_quote || null,
      farm_size_acres,
      farming_since_year,
      farm_address: farm_address || null,
      pickup_locations,
      pickup_slots,
      pickup_location_phones,
      upi_id: upi_id || null,
      upi_qr_code_url: upi_qr_code_url || null,
      cod_enabled,
      bank_account_number: bank_account_number || null,
      bank_ifsc: bank_ifsc || null,
      soil_organic_carbon,
      soil_ph,
      water_source: water_source || null,
      facebook_url,
      instagram_url,
      youtube_url,
      cover_photo_url: cover_photo_url || null,
      photo_url: photo_url || null,
      pesticide_cert_url: pesticide_cert_url || null,
      lat,
      lng,
      location_name: lat != null && lng != null ? (location_name || name) : null,
      region_slug: zone,
      active: true,
      activation_code,
      registered_by_moderator,
    })
    .select('id, slug, name, phone, activation_code')
    .single()

  if (error) {
    console.error('[YFF moderator/farmers] insert failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ farmer: inserted })
}

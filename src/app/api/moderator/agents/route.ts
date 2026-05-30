import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'
import { normalizePhone } from '@/lib/phone'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const VEHICLE_TYPES = ['bike', 'scooter', 'cycle', 'auto', 'other'] as const
const AVAILABILITY = ['morning', 'afternoon', 'evening', 'weekends'] as const

// One-way fingerprint of an Aadhaar number. We never store or return the plain
// digits — only this hash, used to dedupe and to prove an ID was recorded.
function hashAadhaar(digits: string): string {
  return createHash('sha256').update(digits).digest('hex')
}

// GET — every delivery agent in the moderator's zone, newest first. Never
// returns aadhaar_hash; sends has_id so the UI can show an "ID on file" badge.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone()
  const supabase = svc()

  const { data: rows, error } = await supabase
    .from('delivery_agents')
    .select('id, name, phone, aadhaar_hash, vehicle_type, delivery_area, availability, active, created_at')
    .eq('zone', zone)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[YFF moderator/agents] query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const agents = (rows ?? []).map(({ aadhaar_hash, ...a }) => ({ ...a, has_id: !!aadhaar_hash }))
  return NextResponse.json({ agents })
}

// POST — onboard a new agent.
//   { name, phone, aadhaar?, vehicle_type?, delivery_area?, availability?[] }
export async function POST(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone()
  const supabase = svc()

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })

  const name = String(body.name ?? '').trim().slice(0, 100)
  if (!name) return NextResponse.json({ error: 'Agent name is required.' }, { status: 400 })

  const phone = normalizePhone(body.phone as string | null)
  if (!phone) return NextResponse.json({ error: 'Enter a valid 10-digit phone number.' }, { status: 400 })

  // Aadhaar is optional, but if given it must be 12 digits. Hash it; never keep
  // the plain number.
  let aadhaar_hash: string | null = null
  const aadhaarRaw = String(body.aadhaar ?? '').replace(/\D/g, '')
  if (aadhaarRaw) {
    if (aadhaarRaw.length !== 12) {
      return NextResponse.json({ error: 'Aadhaar must be 12 digits.' }, { status: 400 })
    }
    aadhaar_hash = hashAadhaar(aadhaarRaw)
  }

  const vehicleRaw = String(body.vehicle_type ?? '').trim().toLowerCase()
  const vehicle_type = (VEHICLE_TYPES as readonly string[]).includes(vehicleRaw) ? vehicleRaw : null
  const delivery_area = String(body.delivery_area ?? '').trim().slice(0, 200) || null
  const availability = Array.isArray(body.availability)
    ? body.availability.map((v) => String(v).toLowerCase()).filter((v) => (AVAILABILITY as readonly string[]).includes(v))
    : []

  // One agent per phone per zone.
  const { data: existing } = await supabase
    .from('delivery_agents')
    .select('id')
    .eq('zone', zone)
    .eq('phone', phone)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'An agent with this phone already exists in your zone.' }, { status: 409 })
  }

  const { data: inserted, error } = await supabase
    .from('delivery_agents')
    .insert({ name, phone, aadhaar_hash, vehicle_type, delivery_area, availability, zone, active: true })
    .select('id, name, phone, aadhaar_hash, vehicle_type, delivery_area, availability, active, created_at')
    .single()
  if (error) {
    console.error('[YFF moderator/agents] insert failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const { aadhaar_hash: _h, ...rest } = inserted
  return NextResponse.json({ agent: { ...rest, has_id: !!_h } })
}

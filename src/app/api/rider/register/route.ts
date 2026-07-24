import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { hashPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import { rateLimit } from '@/lib/rate-limit'
import { getPostHogClient } from '@/lib/posthog-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const MAX_BYTES = 8 * 1024 * 1024 // 8MB — ID photos are usually a single page
const VEHICLE_TYPES = new Set(['bike', 'scooter', 'cycle', 'auto', 'other'])

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`rider-reg:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Too many sign-up attempts. Try again in an hour.' },
      { status: 429 },
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return bad('Invalid upload payload.')
  }

  const name = String(form.get('name') ?? '').trim().slice(0, 80)
  const phone = normalizePhone(form.get('phone') as string | null)
  const altPhone = normalizePhone(form.get('alt_phone') as string | null)
  const password = String(form.get('password') ?? '')
  const vehicleType = String(form.get('vehicle_type') ?? '').trim().toLowerCase()
  const vehicleNumber = String(form.get('vehicle_number') ?? '').trim().toUpperCase().slice(0, 20)
  const serviceAreas = String(form.get('service_areas') ?? '').trim().slice(0, 400)
  const rawPincodes = String(form.get('service_pincodes') ?? '')
  const servicePincodes = Array.from(
    new Set(
      rawPincodes
        .split(/[,\s]+/)
        .map((p) => p.trim())
        .filter((p) => /^\d{6}$/.test(p)),
    ),
  ).slice(0, 30)
  const file = form.get('file')

  if (!name) return bad('Please enter your name.')
  if (!phone) return bad('Enter a valid 10-digit phone number.')
  if (password.length < 6) return bad('Password must be at least 6 characters.')
  if (password.length > 128) return bad('Password is too long.')
  if (!VEHICLE_TYPES.has(vehicleType)) return bad('Pick a vehicle type.')
  if (!vehicleNumber) return bad('Enter your vehicle number.')
  if (!serviceAreas) return bad('Enter the areas you can deliver to.')
  if (servicePincodes.length === 0) return bad('Enter at least one 6-digit pincode you cover.')
  if (!(file instanceof File)) return bad('Attach a photo of your ID proof.')
  if (!ALLOWED_TYPES.has(file.type)) return bad('Only JPG, PNG, or WEBP images are allowed.')
  if (file.size === 0) return bad('ID photo is empty.')
  if (file.size > MAX_BYTES) return bad('ID photo is too large. Max 8MB.')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: existing, error: lookupErr } = await supabase
    .from('delivery_boys')
    .select('id, status')
    .eq('phone', phone)
    .maybeSingle()

  if (lookupErr) {
    console.error('[YFF rider-register] lookup failed:', lookupErr.code, lookupErr.message)
    if (lookupErr.message?.includes('does not exist') || lookupErr.code === '42P01') {
      return bad('delivery_boys table is missing. Run scripts/delivery-feature-migration.sql first.', 500)
    }
    return bad(`Database error: ${lookupErr.message}`, 500)
  }
  if (existing) {
    return bad('An application already exists for this phone. Use the same number to log in once activated.', 409)
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${phone}-${Date.now()}.${ext}`

  const { error: upErr } = await supabase.storage
    .from('rider-id-proofs')
    .upload(path, file, { contentType: file.type, upsert: false })

  if (upErr) {
    console.error('[YFF rider-register] id-proof upload failed:', upErr.message)
    return bad('Could not save ID photo. Please try again.', 500)
  }

  const password_hash = hashPassword(password)
  const { data: created, error: insertErr } = await supabase
    .from('delivery_boys')
    .insert({
      name,
      phone,
      alt_phone: altPhone || null,
      password_hash,
      vehicle_type: vehicleType,
      vehicle_number: vehicleNumber,
      id_proof_path: path,
      service_areas: serviceAreas,
      service_pincodes: servicePincodes,
      // Applications are vetted before they go live. A moderator checks the
      // details and the uploaded ID photo, then approves — see
      // /api/moderator/riders. Never insert 'active' here: an active rider can
      // accept a real order, which hands them a buyer's home address.
      status: 'pending_approval',
    })
    .select('id')
    .single()

  if (insertErr || !created) {
    console.error('[YFF rider-register] insert failed:', insertErr?.code, insertErr?.message)
    // Best-effort: drop the just-uploaded photo so we don't leak orphan storage objects
    await supabase.storage.from('rider-id-proofs').remove([path]).catch(() => null)
    return bad(insertErr?.message || 'Could not save your application. Please try again.', 500)
  }

  const posthog = getPostHogClient()
  if (posthog) {
    posthog.capture({
      distinctId: created.id,
      event: 'rider_applied',
      properties: { vehicle_type: vehicleType },
    })
    await posthog.flush()
  }

  return NextResponse.json({ ok: true, status: 'pending_approval' })
}

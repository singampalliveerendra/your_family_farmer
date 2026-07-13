import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import { setRiderSessionCookie } from '@/lib/rider-session'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return bad('Invalid request.')

  const phone = normalizePhone(body.phone)
  const password = String(body.password ?? '')

  if (!phone) return bad('Enter a valid 10-digit phone number.')
  if (!password) return bad('Enter your password.')

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (
    !rateLimit(`rider-login:phone:${phone}`, 5, 10 * 60 * 1000) ||
    !rateLimit(`rider-login:ip:${ip}`, 30, 10 * 60 * 1000)
  ) {
    return bad('Too many login attempts. Please try again in a few minutes.', 429)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: rider, error } = await supabase
    .from('delivery_boys')
    .select('id, name, phone, status, password_hash')
    .eq('phone', phone)
    .maybeSingle()

  if (error) {
    console.error('[YFF rider-login] lookup failed:', error.code, error.message)
    if (error.message?.includes('does not exist') || error.code === '42P01') {
      return bad('delivery_boys table is missing. Run scripts/delivery-feature-migration.sql first.', 500)
    }
    return bad(`Database error: ${error.message}`, 500)
  }
  if (!rider) return bad('No rider account for this number. Sign up first.', 404)

  if (!rider.password_hash || !verifyPassword(password, rider.password_hash)) {
    return bad('Wrong password.', 401)
  }

  // Lifecycle gate. Only an approved (active) rider gets a session — a session
  // is what lets you see and accept real orders, and an accepted order exposes
  // the buyer's name, phone and address. Everything else is turned away with a
  // message that says where it stands.
  if (rider.status === 'suspended') {
    return bad('Your account is suspended. Contact the moderator.', 403)
  }
  if (rider.status === 'rejected') {
    return bad('Your application was not approved. Contact the moderator.', 403)
  }
  if (rider.status !== 'active') {
    return bad('Your application is still being reviewed. We will call you once it is approved.', 403)
  }

  await supabase
    .from('delivery_boys')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', rider.id)

  const res = NextResponse.json({
    ok: true,
    rider: { id: rider.id, name: rider.name, phone: rider.phone },
  })
  try {
    setRiderSessionCookie(res, rider.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Session setup failed.'
    return bad(msg, 500)
  }
  return res
}

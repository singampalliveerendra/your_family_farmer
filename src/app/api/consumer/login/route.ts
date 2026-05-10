import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import { setSessionCookie } from '@/lib/session'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const phone = normalizePhone(body.phone)
  const password = String(body.password ?? '')

  if (!phone) {
    return NextResponse.json({ error: 'Enter a valid 10-digit phone number.' }, { status: 400 })
  }
  if (!password) {
    return NextResponse.json({ error: 'Enter your password.' }, { status: 400 })
  }

  // Brute-force throttle: 5 login attempts per phone per 10 min, plus 30 / IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (
    !rateLimit(`login:phone:${phone}`, 5, 10 * 60 * 1000) ||
    !rateLimit(`login:ip:${ip}`, 30, 10 * 60 * 1000)
  ) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again in a few minutes.' },
      { status: 429 },
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: user } = await supabase
    .from('consumers_auth')
    .select('id, name, phone, password_hash')
    .eq('phone', phone)
    .maybeSingle()

  // Generic message either way — don't reveal whether the phone is registered
  const generic = NextResponse.json(
    { error: 'Incorrect phone or password.' },
    { status: 401 },
  )

  if (!user) return generic
  if (!user.password_hash) return generic
  if (!verifyPassword(password, user.password_hash)) return generic

  await supabase
    .from('consumers_auth')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', user.id)

  const res = NextResponse.json({
    ok: true,
    consumer: { id: user.id, name: user.name, phone: user.phone },
  })
  setSessionCookie(res, user.id)
  return res
}

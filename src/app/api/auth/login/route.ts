import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { reqLang, tr } from '@/lib/serverLang'
import { verifyPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import { setFarmerSessionCookie } from '@/lib/farmer-session'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const lang = reqLang(req)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const phone = normalizePhone((body as { phone?: unknown }).phone as string)
  const password = String((body as { password?: unknown }).password ?? '')

  if (!phone) {
    return NextResponse.json({ error: 'Enter a valid 10-digit phone number.' }, { status: 400 })
  }
  if (password.length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters.' }, { status: 400 })
  }

  // Brute-force throttle: 5 attempts per phone / 30 per ip in 10 min.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (
    !rateLimit(`farmer-login:phone:${phone}`, 5, 10 * 60 * 1000) ||
    !rateLimit(`farmer-login:ip:${ip}`, 30, 10 * 60 * 1000)
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

  const { data: farmers } = await supabase
    .from('farmers')
    .select('id, name, slug, phone, password_hash')
    .or(
      [
        `phone.eq.${phone}`,
        `phone.eq.0${phone}`,
        `phone.eq.+91${phone}`,
        `phone.eq.91${phone}`,
      ].join(','),
    )
    .limit(1)

  const farmer = farmers?.[0]

  const wrongCreds = NextResponse.json(
    { error: tr(lang, 'Wrong phone or password.', 'తప్పు ఫోన్ లేదా పాస్‌వర్డ్.') },
    { status: 401 },
  )

  // No farmer account for this number: point them to registration instead of
  // the misleading "wrong password". `notRegistered` lets the login page show a
  // sign-up prompt.
  if (!farmer) {
    return NextResponse.json(
      {
        error: tr(lang, 'No account found for this number. Please create an account first.', 'ఈ నంబర్‌కు ఖాతా కనబడలేదు. దయచేసి ముందు ఖాతా సృష్టించండి.'),
        notRegistered: true,
      },
      { status: 401 },
    )
  }

  // Farmers without a password must complete OTP login first — we no longer
  // accept the first password they type as their permanent password (that
  // let attackers take over phone numbers they didn't own).
  if (!farmer.password_hash) {
    return NextResponse.json(
      { error: 'Please log in with OTP first to set up your password.' },
      { status: 403 },
    )
  }

  if (!verifyPassword(password, farmer.password_hash)) {
    return wrongCreds
  }

  await supabase.from('farmers').update({ active: true }).eq('id', farmer.id)

  const res = NextResponse.json({ ok: true, farmerId: farmer.id, farmerSlug: farmer.slug })
  try {
    setFarmerSessionCookie(res, farmer.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Session setup failed.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return res
}

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

  console.log('[YFF login] attempt phone=%s', phone)

  const { data: user, error: lookupErr } = await supabase
    .from('consumers_auth')
    .select('id, name, phone, password_hash')
    .eq('phone', phone)
    .maybeSingle()

  if (lookupErr) {
    console.error('[YFF login] lookup failed:', lookupErr.code, lookupErr.message)
    if (
      lookupErr.message?.includes('does not exist')
      || lookupErr.code === '42P01'
    ) {
      return NextResponse.json(
        { error: 'consumers_auth table is missing. Run scripts/consumer-auth-migration.sql in Supabase first.' },
        { status: 500 },
      )
    }
    return NextResponse.json(
      { error: `Database error: ${lookupErr.message}` },
      { status: 500 },
    )
  }

  if (!user) {
    console.log('[YFF login] no account for phone=%s', phone)
    return NextResponse.json(
      { error: 'No account found. Please sign up. / ఖాతా లేదు, సైన్ అప్ చేయండి' },
      { status: 404 },
    )
  }

  if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
    console.log('[YFF login] wrong password phone=%s', phone)
    return NextResponse.json(
      { error: 'Wrong password / తప్పు పాస్‌వర్డ్' },
      { status: 401 },
    )
  }

  await supabase
    .from('consumers_auth')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', user.id)

  console.log('[YFF login] success id=%s', user.id)

  const res = NextResponse.json({
    ok: true,
    consumer: { id: user.id, name: user.name, phone: user.phone },
  })
  try {
    setSessionCookie(res, user.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Session setup failed.'
    console.error('[YFF login] setSessionCookie failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return res
}

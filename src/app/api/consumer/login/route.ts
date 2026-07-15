import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { reqLang, tr } from '@/lib/serverLang'
import { verifyPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import { setSessionCookie } from '@/lib/session'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const lang = reqLang(req)
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

  const { data: user, error: lookupErr } = await supabase
    .from('consumers_auth')
    .select('id, name, phone, password_hash, suspended, suspended_reason')
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

  const wrongCreds = NextResponse.json(
    { error: tr(lang, 'Wrong phone or password.', 'తప్పు ఫోన్ లేదా పాస్‌వర్డ్.') },
    { status: 401 },
  )

  // No account for this number: nudge the user to register instead of the
  // misleading "wrong password" (they simply haven't signed up yet). `notRegistered`
  // lets the UI switch to the Sign-up tab.
  if (!user) {
    return NextResponse.json(
      {
        error: tr(lang, 'No account found for this number. Please sign up first.', 'ఈ నంబర్‌కు ఖాతా కనబడలేదు. దయచేసి ముందు సైన్ అప్ చేయండి.'),
        notRegistered: true,
      },
      { status: 401 },
    )
  }
  if (!user.password_hash || !verifyPassword(password, user.password_hash)) return wrongCreds

  // Suspended accounts can't sign in. Checked only after a correct password so
  // it doesn't leak which numbers are registered. The moderator's reason IS
  // shown to the consumer (per client request) so they know why; legacy
  // suspensions with no recorded reason fall back to the generic message.
  if (user.suspended === true) {
    const reason = (user.suspended_reason as string | null)?.trim() || null
    const error = reason
      ? tr(lang, `Your account has been suspended.\nReason: ${reason}\nPlease contact support.`, `మీ ఖాతా నిలిపివేయబడింది.\nకారణం: ${reason}\nదయచేసి సపోర్ట్‌ను సంప్రదించండి.`)
      : tr(lang, 'Your account has been suspended. Please contact support.', 'మీ ఖాతా నిలిపివేయబడింది. దయచేసి సపోర్ట్‌ను సంప్రదించండి.')
    // `suspended` + `suspendedReason` let the login UI render the same highlighted
    // banner the in-app header uses, instead of a plain inline error line.
    return NextResponse.json({ error, suspended: true, suspendedReason: reason }, { status: 403 })
  }

  await supabase
    .from('consumers_auth')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', user.id)

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

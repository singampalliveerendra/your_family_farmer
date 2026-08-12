import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { reqLang, tr } from '@/lib/serverLang'
import { verifyPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import { setFarmerSessionCookie } from '@/lib/farmer-session'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Shared by BOTH seller login pages. Farmers and aggregators are the same
// `farmers` row and the same `yff_farmer` cookie, so there is one login
// endpoint; `accountType` only decides which surface the caller is standing on,
// so each login page accepts its own kind and points the other kind at theirs.
//
// Omitting accountType keeps the pre-split behaviour (any seller may log in),
// so an older client or a direct API caller is not broken by this.
type SellerType = 'farmer' | 'aggregator'

/** Where each kind of seller logs in and lands. */
const SURFACE: Record<SellerType, { login: string; dashboard: string }> = {
  farmer: { login: '/farmer/login', dashboard: '/farmer/dashboard' },
  aggregator: { login: '/aggregator/login', dashboard: '/aggregator/dashboard' },
}

export async function POST(req: NextRequest) {
  const lang = reqLang(req)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const phone = normalizePhone((body as { phone?: unknown }).phone as string)
  const password = String((body as { password?: unknown }).password ?? '')
  const rawType = (body as { accountType?: unknown }).accountType
  const expectedType: SellerType | null =
    rawType === 'farmer' || rawType === 'aggregator' ? rawType : null

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
    .select('id, name, slug, phone, password_hash, account_type')
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

  // Surface check runs AFTER the password is verified, on purpose: doing it
  // earlier would let anyone probe a phone number and learn whether it belongs
  // to an aggregator without ever knowing the password.
  //
  // account_type is nullable on rows created before aggregators existed, so an
  // absent value means 'farmer' — the column's own default.
  const actualType: SellerType = farmer.account_type === 'aggregator' ? 'aggregator' : 'farmer'
  if (expectedType && actualType !== expectedType) {
    // Correct credentials, wrong door. Say so and link to the right one rather
    // than "wrong phone or password", which would send them round in circles.
    return NextResponse.json(
      {
        error:
          actualType === 'aggregator'
            ? tr(
              lang,
              'This is an aggregator account. Please use the aggregator login.',
              'ఇది సమీకరణదారు ఖాతా. దయచేసి సమీకరణదారు లాగిన్ వాడండి.',
            )
            : tr(
              lang,
              'This is a farmer account. Please use the farmer login.',
              'ఇది రైతు ఖాతా. దయచేసి రైతు లాగిన్ వాడండి.',
            ),
        wrongSurface: true,
        loginPath: SURFACE[actualType].login,
      },
      { status: 403 },
    )
  }

  await supabase.from('farmers').update({ active: true }).eq('id', farmer.id)

  const res = NextResponse.json({
    ok: true,
    farmerId: farmer.id,
    farmerSlug: farmer.slug,
    accountType: actualType,
    dashboard: SURFACE[actualType].dashboard,
  })
  try {
    setFarmerSessionCookie(res, farmer.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Session setup failed.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return res
}

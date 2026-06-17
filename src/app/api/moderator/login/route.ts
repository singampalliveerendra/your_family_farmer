import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { setModeratorSessionCookie } from '@/lib/moderator-session'
import { verifyPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Phone + password login, same shape as the farmer/consumer login. Credentials
// live in the `moderators` table (scrypt-hashed). A moderator can only sign in
// to the zone they're assigned to (region_slug must match this panel's zone).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const phone = normalizePhone((body as { phone?: unknown })?.phone as string)
  const password = String((body as { password?: unknown })?.password ?? '')

  if (!phone) {
    return NextResponse.json({ error: 'Enter a valid 10-digit phone number.' }, { status: 400 })
  }
  if (!password) {
    return NextResponse.json({ error: 'Password required.' }, { status: 400 })
  }

  // Brute-force throttle: 5 per phone / 30 per ip in 15 min.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (
    !rateLimit(`moderator-login:phone:${phone}`, 5, 15 * 60 * 1000) ||
    !rateLimit(`moderator-login:ip:${ip}`, 30, 15 * 60 * 1000)
  ) {
    return NextResponse.json({ error: 'Too many attempts. Wait 15 min.' }, { status: 429 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: mods } = await supabase
    .from('moderators')
    .select('id, phone, password_hash, region_slug, active')
    .or([`phone.eq.${phone}`, `phone.eq.0${phone}`, `phone.eq.+91${phone}`, `phone.eq.91${phone}`].join(','))
    .limit(1)
  const mod = mods?.[0]

  // Anti-enumeration: identical error whether the phone exists or not.
  const wrongCreds = NextResponse.json({ error: 'Wrong phone or password.' }, { status: 401 })

  if (!mod || !mod.password_hash) return wrongCreds
  if (!verifyPassword(password, mod.password_hash)) return wrongCreds
  if (mod.active === false) {
    return NextResponse.json({ error: 'This moderator account is inactive.' }, { status: 403 })
  }

  // No global-zone gate: each moderator's own region_slug is carried in their
  // session, so any zone's moderator can sign in here and stays scoped to
  // their region across the panel.
  const res = NextResponse.json({ ok: true, zone: mod.region_slug })
  setModeratorSessionCookie(res, mod.region_slug, mod.id)
  return res
}

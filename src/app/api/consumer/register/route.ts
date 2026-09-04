import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { hashPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import { setSessionCookie } from '@/lib/session'
import { rateLimit } from '@/lib/rate-limit'
import { isPasswordless } from '@/lib/sellerBuyerLink'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Lightweight anti-abuse: 10 registrations per IP per hour
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`reg:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Too many sign-up attempts. Try again in an hour.' },
      { status: 429 },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const name = String(body.name ?? '').trim().slice(0, 80)
  const phone = normalizePhone(body.phone)
  const password = String(body.password ?? '')

  if (!name) {
    return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  }
  if (!phone) {
    return NextResponse.json({ error: 'Enter a valid 10-digit phone number.' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
  }
  if (password.length > 128) {
    return NextResponse.json({ error: 'Password is too long.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Look the phone up first: a duplicate gets a clean error instead of the raw
  // UNIQUE violation, and a passwordless row gets adopted (see below).
  const { data: existing, error: lookupErr } = await supabase
    .from('consumers_auth')
    .select('id, password_hash')
    .eq('phone', phone)
    .maybeSingle()

  if (lookupErr) {
    console.error('[YFF register] lookup failed:', lookupErr.code, lookupErr.message)
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

  const password_hash = hashPassword(password)

  // A row with no password is one the buyer-view switch created for a seller on
  // this number (src/lib/sellerBuyerLink.ts). Signing up on it SETS the password
  // rather than being refused: the alternative is the dead end where the person
  // is told an account exists and has no password that opens it. Their existing
  // orders stay attached, which is what they would expect.
  if (existing && isPasswordless(existing.password_hash)) {
    const { data: adopted, error: adoptErr } = await supabase
      .from('consumers_auth')
      .update({ name, password_hash })
      .eq('id', existing.id)
      .select('id, name, phone')
      .single()

    if (adoptErr || !adopted) {
      console.error('[YFF register] adopt failed:', adoptErr?.code, adoptErr?.message)
      return NextResponse.json(
        { error: adoptErr?.message || 'Could not create account. Please try again.' },
        { status: 500 },
      )
    }

    const res = NextResponse.json({
      ok: true,
      consumer: { id: adopted.id, name: adopted.name, phone: adopted.phone },
    })
    try {
      setSessionCookie(res, adopted.id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Session setup failed.'
      console.error('[YFF register] setSessionCookie failed:', msg)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
    return res
  }

  if (existing) {
    return NextResponse.json(
      { error: 'An account already exists for this phone. Please log in instead.' },
      { status: 409 },
    )
  }

  const { data: created, error: insertErr } = await supabase
    .from('consumers_auth')
    .insert({ name, phone, password_hash })
    .select('id, name, phone')
    .single()

  if (insertErr || !created) {
    console.error('[YFF register] insert failed:', insertErr?.code, insertErr?.message)
    // Surface the underlying error so we can debug instead of guessing
    return NextResponse.json(
      { error: insertErr?.message || 'Could not create account. Please try again.' },
      { status: 500 },
    )
  }

  const res = NextResponse.json({
    ok: true,
    consumer: { id: created.id, name: created.name, phone: created.phone },
  })
  try {
    setSessionCookie(res, created.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Session setup failed.'
    console.error('[YFF register] setSessionCookie failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return res
}

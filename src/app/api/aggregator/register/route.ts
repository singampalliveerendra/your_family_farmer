import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { hashPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import { setFarmerSessionCookie } from '@/lib/farmer-session'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Step 1 of aggregator registration: create the account.
//
// Deliberately short — organisation, contact person, phone, password, terms. The
// rest of the spec's fields (village, district, operating since, location, four
// uploads, pickup locations) are collected in the dashboard profile editor
// afterwards, because four file uploads on one page over 4G is how you lose a
// signup halfway through, and there is no farmer id to attach uploads to until
// the row exists.
//
// This mirrors /api/auth/register, with two differences:
//   - account_type = 'aggregator'
//   - method is forced to 'organic'; the spec limits aggregators to organic
//     farmers for now, so it is not the form's to decide.
//
// No approval step: an aggregator signs up and sells immediately, same as a
// farmer. farmers.approval_status stays at its 'approved' default.

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`aggregator-reg:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Too many sign-up attempts. Try again in an hour.' },
      { status: 429 },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  const name = String(b.name ?? '').trim().slice(0, 100)
  const contactPerson = String(b.contact_person ?? '').trim().slice(0, 80)
  const phone = normalizePhone(b.phone as string)
  const password = String(b.password ?? '')
  const termsAccepted = b.terms_accepted === true

  if (!name) {
    return NextResponse.json({ error: 'Please enter the organisation name.' }, { status: 400 })
  }
  if (!contactPerson) {
    return NextResponse.json({ error: 'Please enter the name of the person behind the organisation.' }, { status: 400 })
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
  // The terms are the product's trust claim — transparency, passing on benefit,
  // relaying feedback. Registration without them is meaningless, so this is
  // checked server-side rather than trusting the checkbox.
  if (!termsAccepted) {
    return NextResponse.json({ error: 'Please accept the terms to continue.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Phones may have been stored in older formats (0XXX, +91XXX, 91XXX). Check
  // every variant so we don't create a duplicate row for an existing account.
  //
  // Scoped to AGGREGATOR rows only. A farmer who has started collecting from
  // other farmers keeps their farmer account and opens a second, separate
  // aggregator account on the same number — so only an existing aggregator
  // blocks this signup.
  const { data: existing } = await supabase
    .from('farmers')
    .select('id, account_type')
    .or(
      [
        `phone.eq.${phone}`,
        `phone.eq.0${phone}`,
        `phone.eq.+91${phone}`,
        `phone.eq.91${phone}`,
      ].join(','),
    )
    .limit(4)

  const aggregatorExists = (existing ?? []).some((r) => r.account_type === 'aggregator')
  if (aggregatorExists) {
    return NextResponse.json(
      { error: 'An aggregator account already exists for this phone. Please log in.' },
      { status: 409 },
    )
  }

  const rand = Math.random().toString(36).slice(2, 6)
  const slug = `a-${phone}-${rand}`
  const password_hash = hashPassword(password)

  const { data: created, error: insertErr } = await supabase
    .from('farmers')
    .insert({
      phone,
      slug,
      name,
      contact_person: contactPerson,
      account_type: 'aggregator',
      terms_accepted_at: new Date().toISOString(),
      village: '',
      district: '',
      method: 'organic',
      region_slug: 'tadepalligudem',
      // `active` means "this is a real account", not "may sell" — see
      // approval_status above. Login would set it to true regardless.
      active: true,
      password_hash,
    })
    .select('id, slug')
    .single()

  if (insertErr || !created) {
    return NextResponse.json(
      { error: insertErr?.message || 'Could not create account. Please try again.' },
      { status: 500 },
    )
  }

  const res = NextResponse.json({ ok: true, farmerId: created.id, farmerSlug: created.slug })
  try {
    setFarmerSessionCookie(res, created.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Session setup failed.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return res
}

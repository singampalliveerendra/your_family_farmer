import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { hashPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import { setFarmerSessionCookie } from '@/lib/farmer-session'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`farmer-reg:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Too many sign-up attempts. Try again in an hour.' },
      { status: 429 },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const name = String((body as { name?: unknown }).name ?? '').trim().slice(0, 80)
  const phone = normalizePhone((body as { phone?: unknown }).phone as string)
  const password = String((body as { password?: unknown }).password ?? '')

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

  // Phones may have been stored in older formats (0XXX, +91XXX, 91XXX). Check
  // every variant so we don't create a duplicate row for an existing farmer.
  const { data: existing } = await supabase
    .from('farmers')
    .select('id')
    .or(
      [
        `phone.eq.${phone}`,
        `phone.eq.0${phone}`,
        `phone.eq.+91${phone}`,
        `phone.eq.91${phone}`,
      ].join(','),
    )
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: 'An account already exists for this phone. Please log in.' },
      { status: 409 },
    )
  }

  const rand = Math.random().toString(36).slice(2, 6)
  const slug = `f-${phone}-${rand}`
  const password_hash = hashPassword(password)

  const { data: created, error: insertErr } = await supabase
    .from('farmers')
    .insert({
      phone,
      slug,
      name,
      village: '',
      district: '',
      method: 'natural',
      region_slug: 'tadepalligudem',
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

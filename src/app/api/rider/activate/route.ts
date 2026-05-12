import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { normalizePhone } from '@/lib/phone'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// Constant-time string compare to keep activation-code matching safe from
// timing oracles even though codes are short.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return bad('Invalid request.')

  const phone = normalizePhone(body.phone)
  const code = String(body.code ?? '').trim().toUpperCase()

  if (!phone) return bad('Enter a valid 10-digit phone number.')
  if (!code) return bad('Enter your activation code.')

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (
    !rateLimit(`rider-activate:phone:${phone}`, 5, 10 * 60 * 1000) ||
    !rateLimit(`rider-activate:ip:${ip}`, 30, 10 * 60 * 1000)
  ) {
    return bad('Too many attempts. Please try again in a few minutes.', 429)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: rider, error } = await supabase
    .from('delivery_boys')
    .select('id, status, activation_code')
    .eq('phone', phone)
    .maybeSingle()

  if (error) {
    console.error('[YFF rider-activate] lookup failed:', error.code, error.message)
    return bad(`Database error: ${error.message}`, 500)
  }
  if (!rider) return bad('No application found for this number.', 404)

  if (rider.status === 'active') {
    return bad('Your account is already active. Please log in instead.', 409)
  }
  if (rider.status === 'suspended') {
    return bad('Your account is suspended. Contact the owner.', 403)
  }
  if (rider.status === 'pending_approval' || !rider.activation_code) {
    return bad('Your application is not approved yet. Please contact the owner for your code.', 403)
  }

  if (!safeEqual(rider.activation_code.toUpperCase(), code)) {
    return bad('Wrong activation code.', 401)
  }

  const { error: updErr } = await supabase
    .from('delivery_boys')
    .update({
      status: 'active',
      activated_at: new Date().toISOString(),
      activation_code: null,
    })
    .eq('id', rider.id)

  if (updErr) {
    console.error('[YFF rider-activate] update failed:', updErr.message)
    return bad('Could not activate. Please try again.', 500)
  }

  console.log('[YFF rider-activate] activated id=%s', rider.id)
  return NextResponse.json({ ok: true })
}

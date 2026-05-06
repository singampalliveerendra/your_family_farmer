import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const rawPhone: string = body.phone ?? ''
  const digits = rawPhone.replace(/\D/g, '').slice(-10)

  if (digits.length !== 10) {
    return NextResponse.json({ error: 'Enter a valid 10-digit phone number.' }, { status: 400 })
  }

  const fast2smsKey = process.env.FAST2SMS_API_KEY

  if (!fast2smsKey) {
    return NextResponse.json(
      { error: 'SMS service is not configured. Contact support.' },
      { status: 503 },
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Invalidate any existing unused OTPs for this phone
  await supabase
    .from('farmer_otps')
    .update({ used: true })
    .eq('phone', digits)
    .eq('used', false)

  // Generate a 6-digit OTP, store with 10-minute expiry
  const otp = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { error: insertErr } = await supabase
    .from('farmer_otps')
    .insert({ phone: digits, otp, expires_at: expiresAt })

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // Send via Fast2SMS (works with any Indian number)
  const smsRes = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      authorization: fast2smsKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      route: 'q',
      message: `Your YourFamilyFarmer login code: ${otp}. Valid for 10 minutes. Do not share.`,
      numbers: digits,
      flash: 0,
    }),
  })

  if (!smsRes.ok) {
    const errBody = await smsRes.json().catch(() => ({}))
    return NextResponse.json(
      { error: errBody.message ?? 'Failed to send OTP. Please try again.' },
      { status: 502 },
    )
  }

  const smsJson = await smsRes.json().catch(() => ({}))
  if (smsJson.return === false) {
    return NextResponse.json(
      { error: 'OTP service is temporarily unavailable. Please use password login instead.' },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true })
}

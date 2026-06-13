import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { normalizePhone } from '@/lib/phone'
import { rateLimit } from '@/lib/rate-limit'
import { findAccount, USER_TYPES, type UserType } from '@/lib/otp-accounts'
import { sendOtp } from '@/lib/twofactor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Invalid request.', 400)

  const phone = normalizePhone((body as { phone?: unknown }).phone as string)
  const userType = (body as { userType?: unknown }).userType as UserType

  if (!phone) {
    return err('Enter a valid 10-digit phone number. / సరైన 10 అంకెల ఫోన్ నంబర్ నమోదు చేయండి.', 400)
  }
  if (!USER_TYPES.includes(userType)) return err('Invalid request.', 400)

  // Max 3 OTP requests per phone per hour, plus a coarser per-IP cap.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (
    !rateLimit(`otp-send:phone:${phone}`, 3, 60 * 60 * 1000) ||
    !rateLimit(`otp-send:ip:${ip}`, 20, 60 * 60 * 1000)
  ) {
    return err('Too many attempts, try after 1 hour / చాలా ప్రయత్నాలు, 1 గంట తర్వాత ప్రయత్నించండి', 429)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Housekeeping: drop used/old sessions after 24h (best effort).
  await supabase
    .from('otp_sessions')
    .delete()
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  // Only send OTPs to numbers that actually have an account on this surface.
  const account = await findAccount(supabase, userType, phone)
  if (!account) {
    return err('No account found with this number / ఈ నంబర్‌తో ఖాతా లేదు', 404)
  }

  const result = await sendOtp(phone)
  if (!result.ok) {
    console.error('[YFF otp/send] 2factor failed:', result.error)
    return err('Could not send OTP. Please try again. / OTP పంపడం విఫలమైంది, మళ్ళీ ప్రయత్నించండి', 502)
  }

  const { error: insertErr } = await supabase.from('otp_sessions').insert({
    phone,
    session_id: result.sessionId,
    purpose: 'forgot_password',
    user_type: userType,
  })
  if (insertErr) {
    console.error('[YFF otp/send] insert failed:', insertErr.code, insertErr.message)
    if (insertErr.message?.includes('does not exist') || insertErr.code === '42P01') {
      return err('otp_sessions table is missing. Run scripts/otp-sessions-migration.sql in Supabase first.', 500)
    }
    return err('Could not start password reset. Please try again.', 500)
  }

  return NextResponse.json({ ok: true })
}

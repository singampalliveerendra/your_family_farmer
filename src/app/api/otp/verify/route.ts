import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { reqLang, tr } from '@/lib/serverLang'
import { randomBytes } from 'crypto'
import { normalizePhone } from '@/lib/phone'
import { rateLimit } from '@/lib/rate-limit'
import { USER_TYPES, type UserType } from '@/lib/otp-accounts'
import { verifyOtp } from '@/lib/twofactor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: NextRequest) {
  const lang = reqLang(req)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Invalid request.', 400)

  const phone = normalizePhone((body as { phone?: unknown }).phone as string)
  const userType = (body as { userType?: unknown }).userType as UserType
  const otp = String((body as { otp?: unknown }).otp ?? '').replace(/\D/g, '')

  if (!phone) return err('Enter a valid 10-digit phone number.', 400)
  if (!USER_TYPES.includes(userType)) return err('Invalid request.', 400)
  if (otp.length < 4 || otp.length > 8) {
    return err(tr(lang, 'Incorrect OTP, try again', 'తప్పు OTP, మళ్ళీ ప్రయత్నించండి'), 400)
  }

  // Throttle verify attempts so the OTP can't be brute-forced.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (
    !rateLimit(`otp-verify:phone:${phone}`, 10, 60 * 60 * 1000) ||
    !rateLimit(`otp-verify:ip:${ip}`, 40, 60 * 60 * 1000)
  ) {
    return err(tr(lang, 'Too many attempts, try after 1 hour', 'చాలా ప్రయత్నాలు, 1 గంట తర్వాత ప్రయత్నించండి'), 429)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: sessions } = await supabase
    .from('otp_sessions')
    .select('id, session_id, expires_at, used')
    .eq('phone', phone)
    .eq('user_type', userType)
    .eq('purpose', 'forgot_password')
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)

  const session = sessions?.[0]
  if (!session) {
    return err(tr(lang, 'OTP expired, please resend', 'OTP గడువు తీరింది, మళ్ళీ పంపండి'), 400)
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return err(tr(lang, 'OTP expired, please resend', 'OTP గడువు తీరింది, మళ్ళీ పంపండి'), 400)
  }

  const result = await verifyOtp(session.session_id, otp)
  if (!result.ok) {
    return err(tr(lang, 'Incorrect OTP, try again', 'తప్పు OTP, మళ్ళీ ప్రయత్నించండి'), 400)
  }

  // OTP good → burn it and issue a short-lived reset token.
  const resetToken = randomBytes(32).toString('hex')
  const { error: updErr } = await supabase
    .from('otp_sessions')
    .update({
      used: true,
      reset_token: resetToken,
      reset_token_expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
    })
    .eq('id', session.id)

  if (updErr) {
    console.error('[YFF otp/verify] update failed:', updErr.message)
    return err('Something went wrong. Please try again.', 500)
  }

  return NextResponse.json({ ok: true, resetToken })
}

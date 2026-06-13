import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { hashPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import { rateLimit } from '@/lib/rate-limit'
import { updatePasswordHash, USER_TYPES, type UserType } from '@/lib/otp-accounts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// OTP-based password reset for users who are locked out (forgot their password).
// The session-based /api/auth/reset-password is the separate flow for a
// logged-in farmer who knows their current password.
function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Invalid request.', 400)

  const phone = normalizePhone((body as { phone?: unknown }).phone as string)
  const userType = (body as { userType?: unknown }).userType as UserType
  const resetToken = String((body as { resetToken?: unknown }).resetToken ?? '')
  const newPassword = String((body as { newPassword?: unknown }).newPassword ?? '').trim()

  if (!phone) return err('Enter a valid 10-digit phone number.', 400)
  if (!USER_TYPES.includes(userType)) return err('Invalid request.', 400)
  if (!resetToken) return err('Reset link expired, please start again / రీసెట్ గడువు తీరింది, మళ్ళీ ప్రారంభించండి', 400)
  if (newPassword.length < 6) {
    return err('Password must be at least 6 characters / పాస్‌వర్డ్ కనీసం 6 అక్షరాలు ఉండాలి', 400)
  }
  if (newPassword.length > 128) {
    return err('Password is too long / పాస్‌వర్డ్ చాలా పొడవుగా ఉంది', 400)
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`otp-reset:ip:${ip}`, 20, 60 * 60 * 1000)) {
    return err('Too many attempts, try after 1 hour / చాలా ప్రయత్నాలు, 1 గంట తర్వాత ప్రయత్నించండి', 429)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Validate the reset token: must match this phone + surface, and be unexpired.
  const { data: sessions } = await supabase
    .from('otp_sessions')
    .select('id, reset_token_expires_at')
    .eq('phone', phone)
    .eq('user_type', userType)
    .eq('reset_token', resetToken)
    .limit(1)

  const session = sessions?.[0]
  if (!session || !session.reset_token_expires_at) {
    return err('Reset link expired, please start again / రీసెట్ గడువు తీరింది, మళ్ళీ ప్రారంభించండి', 400)
  }
  if (new Date(session.reset_token_expires_at).getTime() < Date.now()) {
    return err('Reset link expired, please start again / రీసెట్ గడువు తీరింది, మళ్ళీ ప్రారంభించండి', 400)
  }

  const updated = await updatePasswordHash(supabase, userType, phone, hashPassword(newPassword))
  if (!updated.ok) {
    if (updated.error) return err(updated.error, 500)
    return err('No account found with this number / ఈ నంబర్‌తో ఖాతా లేదు', 404)
  }

  // Burn the reset token so it can't be reused.
  await supabase
    .from('otp_sessions')
    .update({ reset_token: null, reset_token_expires_at: null })
    .eq('id', session.id)

  return NextResponse.json({ ok: true })
}

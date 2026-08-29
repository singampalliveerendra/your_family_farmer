import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { reqLang, tr } from '@/lib/serverLang'
import { normalizePhone } from '@/lib/phone'
import { rateLimit } from '@/lib/rate-limit'
import { findAccount, USER_TYPES, type UserType } from '@/lib/otp-accounts'
import { generateOtp, hashOtp, OTP_TTL_MS } from '@/lib/otp'
import { sendTemplate } from '@/lib/whatsapp'
import { OTP_TEMPLATE } from '@/lib/notify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: NextRequest) {
  const lang = reqLang(req)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Invalid request.', 400)

  const phone = normalizePhone((body as { phone?: unknown }).phone as string)
  const userType = (body as { userType?: unknown }).userType as UserType

  if (!phone) {
    return err(tr(lang, 'Enter a valid 10-digit phone number.', 'సరైన 10 అంకెల ఫోన్ నంబర్ నమోదు చేయండి.'), 400)
  }
  if (!USER_TYPES.includes(userType)) return err('Invalid request.', 400)

  // Max 3 OTP requests per phone per hour, plus a coarser per-IP cap.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (
    !rateLimit(`otp-send:phone:${phone}`, 3, 60 * 60 * 1000) ||
    !rateLimit(`otp-send:ip:${ip}`, 20, 60 * 60 * 1000)
  ) {
    return err(tr(lang, 'Too many attempts, try after 1 hour', 'చాలా ప్రయత్నాలు, 1 గంట తర్వాత ప్రయత్నించండి'), 429)
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
  //
  // A miss returns the SAME { ok: true } a hit does. Answering "no account
  // found" here turned this endpoint into an account-enumeration oracle: post a
  // number with each of the four userType values and the status code tells you
  // whether it belongs to a farmer, rider, consumer or moderator. /moderator/login
  // already returns an identical error for both cases; this matches it.
  //
  // The caller shows "if that number has an account, the code is on its way"
  // either way, so the UX is unchanged for a real user and blank for a prober.
  const account = await findAccount(supabase, userType, phone)
  if (!account) {
    return NextResponse.json({ ok: true })
  }

  // We mint and store the code ourselves — WhatsApp is only the delivery pipe,
  // so unlike the old 2factor AUTOGEN flow there is no provider-side session.
  // Store the row FIRST: a code the user receives must always be verifiable.
  const code = generateOtp()
  const { data: inserted, error: insertErr } = await supabase
    .from('otp_sessions')
    .insert({
      phone,
      code_hash: hashOtp(phone, code),
      purpose: 'forgot_password',
      user_type: userType,
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    })
    .select('id')
    .maybeSingle()

  if (insertErr || !inserted) {
    console.error('[YFF otp/send] insert failed:', insertErr?.code, insertErr?.message)
    if (insertErr?.message?.includes('code_hash')) {
      return err('otp_sessions is missing code_hash. Run scripts/whatsapp-otp-migration.sql in Supabase first.', 500)
    }
    if (insertErr?.message?.includes('does not exist') || insertErr?.code === '42P01') {
      return err('otp_sessions table is missing. Run scripts/otp-sessions-migration.sql in Supabase first.', 500)
    }
    return err('Could not start password reset. Please try again.', 500)
  }

  const result = await sendTemplate({
    phone,
    template: OTP_TEMPLATE,
    lang,
    body: [code],
    // Fills the template's "Copy code" button so the user can tap instead of
    // retyping — required on Meta authentication templates.
    urlButtonParam: code,
  })

  if (!result.ok) {
    console.error('[YFF otp/send] whatsapp failed:', result.error)
    // Nothing was delivered, so leave no usable code behind.
    await supabase.from('otp_sessions').delete().eq('id', inserted.id)
    return err(
      tr(
        lang,
        'Could not send the OTP on WhatsApp. Check that this number has WhatsApp, then try again.',
        'WhatsApp లో OTP పంపడం విఫలమైంది. ఈ నంబర్‌కు WhatsApp ఉందో చూసి మళ్ళీ ప్రయత్నించండి.',
      ),
      502,
    )
  }

  return NextResponse.json({ ok: true })
}

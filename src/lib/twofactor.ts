// 2factor.in OTP helpers. Uses the AUTOGEN flow: 2factor generates the OTP,
// SMSes it to the user, and hands us back a session id we verify against later.
// Docs: https://2factor.in/v3/

const BASE = 'https://2factor.in/API/V1'

// On the staging/test site (any Vercel Preview build) we must never text a real
// phone — a tester typing a stranger's number would otherwise SMS that stranger.
// Instead the OTP flow is short-circuited: any number "receives" the fixed code
// below, so the login journey is still testable end to end.
const STAGING_OTP = '123456'
const STAGING_SESSION = 'staging-otp-session'

function isStaging(): boolean {
  // YFF_ENV is checked first and VERCEL_ENV only as a fallback: if the staging
  // site is deployed as its own Vercel *production* deployment, VERCEL_ENV is
  // "production" there and this guard silently stops applying — which would SMS
  // a real OTP to whatever number a tester types.
  return process.env.YFF_ENV === 'staging' || process.env.VERCEL_ENV === 'preview'
}

function apiKey(): string | null {
  return process.env.TWOFACTOR_API_KEY || null
}

export type SendResult =
  | { ok: true; sessionId: string }
  | { ok: false; error: string }

/** Sends an auto-generated OTP to the given 10-digit Indian number.
 *
 * Forces SMS delivery via the /SMS/ endpoint. If your 2factor account has a
 * DLT-approved OTP template, set TWOFACTOR_SMS_TEMPLATE to its name and it is
 * appended to the URL (.../AUTOGEN/{template}). Without an approved SMS
 * template, 2factor falls back to delivering the OTP as a VOICE CALL — so this
 * env var is what makes OTPs arrive as a text message. */
export async function sendOtp(phone: string): Promise<SendResult> {
  if (isStaging()) return { ok: true, sessionId: STAGING_SESSION }

  const key = apiKey()
  if (!key) return { ok: false, error: 'OTP service not configured (TWOFACTOR_API_KEY missing).' }

  const template = process.env.TWOFACTOR_SMS_TEMPLATE?.trim()
  const url = template
    ? `${BASE}/${key}/SMS/${encodeURIComponent(phone)}/AUTOGEN/${encodeURIComponent(template)}`
    : `${BASE}/${key}/SMS/${encodeURIComponent(phone)}/AUTOGEN`
  try {
    const r = await fetch(url, { cache: 'no-store' })
    const j = (await r.json().catch(() => null)) as { Status?: string; Details?: string } | null
    if (j?.Status === 'Success' && j?.Details) {
      return { ok: true, sessionId: String(j.Details) }
    }
    return { ok: false, error: j?.Details ? String(j.Details) : 'Failed to send OTP.' }
  } catch {
    return { ok: false, error: 'Could not reach OTP service.' }
  }
}

export type VerifyResult = { ok: boolean; reason?: string }

/** Verifies the user-entered OTP against a 2factor session id. */
export async function verifyOtp(sessionId: string, otp: string): Promise<VerifyResult> {
  if (isStaging()) {
    return otp === STAGING_OTP ? { ok: true } : { ok: false, reason: 'mismatch' }
  }

  const key = apiKey()
  if (!key) return { ok: false, reason: 'not_configured' }

  const url = `${BASE}/${key}/SMS/VERIFY/${encodeURIComponent(sessionId)}/${encodeURIComponent(otp)}`
  try {
    const r = await fetch(url, { cache: 'no-store' })
    const j = (await r.json().catch(() => null)) as { Status?: string; Details?: string } | null
    if (j?.Status === 'Success') return { ok: true }
    return { ok: false, reason: j?.Details ? String(j.Details) : 'mismatch' }
  } catch {
    return { ok: false, reason: 'network' }
  }
}

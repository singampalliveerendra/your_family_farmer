import { createHmac, randomInt, timingSafeEqual } from 'crypto'
import { getSessionSecret } from '@/lib/session'

// OTP generation + verification.
//
// This used to be 2factor.in's job: their AUTOGEN endpoint minted the code,
// texted it, and verified it against a session id we stored. WhatsApp Cloud
// API has no such concept — Meta only delivers a template — so we now own the
// whole lifecycle here.
//
// The plaintext code NEVER reaches the database. We store an HMAC of it keyed
// on SESSION_SECRET and namespaced per phone, so a leaked otp_sessions dump
// cannot be replayed into an account takeover, and the same code sent to two
// different numbers hashes differently.

const OTP_LENGTH = 6
export const OTP_TTL_MS = 10 * 60 * 1000 // matches otp_sessions.expires_at
/** Wrong guesses allowed per issued code before it is burned. */
export const MAX_OTP_ATTEMPTS = 5

// Preview builds never send a real message (see src/lib/whatsapp.ts), so the
// login journey stays testable with a fixed code.
const STAGING_OTP = '123456'

function isStaging(): boolean {
  return process.env.VERCEL_ENV === 'preview'
}

/** Cryptographically random 6-digit code, zero-padded. Math.random() is not
 * acceptable here — it is predictable enough to guess a password reset. */
export function generateOtp(): string {
  if (isStaging()) return STAGING_OTP
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0')
}

/** HMAC of the code, bound to the phone it was issued for. */
export function hashOtp(phone: string, code: string): string {
  return createHmac('sha256', getSessionSecret())
    .update(`otp:${phone}:${code}`)
    .digest('base64url')
}

/** Constant-time comparison of a user-supplied code against a stored hash. */
export function otpMatches(phone: string, code: string, storedHash: string | null): boolean {
  if (!storedHash) return false
  let expected: string
  try {
    expected = hashOtp(phone, code)
  } catch {
    // SESSION_SECRET missing/short — fail closed rather than letting anything through.
    return false
  }
  const a = Buffer.from(expected)
  const b = Buffer.from(storedHash)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

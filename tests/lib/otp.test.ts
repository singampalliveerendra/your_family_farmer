import { describe, it, expect, afterEach } from 'vitest'
import { generateOtp, hashOtp, otpMatches, OTP_TTL_MS, MAX_OTP_ATTEMPTS } from '@/lib/otp'

// We own the whole OTP lifecycle now that Meta only delivers the template.
// The property that matters most: the plaintext code never reaches the
// database, so a leaked otp_sessions dump cannot be replayed into a takeover.

const realVercelEnv = process.env.VERCEL_ENV
afterEach(() => {
  if (realVercelEnv === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = realVercelEnv
  process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef'
})

describe('generateOtp', () => {
  // 200 generated codes are all exactly six digits, including ones that start
  // with a 0.
  it('is always six digits, zero-padded', () => {
    delete process.env.VERCEL_ENV
    for (let i = 0; i < 200; i += 1) {
      expect(generateOtp()).toMatch(/^\d{6}$/)
    }
  })

  // 100 codes come out mostly different, so nobody can guess the next one.
  it('is not constant — a predictable code is a free password reset', () => {
    delete process.env.VERCEL_ENV
    const seen = new Set(Array.from({ length: 100 }, () => generateOtp()))
    expect(seen.size).toBeGreaterThan(50)
  })

  // Preview builds get the fixed 123456 so we can test without a real phone.
  // Production never returns it.
  it('uses the fixed staging code ONLY on preview builds', () => {
    process.env.VERCEL_ENV = 'preview'
    expect(generateOtp()).toBe('123456')
    process.env.VERCEL_ENV = 'production'
    const codes = new Set(Array.from({ length: 50 }, () => generateOtp()))
    expect(codes.has('123456')).toBe(false)
  })
})

describe('hashOtp', () => {
  // The value we store does not contain the code itself, so a leaked table
  // cannot be replayed into a login.
  it('never contains the plaintext code', () => {
    expect(hashOtp('9876543210', '123456')).not.toContain('123456')
  })

  // The same phone and code always hash the same, which is what makes
  // verification possible at all.
  it('is deterministic for the same phone and code', () => {
    expect(hashOtp('9876543210', '123456')).toBe(hashOtp('9876543210', '123456'))
  })

  // The same code for a different phone hashes differently, so a code texted to
  // you is useless on somebody else's number.
  it('is bound to the phone, so one code cannot be replayed on another number', () => {
    expect(hashOtp('9876543210', '123456')).not.toBe(hashOtp('9999999999', '123456'))
  })

  // The output only contains characters that are safe to store and pass around
  // unescaped.
  it('is url-safe base64 — it goes straight into a DB column', () => {
    expect(hashOtp('9876543210', '123456')).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('otpMatches', () => {
  const phone = '9876543210'
  const stored = hashOtp(phone, '123456')

  // Happy path: the right code on the right phone verifies.
  it('accepts the code it was issued for', () => {
    expect(otpMatches(phone, '123456', stored)).toBe(true)
  })

  // A wrong digit or a blank entry fails.
  it('rejects a wrong code', () => {
    expect(otpMatches(phone, '123457', stored)).toBe(false)
    expect(otpMatches(phone, '', stored)).toBe(false)
  })

  // The verification is checked against the phone too, not the code alone.
  it('rejects a code issued for a different phone', () => {
    expect(otpMatches('9999999999', '123456', stored)).toBe(false)
  })

  // If no OTP was ever issued, verification fails rather than waving anyone
  // through on an empty record.
  it('rejects a missing stored hash instead of letting anything through', () => {
    expect(otpMatches(phone, '123456', null)).toBe(false)
    expect(otpMatches(phone, '123456', '')).toBe(false)
  })

  // A truncated or padded stored value returns false instead of crashing the
  // verify route.
  it('rejects a stored hash of the wrong length without throwing', () => {
    expect(otpMatches(phone, '123456', stored.slice(0, 10))).toBe(false)
    expect(otpMatches(phone, '123456', stored + 'AAAA')).toBe(false)
  })

  // With the signing secret missing, every OTP check fails. A misconfigured
  // deploy locks people out rather than letting everybody in.
  it('FAILS CLOSED when SESSION_SECRET is missing', () => {
    delete process.env.SESSION_SECRET
    expect(otpMatches(phone, '123456', stored)).toBe(false)
  })

  // Pins the two constants: a code lives ten minutes and allows five tries.
  it('keeps the documented lifetime and attempt ceiling', () => {
    expect(OTP_TTL_MS).toBe(10 * 60 * 1000)
    expect(MAX_OTP_ATTEMPTS).toBe(5)
  })
})

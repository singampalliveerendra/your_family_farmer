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
  it('is always six digits, zero-padded', () => {
    delete process.env.VERCEL_ENV
    for (let i = 0; i < 200; i += 1) {
      expect(generateOtp()).toMatch(/^\d{6}$/)
    }
  })

  it('is not constant — a predictable code is a free password reset', () => {
    delete process.env.VERCEL_ENV
    const seen = new Set(Array.from({ length: 100 }, () => generateOtp()))
    expect(seen.size).toBeGreaterThan(50)
  })

  it('uses the fixed staging code ONLY on preview builds', () => {
    process.env.VERCEL_ENV = 'preview'
    expect(generateOtp()).toBe('123456')
    process.env.VERCEL_ENV = 'production'
    const codes = new Set(Array.from({ length: 50 }, () => generateOtp()))
    expect(codes.has('123456')).toBe(false)
  })
})

describe('hashOtp', () => {
  it('never contains the plaintext code', () => {
    expect(hashOtp('9876543210', '123456')).not.toContain('123456')
  })

  it('is deterministic for the same phone and code', () => {
    expect(hashOtp('9876543210', '123456')).toBe(hashOtp('9876543210', '123456'))
  })

  it('is bound to the phone, so one code cannot be replayed on another number', () => {
    expect(hashOtp('9876543210', '123456')).not.toBe(hashOtp('9999999999', '123456'))
  })

  it('is url-safe base64 — it goes straight into a DB column', () => {
    expect(hashOtp('9876543210', '123456')).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('otpMatches', () => {
  const phone = '9876543210'
  const stored = hashOtp(phone, '123456')

  it('accepts the code it was issued for', () => {
    expect(otpMatches(phone, '123456', stored)).toBe(true)
  })

  it('rejects a wrong code', () => {
    expect(otpMatches(phone, '123457', stored)).toBe(false)
    expect(otpMatches(phone, '', stored)).toBe(false)
  })

  it('rejects a code issued for a different phone', () => {
    expect(otpMatches('9999999999', '123456', stored)).toBe(false)
  })

  it('rejects a missing stored hash instead of letting anything through', () => {
    expect(otpMatches(phone, '123456', null)).toBe(false)
    expect(otpMatches(phone, '123456', '')).toBe(false)
  })

  it('rejects a stored hash of the wrong length without throwing', () => {
    expect(otpMatches(phone, '123456', stored.slice(0, 10))).toBe(false)
    expect(otpMatches(phone, '123456', stored + 'AAAA')).toBe(false)
  })

  it('FAILS CLOSED when SESSION_SECRET is missing', () => {
    delete process.env.SESSION_SECRET
    expect(otpMatches(phone, '123456', stored)).toBe(false)
  })

  it('keeps the documented lifetime and attempt ceiling', () => {
    expect(OTP_TTL_MS).toBe(10 * 60 * 1000)
    expect(MAX_OTP_ATTEMPTS).toBe(5)
  })
})

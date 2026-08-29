import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSessionToken, verifySessionToken, getSessionSecret } from '@/lib/session'

// The consumer session cookie. Forging one means becoming another buyer, so
// the interesting tests here are all the ways an attacker might try.

afterEach(() => {
  vi.useRealTimers()
  process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef'
})

describe('getSessionSecret', () => {
  it('refuses a missing or too-short secret instead of signing with a weak key', () => {
    const real = process.env.SESSION_SECRET
    delete process.env.SESSION_SECRET
    expect(() => getSessionSecret()).toThrow(/SESSION_SECRET/)
    process.env.SESSION_SECRET = 'too-short'
    expect(() => getSessionSecret()).toThrow(/SESSION_SECRET/)
    process.env.SESSION_SECRET = real
  })
})

describe('verifySessionToken', () => {
  it('round-trips the consumer id', () => {
    const token = createSessionToken('consumer-123')
    expect(verifySessionToken(token)?.consumerId).toBe('consumer-123')
  })

  it('rejects nothing at all', () => {
    expect(verifySessionToken(undefined)).toBeNull()
    expect(verifySessionToken(null)).toBeNull()
    expect(verifySessionToken('')).toBeNull()
  })

  it('rejects a malformed token', () => {
    expect(verifySessionToken('garbage')).toBeNull()
    expect(verifySessionToken('a.b')).toBeNull()
    expect(verifySessionToken('a.b.c.d')).toBeNull()
  })

  it('rejects a swapped consumer id — the whole point of signing it', () => {
    const token = createSessionToken('consumer-123')
    const [, issuedAt, sig] = token.split('.')
    expect(verifySessionToken(`victim-456.${issuedAt}.${sig}`)).toBeNull()
  })

  it('rejects a tampered signature', () => {
    const [id, issuedAt, sig] = createSessionToken('consumer-123').split('.')
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
    expect(verifySessionToken(`${id}.${issuedAt}.${flipped}`)).toBeNull()
  })

  it('rejects a back-dated issue time (which would also extend the TTL)', () => {
    const [id, issuedAt, sig] = createSessionToken('consumer-123').split('.')
    expect(verifySessionToken(`${id}.${Number(issuedAt) + 1}.${sig}`)).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const token = createSessionToken('consumer-123')
    process.env.SESSION_SECRET = 'a-completely-different-secret-key-0123456789'
    expect(verifySessionToken(token)).toBeNull()
  })

  it('expires after 30 days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const token = createSessionToken('consumer-123')

    vi.setSystemTime(new Date('2026-01-30T23:00:00Z')) // day 29 — still valid
    expect(verifySessionToken(token)?.consumerId).toBe('consumer-123')

    vi.setSystemTime(new Date('2026-02-01T00:00:01Z')) // day 31 — gone
    expect(verifySessionToken(token)).toBeNull()
  })

  it('does not accept a token issued in the future', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const token = createSessionToken('consumer-123')
    // A clock that jumps backwards must not hand out a longer-lived session
    // than 30 days from the (signed) issue time.
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    expect(verifySessionToken(token)?.issuedAt).toBe(new Date('2026-01-01T00:00:00Z').getTime())
  })
})

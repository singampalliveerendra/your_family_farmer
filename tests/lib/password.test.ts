import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/password'

describe('hashPassword / verifyPassword', () => {
  // The happy path: hash a password, then verify that same password against
  // the stored hash.
  it('round-trips a password', () => {
    expect(verifyPassword('Kapil@123', hashPassword('Kapil@123'))).toBe(true)
  })

  // Wrong last digit, wrong capitalisation, blank, and a trailing space all
  // fail. Nothing 'close enough' gets in.
  it('rejects the wrong password, including near-misses', () => {
    const stored = hashPassword('Kapil@123')
    expect(verifyPassword('Kapil@124', stored)).toBe(false)
    expect(verifyPassword('kapil@123', stored)).toBe(false)
    expect(verifyPassword('', stored)).toBe(false)
    expect(verifyPassword('Kapil@123 ', stored)).toBe(false)
  })

  // Hashing one password twice gives two different stored values (each has its
  // own random salt), yet both still verify. Stops an attacker spotting which
  // users share a password.
  it('salts per user, so two identical passwords never share a hash', () => {
    const a = hashPassword('same-password')
    const b = hashPassword('same-password')
    expect(a).not.toBe(b)
    expect(verifyPassword('same-password', a)).toBe(true)
    expect(verifyPassword('same-password', b)).toBe(true)
  })

  // Pins the stored format the DB column holds: 32 hex chars of salt, a colon,
  // then 128 hex chars of hash.
  it('stores salt and hash as hex, colon-separated', () => {
    const [salt, hash] = hashPassword('x').split(':')
    expect(salt).toMatch(/^[0-9a-f]{32}$/)
    expect(hash).toMatch(/^[0-9a-f]{128}$/)
  })

  // A damaged or half-written DB value makes the login fail cleanly instead of
  // crashing the login route with a 500.
  it('returns false rather than throwing on a corrupt stored value', () => {
    for (const stored of ['', 'no-colon', ':', 'salt:', ':hash', 'salt:nothex', 'a:b:c']) {
      expect(verifyPassword('anything', stored)).toBe(false)
    }
  })

  // Chopping the stored hash short must not make verification pass: the
  // comparison covers the whole hash, not just its start.
  it('does not accept a short hash that happens to be a prefix', () => {
    const stored = hashPassword('Kapil@123')
    const [salt, hash] = stored.split(':')
    expect(verifyPassword('Kapil@123', `${salt}:${hash.slice(0, 32)}`)).toBe(false)
  })
})

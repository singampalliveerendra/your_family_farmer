import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/password'

describe('hashPassword / verifyPassword', () => {
  it('round-trips a password', () => {
    expect(verifyPassword('Kapil@123', hashPassword('Kapil@123'))).toBe(true)
  })

  it('rejects the wrong password, including near-misses', () => {
    const stored = hashPassword('Kapil@123')
    expect(verifyPassword('Kapil@124', stored)).toBe(false)
    expect(verifyPassword('kapil@123', stored)).toBe(false)
    expect(verifyPassword('', stored)).toBe(false)
    expect(verifyPassword('Kapil@123 ', stored)).toBe(false)
  })

  it('salts per user, so two identical passwords never share a hash', () => {
    const a = hashPassword('same-password')
    const b = hashPassword('same-password')
    expect(a).not.toBe(b)
    expect(verifyPassword('same-password', a)).toBe(true)
    expect(verifyPassword('same-password', b)).toBe(true)
  })

  it('stores salt and hash as hex, colon-separated', () => {
    const [salt, hash] = hashPassword('x').split(':')
    expect(salt).toMatch(/^[0-9a-f]{32}$/)
    expect(hash).toMatch(/^[0-9a-f]{128}$/)
  })

  it('returns false rather than throwing on a corrupt stored value', () => {
    for (const stored of ['', 'no-colon', ':', 'salt:', ':hash', 'salt:nothex', 'a:b:c']) {
      expect(verifyPassword('anything', stored)).toBe(false)
    }
  })

  it('does not accept a short hash that happens to be a prefix', () => {
    const stored = hashPassword('Kapil@123')
    const [salt, hash] = stored.split(':')
    expect(verifyPassword('Kapil@123', `${salt}:${hash.slice(0, 32)}`)).toBe(false)
  })
})

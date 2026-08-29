import { describe, it, expect, vi, afterEach } from 'vitest'
import { createGuestOrderToken, verifyGuestOrderToken } from '@/lib/guest-order-token'

// A guest's one-hour pass to pay for the specific orders they just created.
// It must authorize THOSE ids and nothing else — it is the only credential a
// guest holds, so a token that validates for an arbitrary order id would let
// anyone act on a stranger's checkout.

afterEach(() => vi.useRealTimers())

describe('verifyGuestOrderToken', () => {
  const ids = ['ord-1', 'ord-2']

  it('accepts the ids it was issued for', () => {
    expect(verifyGuestOrderToken(createGuestOrderToken(ids), ids)).toBe(true)
  })

  it('does not care about ordering or case', () => {
    const token = createGuestOrderToken(['ORD-1', 'ord-2'])
    expect(verifyGuestOrderToken(token, ['ord-2', 'Ord-1'])).toBe(true)
  })

  it('rejects a different order id', () => {
    expect(verifyGuestOrderToken(createGuestOrderToken(ids), ['ord-3'])).toBe(false)
  })

  it('rejects a widened or narrowed id set', () => {
    const token = createGuestOrderToken(ids)
    expect(verifyGuestOrderToken(token, [...ids, 'ord-3'])).toBe(false) // smuggling one in
    expect(verifyGuestOrderToken(token, ['ord-1'])).toBe(false) // subset
  })

  it('rejects an empty id list', () => {
    expect(verifyGuestOrderToken(createGuestOrderToken(ids), [])).toBe(false)
  })

  it('rejects a missing or malformed token', () => {
    expect(verifyGuestOrderToken(undefined, ids)).toBe(false)
    expect(verifyGuestOrderToken(null, ids)).toBe(false)
    expect(verifyGuestOrderToken('nonsense', ids)).toBe(false)
    expect(verifyGuestOrderToken('a.b.c', ids)).toBe(false)
    expect(verifyGuestOrderToken(`${Date.now()}.forged`, ids)).toBe(false)
  })

  it('rejects a back-dated timestamp, which is also the TTL extension attack', () => {
    const [issuedAt, sig] = createGuestOrderToken(ids).split('.')
    expect(verifyGuestOrderToken(`${Number(issuedAt) - 1}.${sig}`, ids)).toBe(false)
  })

  it('expires after an hour', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const token = createGuestOrderToken(ids)

    vi.setSystemTime(new Date('2026-01-01T00:59:00Z'))
    expect(verifyGuestOrderToken(token, ids)).toBe(true)

    vi.setSystemTime(new Date('2026-01-01T01:00:01Z'))
    expect(verifyGuestOrderToken(token, ids)).toBe(false)
  })

  it('is not confused by an id containing the join character', () => {
    // canonicalIds joins on ",", so without a length prefix the single id
    // "a,b" would sign identically to the pair ["a", "b"] and one token would
    // authorize both. Unreachable with UUID ids, but closed anyway.
    const token = createGuestOrderToken(['a,b'])
    expect(verifyGuestOrderToken(token, ['a', 'b'])).toBe(false)
    expect(verifyGuestOrderToken(token, ['a,b'])).toBe(true)
  })
})

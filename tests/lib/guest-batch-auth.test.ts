import { describe, it, expect, beforeAll } from 'vitest'
import { authorizeGuestBatches } from '@/lib/guest-batch-auth'
import { createGuestOrderToken } from '@/lib/guest-order-token'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-that-is-definitely-long-enough-32'
})

describe('authorizeGuestBatches', () => {
  // Happy path: one token issued for both orders proves both.
  it('accepts a single token covering the whole batch', () => {
    expect(authorizeGuestBatches([A, B], createGuestOrderToken([A, B]), undefined)).toBe(true)
  })

  // Two separate tokens, one per order, together cover exactly what is being
  // asked for.
  it('accepts per-batch tokens whose union is exactly the batch', () => {
    const batches = [
      { orderIds: [A], token: createGuestOrderToken([A]) },
      { orderIds: [B], token: createGuestOrderToken([B]) },
    ]
    expect(authorizeGuestBatches([A, B], undefined, batches)).toBe(true)
  })

  // A token for order A does not drag order B in with it.
  // The point of the union check: a token proves nothing about ids it was not
  // issued for, so an unproven id must not ride along with a proven one.
  it('rejects an id nobody proved', () => {
    const batches = [{ orderIds: [A], token: createGuestOrderToken([A]) }]
    expect(authorizeGuestBatches([A, B], undefined, batches)).toBe(false)
  })

  // Presenting a token for an order that is not part of this request is
  // refused, so a stranger's order cannot be attached to yours.
  it('rejects extra ids smuggled in from another checkout', () => {
    const batches = [
      { orderIds: [A], token: createGuestOrderToken([A]) },
      { orderIds: [C], token: createGuestOrderToken([C]) },
    ]
    expect(authorizeGuestBatches([A], undefined, batches)).toBe(false)
  })

  // A token created for order A does not unlock order B.
  it('rejects a token presented against ids it was not issued for', () => {
    const batches = [{ orderIds: [B], token: createGuestOrderToken([A]) }]
    expect(authorizeGuestBatches([B], undefined, batches)).toBe(false)
  })

  // Proving one of two orders is not enough to act on both.
  it('rejects a single token that covers only part of the batch', () => {
    expect(authorizeGuestBatches([A, B], createGuestOrderToken([A]), undefined)).toBe(false)
  })

  // Empty lists, a missing token and a missing id list are all refused rather
  // than defaulting to allow.
  it('rejects empty and malformed input', () => {
    expect(authorizeGuestBatches([], createGuestOrderToken([A]), undefined)).toBe(false)
    expect(authorizeGuestBatches([A], undefined, undefined)).toBe(false)
    expect(authorizeGuestBatches([A], undefined, [])).toBe(false)
    expect(authorizeGuestBatches([A], undefined, [{ orderIds: [A] }])).toBe(false)
    expect(authorizeGuestBatches([A], undefined, [{ token: 'x' }])).toBe(false)
  })

  // Upper and lower case UUIDs are the same order, matching how the token is
  // built.
  it('is case-insensitive about uuid casing, as the token itself is', () => {
    const batches = [{ orderIds: [A.toUpperCase()], token: createGuestOrderToken([A]) }]
    expect(authorizeGuestBatches([A], undefined, batches)).toBe(true)
  })
})

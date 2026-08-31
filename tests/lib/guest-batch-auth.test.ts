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
  it('accepts a single token covering the whole batch', () => {
    expect(authorizeGuestBatches([A, B], createGuestOrderToken([A, B]), undefined)).toBe(true)
  })

  it('accepts per-batch tokens whose union is exactly the batch', () => {
    const batches = [
      { orderIds: [A], token: createGuestOrderToken([A]) },
      { orderIds: [B], token: createGuestOrderToken([B]) },
    ]
    expect(authorizeGuestBatches([A, B], undefined, batches)).toBe(true)
  })

  // The point of the union check: a token proves nothing about ids it was not
  // issued for, so an unproven id must not ride along with a proven one.
  it('rejects an id nobody proved', () => {
    const batches = [{ orderIds: [A], token: createGuestOrderToken([A]) }]
    expect(authorizeGuestBatches([A, B], undefined, batches)).toBe(false)
  })

  it('rejects extra ids smuggled in from another checkout', () => {
    const batches = [
      { orderIds: [A], token: createGuestOrderToken([A]) },
      { orderIds: [C], token: createGuestOrderToken([C]) },
    ]
    expect(authorizeGuestBatches([A], undefined, batches)).toBe(false)
  })

  it('rejects a token presented against ids it was not issued for', () => {
    const batches = [{ orderIds: [B], token: createGuestOrderToken([A]) }]
    expect(authorizeGuestBatches([B], undefined, batches)).toBe(false)
  })

  it('rejects a single token that covers only part of the batch', () => {
    expect(authorizeGuestBatches([A, B], createGuestOrderToken([A]), undefined)).toBe(false)
  })

  it('rejects empty and malformed input', () => {
    expect(authorizeGuestBatches([], createGuestOrderToken([A]), undefined)).toBe(false)
    expect(authorizeGuestBatches([A], undefined, undefined)).toBe(false)
    expect(authorizeGuestBatches([A], undefined, [])).toBe(false)
    expect(authorizeGuestBatches([A], undefined, [{ orderIds: [A] }])).toBe(false)
    expect(authorizeGuestBatches([A], undefined, [{ token: 'x' }])).toBe(false)
  })

  it('is case-insensitive about uuid casing, as the token itself is', () => {
    const batches = [{ orderIds: [A.toUpperCase()], token: createGuestOrderToken([A]) }]
    expect(authorizeGuestBatches([A], undefined, batches)).toBe(true)
  })
})

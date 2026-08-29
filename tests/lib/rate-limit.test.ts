import { describe, it, expect, vi, afterEach } from 'vitest'
import { rateLimit } from '@/lib/rate-limit'

// The brute-force brake on login and OTP. It is per-process and in-memory —
// a known limitation, documented in the module — so these tests pin the
// behaviour we DO rely on, not a distributed guarantee we don't have.

afterEach(() => vi.useRealTimers())

// Buckets are module-level state, so every test needs its own key.
let n = 0
const key = () => `test-key-${(n += 1)}`

describe('rateLimit', () => {
  it('allows exactly `max` attempts, then blocks', () => {
    const k = key()
    expect(rateLimit(k, 3, 60_000)).toBe(true)
    expect(rateLimit(k, 3, 60_000)).toBe(true)
    expect(rateLimit(k, 3, 60_000)).toBe(true)
    expect(rateLimit(k, 3, 60_000)).toBe(false)
    expect(rateLimit(k, 3, 60_000)).toBe(false)
  })

  it('keys are independent — one attacker cannot lock out everyone', () => {
    const a = key()
    const b = key()
    expect(rateLimit(a, 1, 60_000)).toBe(true)
    expect(rateLimit(a, 1, 60_000)).toBe(false)
    expect(rateLimit(b, 1, 60_000)).toBe(true)
  })

  it('reopens once the window has passed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const k = key()
    expect(rateLimit(k, 2, 60_000)).toBe(true)
    expect(rateLimit(k, 2, 60_000)).toBe(true)
    expect(rateLimit(k, 2, 60_000)).toBe(false)

    vi.setSystemTime(new Date('2026-01-01T00:00:59Z')) // still inside the window
    expect(rateLimit(k, 2, 60_000)).toBe(false)

    vi.setSystemTime(new Date('2026-01-01T00:01:01Z')) // window rolled over
    expect(rateLimit(k, 2, 60_000)).toBe(true)
  })
})

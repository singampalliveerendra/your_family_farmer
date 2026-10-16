import { describe, it, expect, beforeEach } from 'vitest'
import { fetchPendingOrderCount, forgetPendingOrderCount } from '@/lib/pendingOrderCount'

describe('fetchPendingOrderCount', () => {
  beforeEach(() => forgetPendingOrderCount())

  it('shares one request between badges asking at the same time', async () => {
    let calls = 0
    const fetcher = async () => { calls += 1; return 3 }
    const [a, b] = await Promise.all([fetchPendingOrderCount(fetcher, 1000), fetchPendingOrderCount(fetcher, 1500)])
    expect([a, b, calls]).toEqual([3, 3, 1])
  })

  it('asks again once the window has passed, or after sign-in changes', async () => {
    let calls = 0
    const fetcher = async () => { calls += 1; return calls }
    await fetchPendingOrderCount(fetcher, 0)
    expect(await fetchPendingOrderCount(fetcher, 20_000)).toBe(2)
    forgetPendingOrderCount()
    expect(await fetchPendingOrderCount(fetcher, 20_001)).toBe(3)
  })

  it('reads a failed request as 0', async () => {
    expect(await fetchPendingOrderCount(async () => { throw new Error('offline') }, 0)).toBe(0)
  })
})

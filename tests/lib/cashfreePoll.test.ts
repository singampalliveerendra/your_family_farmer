import { describe, it, expect } from 'vitest'
import { nextPollStep, ACTIVE_GRACE_MS, IN_FLIGHT_WAIT_MS } from '@/lib/cashfreePoll'

describe('nextPollStep', () => {
  // USE: YFF-20261029-0383 — checkout closed while the buyer was in PhonePe.
  // The old code abandoned on the first "not paid"; now it keeps asking.
  it('keeps asking while a UPI payment is in flight', () => {
    expect(nextPollStep({ inFlight: true, orderStatus: 'ACTIVE' }, 0)).toBe('wait')
    expect(nextPollStep({ inFlight: true, orderStatus: 'ACTIVE' }, IN_FLIGHT_WAIT_MS - 1)).toBe('wait')
  })

  // USE: the bank is slow. Stop asking, but do NOT abandon — that's what
  // 'processing' means to the Cart (no cancel, "check My Orders" toast).
  it('gives up asking, without abandoning, if still in flight after the wait', () => {
    expect(nextPollStep({ inFlight: true, orderStatus: 'ACTIVE' }, IN_FLIGHT_WAIT_MS)).toBe('processing')
  })

  // USE: the attempt may not be registered at Cashfree the instant the app
  // switches, so an open order with no attempt gets a short grace period.
  it('waits briefly on an open order with no attempt yet, then abandons', () => {
    expect(nextPollStep({ inFlight: false, orderStatus: 'ACTIVE' }, 0)).toBe('wait')
    expect(nextPollStep({ inFlight: false, orderStatus: 'ACTIVE' }, ACTIVE_GRACE_MS)).toBe('unpaid')
  })

  // USE: buyer closed the checkout / payment failed and Cashfree has closed the
  // order — abandon straight away so the stock is released.
  it('abandons at once when Cashfree has closed the order', () => {
    expect(nextPollStep({ inFlight: false, orderStatus: 'TERMINATED' }, 0)).toBe('unpaid')
    expect(nextPollStep({ inFlight: false, orderStatus: 'EXPIRED' }, 0)).toBe('unpaid')
    expect(nextPollStep({ inFlight: false, orderStatus: null }, 0)).toBe('unpaid')
  })
})

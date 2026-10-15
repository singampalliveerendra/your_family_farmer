import { describe, it, expect } from 'vitest'
import { canGiveFeedback, isOrderCompleted } from '@/lib/orderFeedback'

// A buyer can rate and review an order in ANY status, but only a completed
// order's rating is public and counts toward the produce's star average.

const base = { produce_listing_id: 'listing-1' }

describe('canGiveFeedback', () => {
  // USE: buyers asked to rate an order at every stage, not only once it is
  // resolved — a pending, shipped or cancelled order must still show Rate.
  it('allows feedback in every order status', () => {
    const orders = [
      { ...base, status: 'pending' },
      { ...base, status: 'approved' },
      { ...base, status: 'approved', delivery_status: 'out_for_delivery' },
      { ...base, status: 'approved', delivery_status: 'delivered' },
      { ...base, status: 'approved', collected_at: '2026-10-15T00:00:00Z' },
      { ...base, status: 'declined' },
      { ...base, status: 'cancelled' },
    ]
    for (const o of orders) expect(canGiveFeedback(o)).toBe(true)
  })

  it('refuses an order with no produce to rate', () => {
    expect(canGiveFeedback({ status: 'approved', produce_listing_id: null })).toBe(false)
  })
})

describe('isOrderCompleted (decides public vs private)', () => {
  it('is public once delivered, picked up or received', () => {
    expect(isOrderCompleted({ status: 'approved', delivery_status: 'delivered' })).toBe(true)
    expect(isOrderCompleted({ status: 'approved', collected_at: 'x' })).toBe(true)
    expect(isOrderCompleted({ status: 'approved', received_at: 'x' })).toBe(true)
    expect(isOrderCompleted({ status: 'approved', delivered_at: 'x' })).toBe(true)
  })

  // USE: a buyer who never got the produce must not move its public rating.
  it('keeps pending, in-transit, declined and cancelled feedback private', () => {
    expect(isOrderCompleted({ status: 'pending' })).toBe(false)
    expect(isOrderCompleted({ status: 'approved', delivery_status: 'out_for_delivery' })).toBe(false)
    expect(isOrderCompleted({ status: 'declined', delivered_at: 'x' })).toBe(false)
    expect(isOrderCompleted({ status: 'cancelled', delivery_status: 'delivered' })).toBe(false)
  })
})

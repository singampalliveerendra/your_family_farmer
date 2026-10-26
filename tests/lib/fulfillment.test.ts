import { describe, it, expect } from 'vitest'
import {
  normalizeDeliveryMode, canPickup, canDeliver,
  effectiveFulfillment, lineFulfillment, isException,
} from '@/lib/fulfillment'

describe('normalizeDeliveryMode', () => {
  // The cart has always read a missing mode as 'both'.
  it('keeps known modes and reads anything else as both', () => {
    expect(normalizeDeliveryMode('pickup')).toBe('pickup')
    expect(normalizeDeliveryMode('courier')).toBe('courier')
    expect(normalizeDeliveryMode('both')).toBe('both')
    expect(normalizeDeliveryMode(null)).toBe('both')
    expect(normalizeDeliveryMode('weird')).toBe('both')
  })
})

describe('canPickup / canDeliver', () => {
  it('matches the farmer setting', () => {
    expect([canPickup('pickup'), canDeliver('pickup')]).toEqual([true, false])
    expect([canPickup('courier'), canDeliver('courier')]).toEqual([false, true])
    expect([canPickup('both'), canDeliver('both')]).toEqual([true, true])
  })
})

describe('effectiveFulfillment', () => {
  it('keeps the buyer choice when at least one line can follow it', () => {
    expect(effectiveFulfillment('home_delivery', ['pickup', 'both'])).toBe('home_delivery')
    expect(effectiveFulfillment('self_pickup', ['courier', 'both'])).toBe('self_pickup')
  })

  // Home delivery on an all-pickup-only cart is meaningless — flip it.
  it('flips when nothing can follow the choice', () => {
    expect(effectiveFulfillment('home_delivery', ['pickup', 'pickup'])).toBe('self_pickup')
    expect(effectiveFulfillment('self_pickup', ['courier'])).toBe('home_delivery')
  })

  it('keeps the choice on an empty cart', () => {
    expect(effectiveFulfillment('home_delivery', [])).toBe('home_delivery')
  })
})

describe('lineFulfillment / isException', () => {
  it('follows the order choice when the produce allows it', () => {
    expect(lineFulfillment('home_delivery', 'both')).toBe('home_delivery')
    expect(lineFulfillment('home_delivery', 'courier')).toBe('home_delivery')
    expect(lineFulfillment('self_pickup', 'pickup')).toBe('self_pickup')
    expect(isException('home_delivery', 'both')).toBe(false)
  })

  // The two highlighted cases in the cart.
  it('falls back for pickup-only under delivery and delivery-only under pickup', () => {
    expect(lineFulfillment('home_delivery', 'pickup')).toBe('self_pickup')
    expect(isException('home_delivery', 'pickup')).toBe(true)
    expect(lineFulfillment('self_pickup', 'courier')).toBe('home_delivery')
    expect(isException('self_pickup', 'courier')).toBe(true)
  })
})

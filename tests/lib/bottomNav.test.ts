import { describe, it, expect } from 'vitest'
import {
  navKindFor, activeBuyerTab, activeSellerTab, sellerTabHref,
  cartSignature, cartNeedsAttention, badgeText,
} from '@/lib/bottomNav'

describe('navKindFor', () => {
  it('gives the buyer bar on the buyer list pages and region pages', () => {
    for (const p of ['/consumer', '/consumer/', '/consumer/farmers', '/consumer/orders', '/consumer/orders/history', '/consumer/profile', '/consumer/settings', '/consumer/intents', '/consumer/complaints', '/region/tadepalligudem']) {
      expect(navKindFor(p)).toBe('buyer')
    }
  })

  it('gives the seller bar on the dashboards and their pages', () => {
    for (const p of ['/farmer/dashboard', '/farmer/dashboard/orders', '/aggregator/dashboard', '/aggregator/farmers', '/farmer/complaints']) {
      expect(navKindFor(p)).toBe('seller')
    }
  })

  // These pages have their own fixed bottom buttons.
  it('stays off pages with their own bottom bar, and everywhere else', () => {
    for (const p of ['/consumer/cart', '/consumer/produce/abc', '/consumer/harvest/abc', '/consumer/orders/abc', '/farmer/ramesh', '/farmer/login', '/home', '/', '/moderator', '/rider', null]) {
      expect(navKindFor(p)).toBeNull()
    }
  })
})

describe('activeBuyerTab', () => {
  it('lights the tab for each page', () => {
    expect(activeBuyerTab('/consumer')).toBe('home')
    expect(activeBuyerTab('/consumer/farmers')).toBe('farmers')
    expect(activeBuyerTab('/region/x')).toBe('farmers')
    expect(activeBuyerTab('/consumer/cart')).toBe('cart')
    expect(activeBuyerTab('/consumer/orders/history')).toBe('orders')
    expect(activeBuyerTab('/consumer/settings')).toBe('settings')
    expect(activeBuyerTab('/consumer/profile')).toBe('settings')
    expect(activeBuyerTab('/consumer/intents')).toBe('settings')
    expect(activeBuyerTab('/consumer/complaints')).toBe('settings')
  })
})

describe('activeSellerTab', () => {
  it('reads the open sheet on the dashboard', () => {
    expect(activeSellerTab('/farmer/dashboard')).toBe('home')
    expect(activeSellerTab('/aggregator/dashboard', 'produce')).toBe('produce')
    expect(activeSellerTab('/farmer/dashboard', 'settings')).toBe('settings')
    expect(activeSellerTab('/farmer/dashboard/orders')).toBe('orders')
    expect(activeSellerTab('/aggregator/farmers')).toBeNull()
  })
})

describe('sellerTabHref', () => {
  it('follows the role, but orders stay on the shared page', () => {
    expect(sellerTabHref('farmer', 'home')).toBe('/farmer/dashboard')
    expect(sellerTabHref('aggregator', 'home')).toBe('/aggregator/dashboard')
    expect(sellerTabHref('aggregator', 'orders')).toBe('/farmer/dashboard/orders')
    expect(sellerTabHref('aggregator', 'produce')).toBe('/aggregator/dashboard?view=produce')
    expect(sellerTabHref('farmer', 'settings')).toBe('/farmer/dashboard?view=settings')
  })
})

describe('cart attention', () => {
  it('signature ignores key order but not quantity', () => {
    expect(cartSignature({ a: { qty: 1 }, b: { qty: 2 } })).toBe(cartSignature({ b: { qty: 2 }, a: { qty: 1 } }))
    expect(cartSignature({ a: { qty: 1 } })).not.toBe(cartSignature({ a: { qty: 2 } }))
  })

  it('glows for a cart not yet opened, stops once opened, restarts on a new add', () => {
    const one = cartSignature({ a: { qty: 1 } })
    expect(cartNeedsAttention(one, null)).toBe(true)
    expect(cartNeedsAttention(one, one)).toBe(false)
    expect(cartNeedsAttention(cartSignature({ a: { qty: 1 }, b: { qty: 1 } }), one)).toBe(true)
  })

  it('never glows for an empty cart', () => {
    expect(cartNeedsAttention(cartSignature({}), null)).toBe(false)
  })

  it('badge caps at 9+', () => {
    expect(badgeText(3)).toBe('3')
    expect(badgeText(12)).toBe('9+')
  })
})

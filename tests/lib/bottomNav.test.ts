import { describe, it, expect } from 'vitest'
import {
  navKindFor, activeBuyerTab, activeSellerTab, sellerTabHref,
  cartSignature, cartNeedsAttention, badgeText,
} from '@/lib/bottomNav'

describe('Orders tab covers My bulk orders (2026-11-06)', () => {
  it('lights Orders on the aggregator purchases page', () => {
    expect(activeSellerTab('/aggregator/purchases')).toBe('orders')
    expect(activeSellerTab('/farmer/dashboard/orders')).toBe('orders')
  })
})

describe('navKindFor', () => {
  it('gives the buyer bar on every buyer page, detail pages included', () => {
    for (const p of [
      '/consumer', '/consumer/', '/consumer/farmers', '/consumer/orders', '/consumer/orders/history', '/consumer/profile',
      '/consumer/settings', '/consumer/intents', '/consumer/complaints', '/region/tadepalligudem',
      '/consumer/cart', '/consumer/produce/abc', '/consumer/harvest/abc', '/consumer/orders/abc',
      '/farmer/ramesh', '/buyer-protection',
    ]) {
      expect(navKindFor(p)).toBe('buyer')
    }
  })

  it('gives the seller bar on the dashboards and their pages', () => {
    for (const p of ['/farmer/dashboard', '/farmer/dashboard/orders', '/aggregator/dashboard', '/aggregator/farmers', '/farmer/complaints']) {
      expect(navKindFor(p)).toBe('seller')
    }
  })

  it('gives the seller bar on every aggregator work page too (2026-11-05)', () => {
    for (const p of ['/aggregator/market', '/aggregator/market/abc', '/aggregator/purchases', '/aggregator/subscription', '/aggregator/subscription/receipt/abc']) {
      expect(navKindFor(p)).toBe('seller')
    }
  })

  it('every buyer or seller page in the app gets a bar', () => {
    // Walks src/app: anything that is not deliberately bar-less must get one.
    const fs = require('node:fs') as typeof import('node:fs')
    const path = require('node:path') as typeof import('node:path')
    const pages: string[] = []
    const walk = (d: string) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walk(f); else if (n === 'page.tsx') pages.push(f) } }
    walk(path.join(process.cwd(), 'src/app'))
    const routes = pages.map((f) => f.slice(path.join(process.cwd(), 'src/app').length).replace(/[\\/]page\.tsx$/, '').replace(/\[[^\]]+\]/g, 'x') || '/')
    const NO_BAR = /^\/($|home|moderator|rider|admin|aggregator$|farmer$|(farmer|aggregator)\/(login|signup))/
    expect(routes.length).toBeGreaterThan(50)
    const missing = routes.filter((r) => !NO_BAR.test(r) && navKindFor(r) === null)
    expect(missing).toEqual([])
  })

  it('stays off the chooser, login/signup, and the moderator/rider/admin areas', () => {
    for (const p of ['/farmer', '/farmer/login', '/farmer/signup', '/aggregator/login', '/aggregator/signup', '/home', '/', '/moderator', '/moderator/farmers', '/rider', '/admin', null]) {
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

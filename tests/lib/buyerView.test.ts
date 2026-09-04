import { describe, it, expect } from 'vitest'
import {
  BUYER_VIEW_COOKIE,
  parseBuyerView,
  sellerDashboardPath,
  showsBuyerViewBar,
} from '@/lib/buyerView'

// The buyer-view marker says "this shopper is really a seller who switched
// across". Two things read it: the amber bar that carries them back to their
// dashboard, and farmer logout, which uses it to take the borrowed buyer
// session down on a shared phone. Both go wrong quietly if the parsing or the
// path rules drift, so they are pinned here.

describe('parseBuyerView', () => {
  // USE: the two seller surfaces, the only values the API ever writes.
  it('accepts the two seller roles', () => {
    expect(parseBuyerView('farmer')).toBe('farmer')
    expect(parseBuyerView('aggregator')).toBe('aggregator')
  })

  // USE: the cookie is client-writable by design (the bar must render without a
  // round-trip), so anything at all can arrive in it. Nothing but the two known
  // values may pass — and it grants no access either way: the buyer session is
  // a separate HTTP-only, HMAC-signed cookie.
  it('rejects anything else, including junk a user could type in', () => {
    expect(parseBuyerView('moderator')).toBeNull()
    expect(parseBuyerView('FARMER')).toBeNull()
    expect(parseBuyerView('')).toBeNull()
    expect(parseBuyerView(undefined)).toBeNull()
    expect(parseBuyerView(null)).toBeNull()
  })

  // USE: the name is shared between the API route (which sets the cookie) and
  // the browser helpers (which read it). A rename on one side only would leave
  // the bar permanently invisible.
  it('keeps the cookie name stable', () => {
    expect(BUYER_VIEW_COOKIE).toBe('yff_buyer_view')
  })
})

describe('sellerDashboardPath', () => {
  // USE: an aggregator sent to /farmer/dashboard gets bounced to their own URL;
  // the round trip is visible on 4G and reads as a broken link.
  it('sends each seller back to their own dashboard', () => {
    expect(sellerDashboardPath('farmer')).toBe('/farmer/dashboard')
    expect(sellerDashboardPath('aggregator')).toBe('/aggregator/dashboard')
  })
})

describe('showsBuyerViewBar', () => {
  // USE: the bar has to survive wandering deeper into the shop — browse, a
  // produce page, the cart — because that is exactly when a seller loses track
  // of which side they are on.
  it('shows on every buyer page, not just the one they switched to', () => {
    expect(showsBuyerViewBar('/consumer')).toBe(true)
    expect(showsBuyerViewBar('/consumer/cart')).toBe(true)
    expect(showsBuyerViewBar('/consumer/produce/abc-123')).toBe(true)
    expect(showsBuyerViewBar('/consumer/orders')).toBe(true)
    expect(showsBuyerViewBar('/region/tadepalligudem')).toBe(true)
  })

  // USE: "preview my shop" lands here. It is a buyer page that happens to live
  // under /farmer, and it is the single page where the seller most needs to be
  // told they are looking at the buyer's version.
  it('shows on a public farmer profile — the preview destination', () => {
    expect(showsBuyerViewBar('/farmer/ravi-kumar')).toBe(true)
  })

  // USE: /farmer/dashboard sorts under the same first segment as the profile
  // above. Getting this order wrong puts a "go to your dashboard" bar on the
  // dashboard.
  it('never shows on the seller surfaces', () => {
    expect(showsBuyerViewBar('/farmer/dashboard')).toBe(false)
    expect(showsBuyerViewBar('/farmer/dashboard/orders')).toBe(false)
    expect(showsBuyerViewBar('/farmer/login')).toBe(false)
    expect(showsBuyerViewBar('/farmer/signup')).toBe(false)
    expect(showsBuyerViewBar('/farmer/complaints')).toBe(false)
    expect(showsBuyerViewBar('/aggregator/dashboard')).toBe(false)
    expect(showsBuyerViewBar('/aggregator/farmers')).toBe(false)
  })

  // USE: the bar is mounted in the ROOT layout, so it is evaluated on every
  // page in the app — including staff and rider surfaces that have nothing to
  // do with either role.
  it('stays off the staff, rider and landing surfaces', () => {
    expect(showsBuyerViewBar('/moderator/orders')).toBe(false)
    expect(showsBuyerViewBar('/rider/dashboard')).toBe(false)
    expect(showsBuyerViewBar('/admin/login')).toBe(false)
    expect(showsBuyerViewBar('/home')).toBe(false)
    expect(showsBuyerViewBar('/')).toBe(false)
  })

  // USE: usePathname is typed as a string but is null before hydration in some
  // Next entry points; a crash in the root layout would take every page with it.
  it('handles a missing pathname', () => {
    expect(showsBuyerViewBar(null)).toBe(false)
    expect(showsBuyerViewBar(undefined)).toBe(false)
    expect(showsBuyerViewBar('')).toBe(false)
  })

  // USE: prefix matching must respect segment boundaries, or an unrelated route
  // that merely starts with the same letters inherits the bar.
  it('matches whole path segments, not letter prefixes', () => {
    expect(showsBuyerViewBar('/consumers-report')).toBe(false)
    expect(showsBuyerViewBar('/regional-office')).toBe(false)
  })
})

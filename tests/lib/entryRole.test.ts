import { describe, it, expect } from 'vitest'
import { entryDestination, ENTRY_COOKIE, SELLER_LOGIN } from '@/lib/entryRole'

// `/` is the installed PWA's start_url, so entryDestination runs on EVERY
// launch of the app. Sending sellers to the login page unconditionally is what
// made the app demand a password every single time it was opened — even though
// the yff_farmer cookie is good for 30 days. For a farmer on a slow 4G phone
// that was the difference between using the app and deleting it.

describe('entryDestination', () => {
  // USE: a signed-in seller opens straight on their dashboard. This is the fix
  // for the login-on-every-launch bug, and the case that must never regress.
  it('opens a signed-in seller on their dashboard, not a login form', () => {
    expect(entryDestination('seller', true)).toBe('/farmer/dashboard')
  })

  // USE: a genuinely logged-out seller still has to log in — the fix must not
  // become a way past the password.
  it('still asks a logged-out seller to log in', () => {
    expect(entryDestination('seller', false)).toBe(SELLER_LOGIN)
  })

  // USE: the seller flag defaults to false, so a caller that forgets to pass it
  // fails safe (a login prompt) rather than opening a dashboard.
  it('defaults to the login form when the caller says nothing about the session', () => {
    expect(entryDestination('seller')).toBe(SELLER_LOGIN)
  })

  // USE: buyers are the majority and their surface needs no session at all.
  it('sends a consumer to the consumer surface', () => {
    expect(entryDestination('consumer', false)).toBe('/consumer')
  })

  // USE: someone who installed from Chrome's own menu never chose a role. The
  // consumer surface is the safe default — a buyer landing on a farmer login
  // has no idea what to do, whereas a farmer can navigate on from /consumer.
  it('defaults to the consumer surface when no choice was ever made', () => {
    expect(entryDestination(undefined)).toBe('/consumer')
    expect(entryDestination('')).toBe('/consumer')
  })

  // USE: the value is a cookie, so anyone can put anything in it. An unknown
  // value must fall to the consumer default rather than reaching a route that
  // does not exist.
  it('ignores a tampered or unknown cookie value', () => {
    expect(entryDestination('admin', true)).toBe('/consumer')
    expect(entryDestination('SELLER', true)).toBe('/consumer')
  })

  // USE: the cookie name is shared with the server component that reads it and
  // the client helper that writes it. If it drifts, the app forgets the user's
  // choice on every launch and nothing errors to say so.
  it('pins the cookie name both sides read', () => {
    expect(ENTRY_COOKIE).toBe('yff_entry')
  })
})

import { describe, it, expect, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

// A staging link reached real customers on 2026-09-09: it was copied from the
// address bar on the preview deployment and forwarded on WhatsApp, and buyers
// landed on a working store selling "Rice (Test)". Preview deployments answer
// 200 to anyone, and an order placed there lands in the staging database where
// nobody sees it. The gate below is what makes an already-forwarded link
// harmless, so these tests guard the two ways it could fail: bouncing the team
// out of their own test site, or redirecting a write to production.

function req(url: string, cookie?: string) {
  return new NextRequest(new URL(url, 'https://preview.vercel.app'), {
    headers: cookie ? { cookie } : undefined,
  })
}

const setEnv = (v: string | undefined) => {
  if (v === undefined) vi.stubEnv('VERCEL_ENV', '')
  else vi.stubEnv('VERCEL_ENV', v)
}

afterEach(() => vi.unstubAllEnvs())

describe('preview gate', () => {
  // USE: the actual incident. A buyer taps a forwarded staging link.
  it('sends a stranger on a preview deployment to production', () => {
    setEnv('preview')
    const res = proxy(req('/consumer/harvest/abc-123'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(
      'https://www.gogrameen.in/consumer/harvest/abc-123',
    )
  })

  it('keeps the path and query so the link still lands where it meant to', () => {
    setEnv('preview')
    const res = proxy(req('/consumer/produce/x1?ref=whatsapp'))
    expect(res.headers.get('location')).toBe(
      'https://www.gogrameen.in/consumer/produce/x1?ref=whatsapp',
    )
  })

  // USE: the gate must never touch the real site. If this regresses, every
  // production page 307s to itself — an infinite redirect for every customer.
  it('does nothing in production', () => {
    setEnv('production')
    expect(proxy(req('/consumer')).status).toBe(200)
  })

  it('does nothing in local development', () => {
    setEnv(undefined)
    expect(proxy(req('/consumer')).status).toBe(200)
  })

  // USE: a 307 preserves method AND body. Redirecting a POST would carry a
  // TEST order into the PRODUCTION database — worse than the bug being fixed.
  it('never redirects the API, so no test write can reach production', () => {
    setEnv('preview')
    // A public API route: not role-gated, so a redirect is the only risk here.
    const res = proxy(req('/api/produce'))
    expect(res.status).not.toBe(307)
    expect(res.headers.get('location')).toBeNull()
  })

  it('still applies the role backstop to the API on a preview build', () => {
    setEnv('preview')
    // No farmer cookie: must be the 401 from the role check, never a redirect.
    expect(proxy(req('/api/farmer/orders')).status).toBe(401)
  })
})

describe('tester opt-in', () => {
  // USE: the team has to be able to use their own test site, or they will
  // simply turn the gate off again.
  it('lets a tester through once the cookie is set', () => {
    setEnv('preview')
    expect(proxy(req('/consumer', 'yff_tester=1')).status).toBe(200)
  })

  it('sets the cookie on ?tester=1 and drops the flag from the URL', () => {
    setEnv('preview')
    const res = proxy(req('/consumer?tester=1'))
    expect(res.status).toBe(307)
    // Redirects to itself without the flag — not to production.
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('preview.vercel.app/consumer')
    expect(loc).not.toContain('tester=1')
    expect(res.cookies.get('yff_tester')?.value).toBe('1')
  })

  it('ignores a junk tester cookie value', () => {
    setEnv('preview')
    expect(proxy(req('/consumer', 'yff_tester=maybe')).status).toBe(307)
  })
})

import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { getSessionSecret } from '@/lib/session'

// Owner/admin session. There is no admin user table — access is gated by a
// single ADMIN_PASSWORD env var. Successful password check sets this cookie;
// every admin endpoint verifies it. The HMAC is namespaced with `admin:` so
// a consumer or rider token cannot be replayed against admin routes.
const COOKIE_NAME = 'yff_admin'
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sign(payload: string): string {
  const secret = getSessionSecret()
  return b64url(createHmac('sha256', secret).update(`admin:${payload}`).digest())
}

export function getAdminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD
  if (!pw || pw.length < 8) {
    throw new Error(
      'ADMIN_PASSWORD env var is missing or too short. Set an 8+ char value in your environment.',
    )
  }
  return pw
}

export function createAdminSessionToken(): string {
  const issuedAt = Date.now()
  const payload = `admin.${issuedAt}`
  return `${payload}.${sign(payload)}`
}

export function isAdminRequest(req: NextRequest): boolean {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [marker, issuedAtStr, sig] = parts
  if (marker !== 'admin') return false
  const issuedAt = Number(issuedAtStr)
  if (!Number.isFinite(issuedAt)) return false
  if (Date.now() - issuedAt > TOKEN_TTL_MS) return false
  let expected: string
  try {
    expected = sign(`${marker}.${issuedAtStr}`)
  } catch {
    return false
  }
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function setAdminSessionCookie(res: NextResponse): void {
  const token = createAdminSessionToken()
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(TOKEN_TTL_MS / 1000),
  })
}

export function clearAdminSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export const ADMIN_SESSION_COOKIE_NAME = COOKIE_NAME

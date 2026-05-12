import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { getSessionSecret } from '@/lib/session'

// Rider auth cookie. Separate from yff_consumer so a consumer logged into
// the storefront can't accidentally act as a delivery boy (and vice versa).
// Both share SESSION_SECRET — the cookie name is included in the HMAC so a
// stolen consumer token can't be replayed against a rider endpoint.
const COOKIE_NAME = 'yff_rider'
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sign(payload: string): string {
  const secret = getSessionSecret()
  return b64url(createHmac('sha256', secret).update(`rider:${payload}`).digest())
}

export function createRiderSessionToken(riderId: string): string {
  const issuedAt = Date.now()
  const payload = `${riderId}.${issuedAt}`
  return `${payload}.${sign(payload)}`
}

export type RiderSessionPayload = { riderId: string; issuedAt: number }

export function verifyRiderSessionToken(token: string | undefined | null): RiderSessionPayload | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [riderId, issuedAtStr, sig] = parts
  const issuedAt = Number(issuedAtStr)
  if (!riderId || !Number.isFinite(issuedAt)) return null
  if (Date.now() - issuedAt > TOKEN_TTL_MS) return null

  let expected: string
  try {
    expected = sign(`${riderId}.${issuedAtStr}`)
  } catch {
    return null
  }
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null
  return { riderId, issuedAt }
}

export function getRiderSessionFromRequest(req: NextRequest): RiderSessionPayload | null {
  const token = req.cookies.get(COOKIE_NAME)?.value
  return verifyRiderSessionToken(token)
}

export function setRiderSessionCookie(res: NextResponse, riderId: string): void {
  const token = createRiderSessionToken(riderId)
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(TOKEN_TTL_MS / 1000),
  })
}

export function clearRiderSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export const RIDER_SESSION_COOKIE_NAME = COOKIE_NAME

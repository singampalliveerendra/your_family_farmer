import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { getSessionSecret } from '@/lib/session'

// Farmer auth cookie. Separate cookie + namespaced HMAC so a stolen
// consumer or rider token can't be replayed against farmer endpoints.
const COOKIE_NAME = 'yff_farmer'
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
// Slide the 30-day expiry once a token is a day old, so a farmer who uses the
// dashboard at all never gets logged out mid-order. Re-issuing on every request
// would be wasteful; a day of granularity is plenty.
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sign(payload: string): string {
  const secret = getSessionSecret()
  return b64url(createHmac('sha256', secret).update(`farmer:${payload}`).digest())
}

export function createFarmerSessionToken(farmerId: string): string {
  const issuedAt = Date.now()
  const payload = `${farmerId}.${issuedAt}`
  return `${payload}.${sign(payload)}`
}

export type FarmerSessionPayload = { farmerId: string; issuedAt: number }

export function verifyFarmerSessionToken(token: string | undefined | null): FarmerSessionPayload | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [farmerId, issuedAtStr, sig] = parts
  const issuedAt = Number(issuedAtStr)
  if (!farmerId || !Number.isFinite(issuedAt)) return null
  if (Date.now() - issuedAt > TOKEN_TTL_MS) return null

  let expected: string
  try {
    expected = sign(`${farmerId}.${issuedAtStr}`)
  } catch {
    return null
  }
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null
  return { farmerId, issuedAt }
}

export function getFarmerSessionFromRequest(req: NextRequest): FarmerSessionPayload | null {
  const token = req.cookies.get(COOKIE_NAME)?.value
  return verifyFarmerSessionToken(token)
}

export function setFarmerSessionCookie(res: NextResponse, farmerId: string): void {
  const token = createFarmerSessionToken(farmerId)
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(TOKEN_TTL_MS / 1000),
  })
}

/** Re-issue the cookie with a fresh 30-day window if it is older than a day. */
export function refreshFarmerSessionCookie(res: NextResponse, session: FarmerSessionPayload): void {
  if (Date.now() - session.issuedAt < REFRESH_AFTER_MS) return
  setFarmerSessionCookie(res, session.farmerId)
}

export function clearFarmerSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export const FARMER_SESSION_COOKIE_NAME = COOKIE_NAME

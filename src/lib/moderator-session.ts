import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { getSessionSecret } from '@/lib/session'

// Moderator session. Like the owner/admin panel, access is gated by a single
// MODERATOR_PASSWORD env var — there is no moderator user table (for the first
// 3 months the founders themselves are the moderator). Successful password
// check sets this cookie; every moderator endpoint verifies it. The HMAC is
// namespaced with `moderator:` so a consumer, farmer, rider, or admin token
// cannot be replayed against moderator routes — that is what keeps the
// /moderator area invisible to every other role.
const COOKIE_NAME = 'yff_moderator'
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sign(payload: string): string {
  const secret = getSessionSecret()
  return b64url(createHmac('sha256', secret).update(`moderator:${payload}`).digest())
}

export function getModeratorPassword(): string {
  const pw = process.env.MODERATOR_PASSWORD
  if (!pw || pw.length < 8) {
    throw new Error(
      'MODERATOR_PASSWORD env var is missing or too short. Set an 8+ char value in your environment.',
    )
  }
  return pw
}

// The single zone this moderator manages. Defaults to the launch zone.
export function getModeratorZone(): string {
  return process.env.MODERATOR_ZONE || 'tadepalligudem'
}

export function createModeratorSessionToken(): string {
  const issuedAt = Date.now()
  const payload = `moderator.${issuedAt}`
  return `${payload}.${sign(payload)}`
}

export function isModeratorRequest(req: NextRequest): boolean {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [marker, issuedAtStr, sig] = parts
  if (marker !== 'moderator') return false
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

export function setModeratorSessionCookie(res: NextResponse): void {
  const token = createModeratorSessionToken()
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(TOKEN_TTL_MS / 1000),
  })
}

export function clearModeratorSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export const MODERATOR_SESSION_COOKIE_NAME = COOKIE_NAME

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

// The zone the request's moderator manages. Read from their signed session
// token (stamped with their own region_slug at login), so moderators of
// different zones can all use one deployment and each stays scoped to their
// own region. Falls back to the MODERATOR_ZONE env var when there's no
// moderator session on the request (e.g. routing complaints for other roles).
export function getModeratorZone(req?: NextRequest): string {
  if (req) {
    const t = readModeratorToken(req)
    if (t?.zone) return t.zone
  }
  return process.env.MODERATOR_ZONE || 'tadepalligudem'
}

export function createModeratorSessionToken(zone: string): string {
  const issuedAt = Date.now()
  const zoneB64 = b64url(Buffer.from(zone, 'utf8'))
  const payload = `moderator.${issuedAt}.${zoneB64}`
  return `${payload}.${sign(payload)}`
}

// Parse + verify the moderator cookie. Returns the decoded zone (and issue
// time) when valid, or null. Token shape: moderator.<issuedAt>.<zoneB64>.<sig>
function readModeratorToken(req: NextRequest): { issuedAt: number; zone: string } | null {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [marker, issuedAtStr, zoneB64, sig] = parts
  if (marker !== 'moderator') return null
  const issuedAt = Number(issuedAtStr)
  if (!Number.isFinite(issuedAt)) return null
  if (Date.now() - issuedAt > TOKEN_TTL_MS) return null
  let expected: string
  try {
    expected = sign(`${marker}.${issuedAtStr}.${zoneB64}`)
  } catch {
    return null
  }
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null
  let zone = ''
  try {
    zone = Buffer.from(zoneB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch {
    return null
  }
  return { issuedAt, zone }
}

export function isModeratorRequest(req: NextRequest): boolean {
  return readModeratorToken(req) !== null
}

export function setModeratorSessionCookie(res: NextResponse, zone: string): void {
  const token = createModeratorSessionToken(zone)
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

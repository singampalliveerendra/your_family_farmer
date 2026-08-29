import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { getSessionSecret } from '@/lib/session'

// Moderator session. Moderators are real per-person accounts in the `moderators`
// table with scrypt-hashed passwords, each stamped with the region_slug they
// manage; /api/moderator/login verifies against that table. (This was once a
// single shared MODERATOR_PASSWORD env var — scripts/moderator-auth-migration.sql
// replaced it. The stale comment that still described the env var outlived the
// change by months, which is exactly the sort of thing that gets believed during
// an incident, so: the table is the source of truth.)
//
// A successful password check sets this cookie; every moderator endpoint
// verifies it. The HMAC is
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

// Token shape: moderator.<issuedAt>.<zoneB64>.<idB64>.<sig>. The moderator id
// lets endpoints attribute actions (e.g. "registered by this moderator") and
// scope per-moderator lists. Older tokens minted before the id was added have
// the legacy 4-part shape (no idB64); those are still accepted (id = null) so
// existing sessions don't break — the moderator just re-logs in to get an id.
export function createModeratorSessionToken(zone: string, moderatorId?: string | null): string {
  const issuedAt = Date.now()
  const zoneB64 = b64url(Buffer.from(zone, 'utf8'))
  const idB64 = b64url(Buffer.from(moderatorId ?? '', 'utf8'))
  const payload = `moderator.${issuedAt}.${zoneB64}.${idB64}`
  return `${payload}.${sign(payload)}`
}

// Parse + verify the moderator cookie. Returns the decoded zone, id, and issue
// time when valid, or null. Accepts both the current 5-part token and the
// legacy 4-part token (which carries no id).
function readModeratorToken(req: NextRequest): { issuedAt: number; zone: string; id: string | null } | null {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 4 && parts.length !== 5) return null
  const hasId = parts.length === 5
  const marker = parts[0]
  const issuedAtStr = parts[1]
  const zoneB64 = parts[2]
  const idB64 = hasId ? parts[3] : ''
  const sig = hasId ? parts[4] : parts[3]
  if (marker !== 'moderator') return null
  const issuedAt = Number(issuedAtStr)
  if (!Number.isFinite(issuedAt)) return null
  if (Date.now() - issuedAt > TOKEN_TTL_MS) return null
  const signedPayload = hasId
    ? `${marker}.${issuedAtStr}.${zoneB64}.${idB64}`
    : `${marker}.${issuedAtStr}.${zoneB64}`
  let expected: string
  try {
    expected = sign(signedPayload)
  } catch {
    return null
  }
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null
  const decode = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  let zone = ''
  let id: string | null = null
  try {
    zone = decode(zoneB64)
    if (hasId) { const d = decode(idB64); id = d || null }
  } catch {
    return null
  }
  return { issuedAt, zone, id }
}

export function isModeratorRequest(req: NextRequest): boolean {
  return readModeratorToken(req) !== null
}

// The id of the moderator who owns this request's session, or null for legacy
// sessions minted before the id was added (they re-login to populate it).
export function getModeratorId(req?: NextRequest): string | null {
  if (!req) return null
  return readModeratorToken(req)?.id ?? null
}

export function setModeratorSessionCookie(res: NextResponse, zone: string, moderatorId?: string | null): void {
  const token = createModeratorSessionToken(zone, moderatorId)
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

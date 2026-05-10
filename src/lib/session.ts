import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'

// HMAC-signed session token (server-only). Stored in an HTTP-only cookie so
// XSS cannot exfiltrate it. Format: <consumerId>.<issuedAtMs>.<hmacHexBase64url>
//
// We never put consumer name or phone in the token — those live in the DB.
// localStorage holds the public profile copy used purely for UI display, and
// the server re-derives identity from the cookie on every request.

const COOKIE_NAME = 'yff_consumer'
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET env var is missing or too short. Set a 32+ char random string in your environment (e.g. `openssl rand -hex 32`).',
    )
  }
  return secret
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sign(payload: string): string {
  const secret = getSessionSecret()
  return b64url(createHmac('sha256', secret).update(payload).digest())
}

export function createSessionToken(consumerId: string): string {
  const issuedAt = Date.now()
  const payload = `${consumerId}.${issuedAt}`
  const sig = sign(payload)
  return `${payload}.${sig}`
}

export type SessionPayload = { consumerId: string; issuedAt: number }

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [consumerId, issuedAtStr, sig] = parts
  const issuedAt = Number(issuedAtStr)
  if (!consumerId || !Number.isFinite(issuedAt)) return null
  if (Date.now() - issuedAt > TOKEN_TTL_MS) return null

  let expected: string
  try {
    expected = sign(`${consumerId}.${issuedAtStr}`)
  } catch {
    return null
  }
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null
  return { consumerId, issuedAt }
}

export function getConsumerSessionFromRequest(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(COOKIE_NAME)?.value
  return verifySessionToken(token)
}

export function setSessionCookie(res: NextResponse, consumerId: string): void {
  const token = createSessionToken(consumerId)
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(TOKEN_TTL_MS / 1000),
  })
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export const CONSUMER_SESSION_COOKIE_NAME = COOKIE_NAME

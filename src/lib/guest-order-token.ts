import { createHmac, timingSafeEqual } from 'crypto'
import { getSessionSecret } from '@/lib/session'

// Short-lived, stateless token that lets a GUEST (no account, no session
// cookie) finish the one checkout they just started — specifically the
// Razorpay create → verify pair, which would otherwise be session-gated.
//
// It is bound to the exact set of order ids returned by /api/orders/place and
// expires quickly, so it only authorizes paying for those rows, nothing else.
// It is NOT a tracking token: guests get no order-history access (by design —
// "pay-now only" guest checkout).
//
// Format: <issuedAtMs>.<hmacBase64url>, where the HMAC covers the sorted,
// comma-joined order ids plus the issued-at timestamp.

const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour — plenty to complete a payment

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Length-prefixed so the join character can't create an ambiguity: without the
// count, the single id "a,b" would canonicalise to exactly the same string as
// the pair ["a", "b"], and one token would authorize both. Order ids are
// Postgres UUIDs and can never contain a comma, so this is belt-and-braces —
// but it costs a byte and removes the whole class.
function canonicalIds(orderIds: string[]): string {
  const ids = [...orderIds].map((id) => id.toLowerCase()).sort()
  return `${ids.length}:${ids.join(',')}`
}

function sign(payload: string): string {
  return b64url(createHmac('sha256', getSessionSecret()).update(payload).digest())
}

export function createGuestOrderToken(orderIds: string[]): string {
  const issuedAt = Date.now()
  const sig = sign(`${canonicalIds(orderIds)}.${issuedAt}`)
  return `${issuedAt}.${sig}`
}

// Returns true only when `token` was issued by us for exactly this set of
// order ids and hasn't expired.
export function verifyGuestOrderToken(token: string | undefined | null, orderIds: string[]): boolean {
  if (!token || orderIds.length === 0) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [issuedAtStr, sig] = parts
  const issuedAt = Number(issuedAtStr)
  if (!Number.isFinite(issuedAt)) return false
  if (Date.now() - issuedAt > TOKEN_TTL_MS) return false

  let expected: string
  try {
    expected = sign(`${canonicalIds(orderIds)}.${issuedAtStr}`)
  } catch {
    return false
  }
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

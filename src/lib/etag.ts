import { createHash } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'

/* "Has anything changed since you last asked?" for polled JSON.
 *
 * The farmer's order screens poll every 25 s, and almost every poll returns
 * exactly what the phone already has — up to 500 orders on the Orders page.
 * The response carries an ETag (a fingerprint of the body); the client sends it
 * back as If-None-Match, and when nothing changed the server answers 304 with
 * no body. The query still runs; what is saved is the transfer — Vercel
 * bandwidth, and the farmer's mobile data on 4G. */

export function etagOf(text: string): string {
  return `"${createHash('sha1').update(text).digest('base64url')}"`
}

/** True when the client's If-None-Match already names this exact body. */
export function isNotModified(ifNoneMatch: string | null | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false
  return ifNoneMatch.split(',').map((t) => t.trim().replace(/^W\//, '')).includes(etag)
}

export function jsonWithEtag(req: NextRequest, body: unknown): NextResponse {
  const text = JSON.stringify(body)
  const etag = etagOf(text)
  const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' }
  if (isNotModified(req.headers.get('if-none-match'), etag)) {
    return new NextResponse(null, { status: 304, headers })
  }
  return new NextResponse(text, { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } })
}

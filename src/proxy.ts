import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Defence in depth for the role-scoped API areas.
//
// Every route under these prefixes already checks its own session — that is
// where authorisation actually lives, and this middleware is deliberately NOT a
// replacement for it. What it is: a backstop, so that a new route added without
// its check is closed rather than open. The audit that prompted this found all
// 98 routes correct; the point is to keep that true without relying on everyone
// remembering.
//
// It only checks that a cookie for the right role is PRESENT. It does not
// verify the HMAC — signature checking needs Node crypto and the session
// secret, and doing it here would either duplicate the per-role verify logic or
// force this file onto the Node runtime for every matched request. Presence is
// enough to reject the unauthenticated case cheaply; the route still verifies
// the signature before trusting anything, and a forged cookie gets past this
// gate only to fail there.
//
// Public-by-design routes are listed explicitly rather than pattern-matched,
// because "which endpoints may be called by a stranger" should be a decision
// someone writes down, not a regex someone infers.
const ROLE_COOKIE: Record<string, string> = {
  '/api/farmer': 'yff_farmer',
  '/api/moderator': 'yff_moderator',
  '/api/rider': 'yff_rider',
  '/api/admin': 'yff_admin',
  // An aggregator IS a farmers row with account_type='aggregator', so it
  // carries the farmer cookie; requireAggregator() does the type check.
  '/api/aggregator': 'yff_farmer',
}

// Reachable without a session, by design: authentication entry points, plus two
// under /api/farmer that are not farmer-authenticated at all —
//   /api/farmer/[id]/follow  is a CONSUMER action (following a farmer), and
//   /api/farmer/orders/[id]/picked-up is a 410 tombstone whose whole job is to
//   tell old clients they are out of date; a 401 there would be a worse answer.
const PUBLIC_PATHS = new Set([
  '/api/moderator/login',
  '/api/moderator/logout',
  '/api/rider/login',
  '/api/rider/logout',
  '/api/rider/register',
  '/api/admin/login',
  '/api/admin/logout',
  '/api/aggregator/register',
])

const PUBLIC_PATTERNS = [
  /^\/api\/farmer\/[^/]+\/follow$/,
  /^\/api\/farmer\/orders\/[^/]+\/picked-up$/,
]

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()
  if (PUBLIC_PATTERNS.some((re) => re.test(pathname))) return NextResponse.next()

  for (const [prefix, cookie] of Object.entries(ROLE_COOKIE)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      if (!req.cookies.get(cookie)?.value) {
        return NextResponse.json({ error: 'Please log in.' }, { status: 401 })
      }
      return NextResponse.next()
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/farmer/:path*', '/api/moderator/:path*', '/api/rider/:path*', '/api/admin/:path*', '/api/aggregator/:path*'],
}

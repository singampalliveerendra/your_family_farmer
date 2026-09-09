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

// ── Preview deployments must not serve the public ──────────────────────────
//
// 2026-09-09: a staging link reached real customers. Someone testing on the
// preview deployment copied the address bar, it was forwarded on WhatsApp, and
// buyers landed on a fully working store showing "Rice (Test)" from
// "Lakshmi (Test)". Preview builds are public by default — the URL returned 200
// to anyone — and an order placed there lands in the staging database, where no
// farmer or moderator will ever see it.
//
// Taking the deployment down is not the answer (the team tests on it), and
// neither is the amber TEST SITE banner: it only warns AFTER the page renders,
// and people do not read banners while shopping. So a preview bounces page
// requests to the same path on production. This is what neutralises links that
// are ALREADY circulating and cannot be recalled — including any opened by the
// "Go Grameen (Test)" app that was distributed before the APK was pulled.
//
// The team opts in once with ?tester=1, which sets a cookie for the session.
//
// Deliberately NOT redirected:
//   /api/*  — a 307 preserves method and body, so a POST would carry a TEST
//             order to the PRODUCTION database. Sending live orders to prod
//             from a staging click is far worse than the problem being fixed.
//   assets  — excluded by the matcher; redirecting them just breaks the page
//             that is on its way out anyway.
//
// Vercel Deployment Protection is still the better fix and should be turned on;
// this is the part that can ship from the repo.
const TESTER_COOKIE = 'yff_tester'
const PRODUCTION_ORIGIN = 'https://www.gogrameen.in'

function isPreview(): boolean {
  return (process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV) === 'preview'
}

function previewGate(req: NextRequest): NextResponse | null {
  if (!isPreview()) return null
  const { pathname, searchParams } = req.nextUrl

  // API keeps working: testers need it, and redirecting writes is dangerous.
  if (pathname.startsWith('/api/')) return null

  // Opting in — remember it so the tester is not bounced on the next click.
  if (searchParams.get('tester') === '1') {
    const url = req.nextUrl.clone()
    url.searchParams.delete('tester')
    const res = NextResponse.redirect(url)
    res.cookies.set(TESTER_COOKIE, '1', { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 })
    return res
  }

  if (req.cookies.get(TESTER_COOKIE)?.value === '1') return null

  const to = new URL(pathname + req.nextUrl.search, PRODUCTION_ORIGIN)
  return NextResponse.redirect(to, 307)
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Runs before the role checks: a stranger on a preview deployment should be
  // sent to the real site whatever they asked for.
  const bounce = previewGate(req)
  if (bounce) return bounce

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
  // The API prefixes carry the role backstop; the catch-all is what lets the
  // preview gate see ordinary page requests. Static assets, the APK and
  // assetlinks are excluded — matching them would cost a middleware invocation
  // per file and redirecting them helps nobody.
  matcher: [
    '/api/farmer/:path*',
    '/api/moderator/:path*',
    '/api/rider/:path*',
    '/api/admin/:path*',
    '/api/aggregator/:path*',
    '/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|downloads|.well-known).*)',
  ],
}

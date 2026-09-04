/* Buyer view — a seller browsing the shop as one of their own customers.
 *
 * A farmer (or aggregator) has two things to do on the buyer side: order from
 * OTHER farmers, and look at their own listings the way a buyer sees them.
 * Neither is possible from the dashboard, and making them sign up a second
 * time under a second password to do it is the kind of friction that ends with
 * a phone call instead of an order.
 *
 * So the switch mints a buyer session from the seller session
 * (`/api/farmer/buyer-session`) and drops this marker cookie. The marker is
 * deliberately NOT the credential — the credential is the HTTP-only
 * `yff_consumer` cookie the API sets, exactly the one a normal buyer login
 * would set. This cookie only answers "did they get here through the switch",
 * which is what lets the buyer pages offer a one-tap way back to the dashboard
 * and what lets farmer logout take the borrowed buyer session down with it.
 *
 * A cookie rather than localStorage because the server reads it too (logout),
 * and readable by JS on purpose: the buyer bar has to render on first paint,
 * without a round-trip, on a 4G phone.
 */

export const BUYER_VIEW_COOKIE = 'yff_buyer_view'

/** Which dashboard the switch was made from — the two seller surfaces. */
export type SellerRole = 'farmer' | 'aggregator'

const MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // matches the session cookies' 30 days

export function parseBuyerView(raw: string | null | undefined): SellerRole | null {
  return raw === 'farmer' || raw === 'aggregator' ? raw : null
}

/** Where "back to my dashboard" goes. */
export function sellerDashboardPath(role: SellerRole): string {
  return role === 'aggregator' ? '/aggregator/dashboard' : '/farmer/dashboard'
}

/* Seller-side paths come first: /farmer/dashboard is a seller page while
 * /farmer/<slug> is a buyer page, so the two lists have to be tested in this
 * order or the dashboard itself would carry the "you are shopping" bar. */
const SELLER_PREFIXES = [
  '/farmer/dashboard',
  '/farmer/login',
  '/farmer/signup',
  '/farmer/complaints',
  '/aggregator',
  '/moderator',
  '/rider',
  '/admin',
]

const BUYER_PREFIXES = ['/consumer', '/region', '/farmer']

/** Prefix match on path SEGMENTS: '/consumer' covers '/consumer/cart' but not
 *  some future '/consumers-something'. */
function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/**
 * Whether the "you are browsing as a buyer" bar belongs on this page.
 *
 * True on the buyer surfaces only — including a farmer's own public profile,
 * which is the page the "preview my shop" switch lands on. A seller in buyer
 * view still holds a live seller session, so they can land back on the
 * dashboard at any time; the bar there would offer them a way back to the page
 * they are already on.
 */
export function showsBuyerViewBar(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  if (SELLER_PREFIXES.some((p) => isUnder(pathname, p))) return false
  return BUYER_PREFIXES.some((p) => isUnder(pathname, p))
}

/* ---- browser-only cookie access ---- */

export function writeBuyerView(role: SellerRole): void {
  if (typeof document === 'undefined') return
  document.cookie = `${BUYER_VIEW_COOKIE}=${role}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`
}

export function readBuyerView(): SellerRole | null {
  if (typeof document === 'undefined') return null
  const hit = document.cookie.match(new RegExp(`(?:^|; )${BUYER_VIEW_COOKIE}=([^;]*)`))
  return parseBuyerView(hit?.[1])
}

export function clearBuyerView(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${BUYER_VIEW_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}

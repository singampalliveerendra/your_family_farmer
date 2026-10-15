/* The app-wide bottom menu bar — which bar a page gets, which tab is lit, and
 * when the middle cart button should ask for attention.
 *
 * Two bars, one per side of the app:
 *   buyer:  Home · Farmers · [Cart] · Orders · Account
 *   seller: Home · Orders · Produce · Profile · Shop as buyer
 * A seller who crossed into buyer view gets the buyer bar with "My Store" in
 * place of Account (the account links are still in the ⚙️ menu up top).
 *
 * Pure functions only, so the rules are testable without a browser; the bar
 * itself is components/BottomNav.tsx, mounted once from the root layout.
 */

export type NavKind = 'buyer' | 'seller'

export type BuyerTab = 'home' | 'farmers' | 'cart' | 'orders' | 'account'
export type SellerTab = 'home' | 'orders' | 'produce' | 'profile'

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/* Pages that keep the bar. Everything else is left alone on purpose:
 *  - produce / harvest detail pages and a farmer's public page have their own
 *    fixed "Add to cart" / "WhatsApp" bar at the bottom, and two stacked bars on
 *    a 390px phone leave too little room for the page itself;
 *  - the cart is a checkout flow with its own Place order button;
 *  - a single order page has its own bottom actions (cancel, rate). */
const BUYER_PAGES = [
  '/consumer',
  '/consumer/farmers',
  '/consumer/orders',
  '/consumer/orders/history',
  '/consumer/profile',
  '/consumer/intents',
  '/consumer/complaints',
]

const SELLER_PAGES = [
  '/farmer/dashboard',
  '/farmer/dashboard/orders',
  '/farmer/complaints',
  '/aggregator/dashboard',
  '/aggregator/farmers',
]

/** Which bar this page shows, or null for none. Exact page match, so a new
 *  page under /consumer has to opt in rather than inherit a bar that may
 *  cover its own bottom buttons. */
export function navKindFor(pathname: string | null | undefined): NavKind | null {
  if (!pathname) return null
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (BUYER_PAGES.includes(path) || isUnder(path, '/region')) return 'buyer'
  if (SELLER_PAGES.includes(path)) return 'seller'
  return null
}

export function activeBuyerTab(pathname: string | null | undefined): BuyerTab | null {
  if (!pathname) return null
  if (isUnder(pathname, '/consumer/cart')) return 'cart'
  if (isUnder(pathname, '/consumer/orders')) return 'orders'
  if (isUnder(pathname, '/consumer/farmers') || isUnder(pathname, '/region')) return 'farmers'
  if (
    isUnder(pathname, '/consumer/profile')
    || isUnder(pathname, '/consumer/intents')
    || isUnder(pathname, '/consumer/complaints')
  ) return 'account'
  if (pathname === '/consumer') return 'home'
  return null
}

/** `view` is the dashboard's ?view= param: the Produce and Profile tabs open
 *  the dashboard's own sheets rather than pages of their own. */
export function activeSellerTab(pathname: string | null | undefined, view?: string | null): SellerTab | null {
  if (!pathname) return null
  if (pathname.endsWith('/dashboard/orders') || isUnder(pathname, '/farmer/dashboard/orders')) return 'orders'
  if (pathname === '/farmer/dashboard' || pathname === '/aggregator/dashboard') {
    if (view === 'produce') return 'produce'
    if (view === 'profile') return 'profile'
    return 'home'
  }
  return null
}

/** Where the seller tabs point. An aggregator's dashboard lives at its own URL
 *  (it bounces a farmer, and vice versa), so every tab follows the role. */
export function sellerTabHref(role: 'farmer' | 'aggregator', tab: SellerTab): string {
  const base = role === 'aggregator' ? '/aggregator/dashboard' : '/farmer/dashboard'
  switch (tab) {
    case 'home': return base
    // The orders page is shared: it lives under /farmer only.
    case 'orders': return '/farmer/dashboard/orders'
    case 'produce': return `${base}?view=produce`
    case 'profile': return `${base}?view=profile`
  }
}

/* Events between the bar and the seller dashboard. The Produce and Profile tabs
 * open sheets that live inside the dashboard, so when the dashboard is already
 * on screen the bar asks it to open one (no navigation, no reload), and the
 * dashboard reports back which sheet is open so the right tab stays lit. */
export const SELLER_OPEN_EVENT = 'yff:seller-open'
export const SELLER_VIEW_EVENT = 'yff:seller-view'

/* ---- cart attention ----
 * The middle cart button glows (a slow turning ring) while there is something
 * in the cart the buyer has not looked at yet, and stops once they open the
 * cart. "Looked at" is remembered as a signature of the cart's lines, so adding
 * another item starts the glow again but a page reload does not. */

export const CART_SEEN_KEY = 'yff_cart_seen_v1'

/** Order-independent signature of what is in the cart: line keys + quantities. */
export function cartSignature(cart: Record<string, { qty: number }>): string {
  return Object.keys(cart)
    .sort()
    .map((k) => `${k}:${cart[k].qty}`)
    .join('|')
}

export function cartNeedsAttention(signature: string, seen: string | null): boolean {
  return signature !== '' && signature !== seen
}

/** "9+" past nine: the badge sits on a 56px button and must stay one bubble. */
export function badgeText(n: number): string {
  return n > 9 ? '9+' : String(n)
}

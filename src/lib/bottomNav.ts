/* The app-wide bottom menu bar — which bar a page gets, which tab is lit, and
 * when the middle cart button should ask for attention.
 *
 * Two bars, one per side of the app:
 *   buyer:  Home · Farmers · [Cart] · Orders · Settings
 *   seller: Home · Orders · Produce · Settings · Shop as buyer
 * Settings holds the Account button on both sides. A seller who crossed into
 * buyer view gets the buyer bar with "My Store" in place of Farmers, so the
 * way back to their dashboard is one tap.
 *
 * Pure functions only, so the rules are testable without a browser; the bar
 * itself is components/BottomNav.tsx, mounted once from the root layout.
 */

export type NavKind = 'buyer' | 'seller'

export type BuyerTab = 'home' | 'farmers' | 'cart' | 'orders' | 'settings'
export type SellerTab = 'home' | 'orders' | 'produce' | 'settings'

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/* Every buyer and seller page gets the bar, so the way Home / to the cart /
 * to Orders is always one tap. Pages with their own fixed bottom action bar
 * (produce and harvest detail: "Add to cart") lift that bar above this one with
 * BOTTOM_NAV_OFFSET rather than losing the menu.
 *
 * Left without a bar on purpose: the /home chooser and `/` (no side picked
 * yet), login and signup pages (no account yet), and the moderator, rider and
 * admin areas, which have no bar of their own. */
const BUYER_PREFIXES = ['/consumer', '/region', '/buyer-protection']

const SELLER_PREFIXES = ['/farmer/dashboard', '/farmer/complaints', '/aggregator/dashboard', '/aggregator/farmers']

// The other /farmer/* pages; anything else under /farmer is a farmer's public
// page (/farmer/[slug]), which buyers browse.
const FARMER_NON_PUBLIC = ['/farmer/login', '/farmer/signup']

/** Height the bottom bar takes (bar + phone's home-indicator gap). A page's own
 *  fixed bottom bar sits at this offset so the two stack instead of overlap. */
export const BOTTOM_NAV_OFFSET = 'calc(64px + env(safe-area-inset-bottom, 0px))'

/** Which bar this page shows, or null for none. */
export function navKindFor(pathname: string | null | undefined): NavKind | null {
  if (!pathname) return null
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (SELLER_PREFIXES.some((p) => isUnder(path, p))) return 'seller'
  if (BUYER_PREFIXES.some((p) => isUnder(path, p))) return 'buyer'
  if (path.startsWith('/farmer/') && !FARMER_NON_PUBLIC.some((p) => isUnder(path, p))) return 'buyer'
  return null
}

export function activeBuyerTab(pathname: string | null | undefined): BuyerTab | null {
  if (!pathname) return null
  if (isUnder(pathname, '/consumer/cart')) return 'cart'
  if (isUnder(pathname, '/consumer/orders')) return 'orders'
  if (isUnder(pathname, '/consumer/farmers') || isUnder(pathname, '/region')) return 'farmers'
  // Everything reached from the Settings page keeps Settings lit.
  if (
    isUnder(pathname, '/consumer/settings')
    || isUnder(pathname, '/consumer/profile')
    || isUnder(pathname, '/consumer/intents')
    || isUnder(pathname, '/consumer/complaints')
  ) return 'settings'
  if (pathname === '/consumer') return 'home'
  return null
}

/** `view` is the dashboard's ?view= param: the Produce and Settings tabs open
 *  the dashboard's own sheets rather than pages of their own. */
export function activeSellerTab(pathname: string | null | undefined, view?: string | null): SellerTab | null {
  if (!pathname) return null
  if (pathname.endsWith('/dashboard/orders') || isUnder(pathname, '/farmer/dashboard/orders')) return 'orders'
  if (pathname === '/farmer/dashboard' || pathname === '/aggregator/dashboard') {
    if (view === 'produce') return 'produce'
    if (view === 'settings') return 'settings'
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
    case 'settings': return `${base}?view=settings`
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

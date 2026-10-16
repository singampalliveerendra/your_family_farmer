'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { useCart, useCartAddFlight, CartIcon } from '@/components/consumer/Cart'
import { fetchPendingOrderCount, forgetPendingOrderCount } from '@/lib/pendingOrderCount'
import { readBuyerView, sellerDashboardPath, type SellerRole } from '@/lib/buyerView'
import {
  navKindFor, activeBuyerTab, activeSellerTab, sellerTabHref,
  cartSignature, cartNeedsAttention, badgeText, CART_SEEN_KEY,
  type SellerTab, SELLER_OPEN_EVENT, SELLER_VIEW_EVENT,
} from '@/lib/bottomNav'

const SELLER_ROLE_KEY = 'yff_seller_role'

/**
 * The bottom menu bar. Mounted once from the root layout; navKindFor() decides
 * per page whether it shows and which one. Renders an in-flow spacer as well,
 * so the last thing on a page is never hidden behind it.
 */
export default function BottomNav() {
  const pathname = usePathname()
  const kind = navKindFor(pathname)
  if (!kind) return null
  return kind === 'buyer' ? <BuyerBar pathname={pathname} /> : <SellerBar pathname={pathname} />
}

/* ── Shell ─────────────────────────────────────────────── */

function BarShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div aria-hidden className="h-[calc(72px+env(safe-area-inset-bottom,0px))]" />
      <nav
        className="bottom-nav-in fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200/80 shadow-[0_-6px_24px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-lg mx-auto grid grid-cols-5 h-16 px-1">{children}</div>
      </nav>
    </>
  )
}

type TabProps = {
  label: string
  icon: ReactNode
  active: boolean
  badge?: string | null
  dot?: boolean
  tone?: 'green' | 'amber'
  busy?: boolean
}

function TabBody({ label, icon, active, badge, dot, tone = 'green', busy }: TabProps) {
  const on = tone === 'amber' ? 'text-amber-700' : 'text-green-800'
  const pill = tone === 'amber' ? 'bg-amber-100' : 'bg-green-100'
  return (
    <>
      <span className="relative flex items-center justify-center w-14 h-8">
        {/* The lit pill grows in behind the icon rather than snapping on. */}
        <span
          aria-hidden
          className={`absolute inset-0 rounded-full ${pill} transition-all duration-300 ease-out ${
            active ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
          }`}
        />
        <span className={`relative transition-transform duration-300 ${active ? `${on} -translate-y-px` : 'text-gray-500'} ${busy ? 'animate-pulse' : ''}`}>
          {icon}
        </span>
        {badge && (
          <span className="absolute -top-1 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold flex items-center justify-center leading-none ring-2 ring-white">
            {badge}
          </span>
        )}
        {!badge && dot && (
          <span aria-hidden className="absolute top-0.5 right-3 w-2.5 h-2.5 rounded-full bg-red-600 ring-2 ring-white" />
        )}
      </span>
      <span className={`mt-0.5 text-[10.5px] leading-none whitespace-nowrap transition-colors duration-300 ${active ? `${on} font-extrabold` : 'text-gray-500 font-semibold'}`}>
        {label}
      </span>
    </>
  )
}

const tabClass = 'flex flex-col items-center justify-center min-w-0 select-none active:scale-90 transition-transform duration-150 [-webkit-tap-highlight-color:transparent]'

function TabLink({ href, ...p }: TabProps & { href: string }) {
  return (
    <Link href={href} aria-current={p.active ? 'page' : undefined} className={tabClass}>
      <TabBody {...p} />
    </Link>
  )
}

function TabButton({ onClick, ...p }: TabProps & { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={p.busy} aria-current={p.active ? 'page' : undefined} className={tabClass}>
      <TabBody {...p} />
    </button>
  )
}

/* ── Buyer bar ─────────────────────────────────────────── */

function BuyerBar({ pathname }: { pathname: string }) {
  const { L } = useLang()
  const { state } = useConsumerAuth()
  const { cart } = useCart()
  const active = activeBuyerTab(pathname)

  // A seller in buyer view: Farmers becomes the way back to their dashboard.
  // Settings stays, since the Account button lives inside it.
  const [sellerRole, setSellerRole] = useState<SellerRole | null>(null)
  useEffect(() => { setSellerRole(readBuyerView()) }, [pathname])

  // Orders that need the buyer (awaiting the farmer, a payment to finish). Read
  // once per sign-in and again on the orders pages, where it is likely to change.
  const [pending, setPending] = useState(0)
  const onOrders = active === 'orders'
  useEffect(() => {
    if (state.status !== 'authenticated') { setPending(0); forgetPendingOrderCount(); return }
    let cancelled = false
    // Shared with the home page's My orders chip — one request for both.
    fetchPendingOrderCount().then((n) => { if (!cancelled) setPending(n) })
    return () => { cancelled = true }
  }, [state.status, onOrders])

  return (
    <BarShell>
      <TabLink href="/consumer" label={L('Home', 'హోమ్')} icon={<HomeIcon />} active={active === 'home'} />
      {sellerRole ? (
        <TabLink
          href={sellerDashboardPath(sellerRole)}
          label={L('My Store', 'నా స్టోర్')}
          icon={<StoreIcon />}
          active={false}
          tone="amber"
        />
      ) : (
        <TabLink href="/consumer/farmers" label={L('Farmers', 'రైతులు')} icon={<FarmersIcon />} active={active === 'farmers'} />
      )}
      <CartButton cart={cart} label={L('Cart', 'బుట్ట')} />
      <TabLink
        href="/consumer/orders"
        label={L('Orders', 'ఆర్డర్లు')}
        icon={<OrdersIcon />}
        active={active === 'orders'}
        badge={pending > 0 ? badgeText(pending) : null}
      />
      <TabLink href="/consumer/settings" label={L('Settings', 'సెట్టింగ్‌లు')} icon={<SettingsIcon />} active={active === 'settings'} />
    </BarShell>
  )
}

/**
 * The raised cart in the middle. Sits above the bar in a white collar so it
 * reads as the main action. While the cart holds something the buyer has not
 * opened yet, a coloured ring turns slowly around it and it bobs every few
 * seconds; opening the cart stops both until something new is added. Added
 * items fly into it, and it bounces when they land.
 */
function CartButton({ cart, label }: { cart: Record<string, { qty: number }>; label: string }) {
  const router = useRouter()
  const lines = Object.keys(cart).length
  const signature = cartSignature(cart)
  const iconRef = useRef<HTMLSpanElement | null>(null)
  const [bump, setBump] = useState(0)

  // Read after mount: localStorage is not there during the server render.
  const [seen, setSeen] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    try { setSeen(localStorage.getItem(CART_SEEN_KEY)) } catch { /* blocked */ }
    setReady(true)
  }, [])
  const glowing = ready && cartNeedsAttention(signature, seen)

  useCartAddFlight(iconRef, () => setBump((b) => b + 1))

  const open = () => {
    try { localStorage.setItem(CART_SEEN_KEY, signature) } catch { /* blocked */ }
    setSeen(signature)
    router.push('/consumer/cart')
  }

  return (
    <div className="relative flex flex-col items-center justify-end pb-1.5">
      <button
        type="button"
        onClick={open}
        aria-label={lines > 0 ? `${label}, ${lines}` : label}
        className="absolute -top-6 left-1/2 -translate-x-1/2 w-[62px] h-[62px] rounded-full active:scale-90 transition-transform duration-150 [-webkit-tap-highlight-color:transparent]"
      >
        {/* Turning colour ring — only while there is something new to look at. */}
        <span
          aria-hidden
          className={`absolute inset-0 rounded-full transition-opacity duration-500 ${glowing ? 'nav-cart-ring opacity-100' : 'opacity-0'}`}
        />
        {glowing && <span aria-hidden className="nav-cart-halo absolute inset-0 rounded-full" />}
        {/* White collar, then the green disc. */}
        <span className="absolute inset-[3px] rounded-full bg-white shadow-[0_4px_14px_rgba(0,0,0,0.18)]" />
        <span
          key={bump}
          className={`absolute inset-[7px] rounded-full bg-gradient-to-br from-green-600 to-green-800 text-white flex items-center justify-center ${
            bump > 0 ? 'nav-cart-land' : glowing ? 'nav-cart-bob' : ''
          }`}
        >
          <span ref={iconRef} className="scale-110"><CartIcon /></span>
        </span>
        {lines > 0 && (
          <span
            key={`b${bump}`}
            className={`absolute top-0 right-0 min-w-[20px] h-5 px-1 rounded-full bg-amber-400 text-green-950 text-[11px] font-extrabold flex items-center justify-center leading-none ring-2 ring-white ${bump > 0 ? 'cart-bump' : ''}`}
          >
            {badgeText(lines)}
          </span>
        )}
      </button>
      <span className={`text-[10.5px] leading-none ${glowing ? 'text-green-800 font-extrabold' : 'text-gray-500 font-semibold'}`}>{label}</span>
    </div>
  )
}

/* ── Seller bar ────────────────────────────────────────── */

function SellerBar({ pathname }: { pathname: string }) {
  const { L } = useLang()
  const router = useRouter()
  const { enterBuyerMode } = useConsumerAuth()

  // Which dashboard this seller uses. /aggregator/* says so outright; the
  // shared orders page does not, so the last dashboard seen is remembered.
  const [role, setRole] = useState<SellerRole>('farmer')
  useEffect(() => {
    let r: SellerRole | null = null
    if (pathname.startsWith('/aggregator')) r = 'aggregator'
    else if (pathname === '/farmer/dashboard') r = 'farmer'
    try {
      if (r) sessionStorage.setItem(SELLER_ROLE_KEY, r)
      else r = sessionStorage.getItem(SELLER_ROLE_KEY) === 'aggregator' ? 'aggregator' : 'farmer'
    } catch { /* blocked */ }
    setRole(r ?? 'farmer')
  }, [pathname])

  // The sheet the dashboard has open, reported by the dashboard itself.
  const [view, setView] = useState<string | null>(null)
  useEffect(() => {
    setView(new URLSearchParams(window.location.search).get('view'))
    const onView = (e: Event) => setView((e as CustomEvent<string | null>).detail ?? null)
    window.addEventListener(SELLER_VIEW_EVENT, onView)
    return () => window.removeEventListener(SELLER_VIEW_EVENT, onView)
  }, [pathname])
  const active = activeSellerTab(pathname, view)
  const onDashboard = pathname === '/farmer/dashboard' || pathname === '/aggregator/dashboard'

  const openSheet = (tab: SellerTab) => {
    if (onDashboard) {
      window.dispatchEvent(new CustomEvent(SELLER_OPEN_EVENT, { detail: tab }))
      setView(tab)
    } else {
      router.push(sellerTabHref(role, tab))
    }
  }

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shop = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await enterBuyerMode().catch(() => ({
      ok: false as const,
      error: L('No internet. Please try again.', 'ఇంటర్నెట్ లేదు. మళ్లీ ప్రయత్నించండి.'),
    }))
    if (!result.ok) {
      setBusy(false)
      setError(result.error)
      setTimeout(() => setError(null), 4000)
      return
    }
    // Stays busy until the shop paints, so a slow 4G tap is not repeated.
    router.push('/consumer')
  }

  return (
    <>
      {error && (
        <div className="fixed inset-x-0 z-40 px-4 pointer-events-none" style={{ bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))' }}>
          <p className="cart-hint-in max-w-lg mx-auto bg-gray-900 text-white text-xs font-semibold rounded-xl px-3 py-2 shadow-lg">{error}</p>
        </div>
      )}
      <BarShell>
        <TabLink href={sellerTabHref(role, 'home')} label={L('Home', 'హోమ్')} icon={<HomeIcon />} active={active === 'home'} />
        <TabLink href={sellerTabHref(role, 'orders')} label={L('Orders', 'ఆర్డర్లు')} icon={<OrdersIcon />} active={active === 'orders'} />
        <TabButton onClick={() => openSheet('produce')} label={L('Produce', 'ఉత్పత్తులు')} icon={<ProduceIcon />} active={active === 'produce'} />
        <TabButton onClick={() => openSheet('settings')} label={L('Settings', 'సెట్టింగ్‌లు')} icon={<SettingsIcon />} active={active === 'settings'} />
        <TabButton
          onClick={shop}
          label={busy ? L('Opening…', 'తెరుస్తోంది…') : L('Shop as buyer', 'కొనుగోలు')}
          icon={<ShopIcon />}
          active={busy}
          busy={busy}
          tone="amber"
        />
      </BarShell>
    </>
  )
}

/* ── Icons (inline: no icon font to download on 4G) ────── */

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}

function HomeIcon() {
  return <Svg><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></Svg>
}
function FarmersIcon() {
  return <Svg><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5c1.6.4 2.8 1.9 2.8 3.6S17.6 11.3 16 11.7" /><path d="M18 14.3c1.8.7 3 2.6 3 4.7" /></Svg>
}
function OrdersIcon() {
  return <Svg><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></Svg>
}
function SettingsIcon() {
  return <Svg><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Svg>
}
function StoreIcon() {
  return <Svg><path d="M3 9 4.5 4h15L21 9" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M5 12v8h14v-8" /><path d="M10 20v-5h4v5" /></Svg>
}
function ProduceIcon() {
  return <Svg><path d="M12 21c-4.4 0-8-3.1-8-7.5C4 9 7.6 6 12 6s8 3 8 7.5S16.4 21 12 21Z" /><path d="M12 6c0-1.7 1-3 2.5-3.5" /><path d="M12 6c-1.2-1.6-3-2-4.5-1.5" /></Svg>
}
function ShopIcon() {
  return <Svg><path d="M6 7h12l-1 13H7L6 7Z" /><path d="M9 7a3 3 0 0 1 6 0" /></Svg>
}

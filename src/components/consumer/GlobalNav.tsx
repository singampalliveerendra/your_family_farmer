'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import LanguageToggle from '@/components/LanguageToggle'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import BrandLogo from '@/components/BrandLogo'
import { readBuyerView, sellerDashboardPath, type SellerRole } from '@/lib/buyerView'

type ActiveTab = 'consumer' | 'farmer' | 'delivery' | 'moderator'

// Optional location control shown in the top bar (right side, beside the
// greeting). Only the consumer browse page passes it; other pages omit it.
type LocationControl = { name: string; onClick: () => void }

export default function GlobalNav({
  location,
}: {
  // Kept for backward-compat with callers that still pass it; the role tabs
  // were replaced by the ⚙️ RoleMenu, so it no longer drives any highlight.
  activeTab?: ActiveTab
  location?: LocationControl
}) {
  const { L } = useLang()
  const { state, consumer, openAuth, logout, suspendedReason, dismissSuspension } = useConsumerAuth()

  return (
    <nav className="sticky top-0 z-50 bg-green-900 shadow-lg">
      {/* Logo row */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-green-800 gap-1.5">
        {/* Brand never shrinks. At 390px the right-hand cluster (greeting +
            language toggle + ⚙️) is wide enough to squeeze this block to a few
            pixels, which clipped the name to "Go Gram…". The brand is the one
            thing that must always read in full, so it holds its width and the
            greeting on the right truncates instead. */}
        <Link href="/consumer" className="flex items-center gap-2.5 flex-shrink-0">
          <BrandLogo />
        </Link>

        {/* gap-1.5 rather than gap-2: the Telugu brand is ~30px wider than the
            English one, and the tighter gaps are what keep the row inside
            390px when it is rendered. */}
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Location — beside the greeting. Compact so the top bar stays tidy
              on 390px; the name truncates. */}
          {location && (
            <button
              onClick={location.onClick}
              aria-label={L('Set location', 'లొకేషన్ పెట్టండి')}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-green-100 bg-green-800 active:bg-green-700 rounded-full px-2.5 py-1.5 leading-tight max-w-[104px] min-w-0"
            >
              <span aria-hidden>📍</span>
              <span className="truncate">{location.name || L('Set location', 'లొకేషన్ పెట్టండి')}</span>
            </button>
          )}
          {/* Logged-out users keep a visible Login CTA; once signed in the
              account links live in ⚙️ instead, which buys the brand and
              location back their width — the greeting is now a single line
              under the gear (see RoleMenu), not a pill on this row. */}
          {state.status === 'loading' || consumer ? null : (
            <button
              onClick={openAuth}
              className="text-[11px] font-bold text-green-100 bg-green-800 active:bg-green-700 rounded-full px-3 py-1.5 leading-tight flex-shrink-0"
            >
              {L('Login', 'లాగిన్')}
            </button>
          )}
          {/* Toggle and ⚙️ hold their size — both are already at their minimum
              tappable width, so the location pill is the only thing that gives. */}
          <div className="flex-shrink-0">
            <LanguageToggle />
          </div>
          {/* Account + role switcher — tucked into a ⚙️ menu so consumers see a
              plain shop, and Farmer/Delivery sign-in stays available but out of
              the way (top-right). */}
          <RoleMenu name={consumer?.name ?? null} loggedIn={!!consumer} onLogout={logout} />
        </div>
      </div>

      {/* Suspension banner — shown when this account has been suspended by a
          moderator, surfacing the reason they gave. */}
      {suspendedReason && (
        <div className="bg-red-600 text-white px-4 py-2.5 flex items-start gap-2.5">
          <span className="text-base leading-none mt-0.5" aria-hidden>🚫</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-wide leading-tight">
              {L('Account suspended', 'ఖాతా నిలిపివేయబడింది')}
            </p>
            <p className="text-xs font-medium leading-snug mt-0.5 break-words">{suspendedReason}</p>
          </div>
          <button
            onClick={dismissSuspension}
            aria-label={L('Dismiss', 'కొట్టివేయి')}
            className="text-white/80 active:text-white text-lg leading-none px-1 flex-shrink-0"
          >
            ×
          </button>
        </div>
      )}
    </nav>
  )
}

function RoleMenu({
  name,
  loggedIn,
  onLogout,
}: {
  name: string | null
  loggedIn: boolean
  onLogout: () => Promise<void>
}) {
  const { L } = useLang()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  // A seller who crossed over with the buyer-view switch. They are already
  // signed in on the seller side, so the "log in as farmer" links below would
  // be asking them for a password they have just used — the menu offers the way
  // BACK instead. Read after mount; the cookie is not available during SSR.
  const [buyerViewRole, setBuyerViewRole] = useState<SellerRole | null>(null)
  useEffect(() => { setBuyerViewRole(readBuyerView()) }, [])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  // "Hi! Ravi" — the first word only, and truncated on top of that. A full name
  // ("Veerendra Singampalli") would push the brand and location pill out of a
  // 390px row, and the greeting is there to say who is signed in, not to print
  // the whole name; the menu below still shows it in full.
  const firstName = name?.trim().split(/\s+/)[0] ?? ''

  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      {/* Greeting sits UNDER the ⚙️ rather than beside it: the top row has no
          horizontal room left at 390px (brand + location + toggle + gear), and
          stacking costs ~12px of height that the row can afford. */}
      <div className="flex flex-col items-center gap-0.5">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={L('Settings', 'సెట్టింగ్‌లు')}
          className="text-base leading-none text-green-100 bg-green-800 active:bg-green-700 rounded-full w-8 h-8 flex items-center justify-center"
        >
          <span aria-hidden>⚙️</span>
        </button>
        {loggedIn && firstName && (
          <span className="max-w-[72px] truncate text-[10px] font-bold text-green-100 leading-none">
            {L('Hi!', 'హాయ్!')} {firstName}
          </span>
        )}
      </div>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 text-sm z-50 max-h-[80vh] overflow-y-auto"
        >
          {/* Account block — what used to be the "Hi <name> ▾" pill. */}
          {loggedIn && (
            <>
              <p className="px-4 py-2 text-[11px] text-gray-500 leading-tight border-b border-gray-100 mb-1">
                {L('Logged in as', 'లాగిన్ అయ్యారు')}<br />
                <span className="text-gray-800 font-semibold">{name || L('Consumer', 'కొనుగోలుదారు')}</span>
              </p>
              <Link
                href="/consumer/orders"
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-gray-800 active:bg-gray-100 font-semibold"
              >
                {L('🧾 My orders', 'నా ఆర్డర్లు')}
              </Link>
              <Link
                href="/consumer/complaints"
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-gray-800 active:bg-gray-100"
              >
                {L('🛟 My complaints', 'నా ఫిర్యాదులు')}
              </Link>
              <button
                onClick={() => { setOpen(false); void onLogout() }}
                className="block w-full text-left px-4 py-2.5 text-red-600 active:bg-red-50 font-semibold"
              >
                {L('↪ Log out', 'లాగౌట్')}
              </button>
            </>
          )}
          <p className="px-4 py-2 text-[11px] text-gray-500 leading-tight border-y border-gray-100 my-1">
            {L('Switch role', 'పాత్ర మార్చండి')}
          </p>
          <Link
            href="/consumer"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-gray-800 active:bg-gray-100"
          >
            {L('🛒 Shop as Consumer', 'కొనుగోలుదారుగా')}
          </Link>
          {buyerViewRole ? (
            <Link
              href={sellerDashboardPath(buyerViewRole)}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-gray-800 active:bg-gray-100 font-semibold"
            >
              {buyerViewRole === 'aggregator'
                ? L('↩ Back to my aggregator dashboard', '↩ నా సమీకరణదారు డాష్‌బోర్డ్‌కు')
                : L('↩ Back to my farm dashboard', '↩ నా వ్యవసాయ డాష్‌బోర్డ్‌కు')}
            </Link>
          ) : (
            <Link
              href="/farmer/dashboard"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-gray-800 active:bg-gray-100"
            >
              {L('🧑‍🌾 Login as Farmer', 'రైతుగా లాగిన్')}
            </Link>
          )}
          {/* Next to Farmer, since both are selling roles. Points at the login
              page, NOT /aggregator: this is a "switch role" action, and
              /aggregator resolves to the aggregator dashboard, which bounces a
              signed-in farmer straight back to the farmer dashboard — so the
              menu item looked like it was ignoring the tap. Hidden in buyer
              view, where the single item above is the whole answer. */}
          {!buyerViewRole && (
            <Link
              href="/aggregator/login"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-gray-800 active:bg-gray-100"
            >
              {L('🤝 Login as Aggregator', 'సమీకరణదారుగా లాగిన్')}
            </Link>
          )}
          <Link
            href="/rider"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-gray-800 active:bg-gray-100"
          >
            {L('🛵 Login as Delivery', 'డెలివరీగా లాగిన్')}
          </Link>
        </div>
      )}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import LanguageToggle from '@/components/LanguageToggle'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'

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
          <div className="w-9 h-9 bg-green-700 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-white font-black text-xs">GG</span>
          </div>
          <div className="leading-tight">
            <span className="text-white font-bold text-sm block whitespace-nowrap">{L('Go Grameen', 'గో గ్రామీణ్')}</span>
            <span className="text-green-300 text-[10px] block whitespace-nowrap">{L('Your Family Farmer', 'యువర్ ఫ్యామిలీ ఫార్మర్')}</span>
          </div>
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
          {state.status === 'loading' ? null : consumer ? (
            <ConsumerMenu name={consumer.name} onLogout={logout} />
          ) : (
            <button
              onClick={openAuth}
              className="text-[11px] font-bold text-green-100 bg-green-800 active:bg-green-700 rounded-full px-3 py-1.5 leading-tight min-w-0 truncate"
            >
              {L('Login', 'లాగిన్')}
            </button>
          )}
          {/* Toggle and ⚙️ hold their size — both are already at their minimum
              tappable width, so the greeting is the only thing that gives. */}
          <div className="flex-shrink-0">
            <LanguageToggle />
          </div>
          {/* Role switcher — tucked into a ⚙️ menu so consumers see a plain
              shop, and Farmer/Delivery sign-in stays available but out of the
              way (top-right). */}
          <RoleMenu />
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
            aria-label="Dismiss"
            className="text-white/80 active:text-white text-lg leading-none px-1 flex-shrink-0"
          >
            ×
          </button>
        </div>
      )}
    </nav>
  )
}

function RoleMenu() {
  const { L } = useLang()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

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

  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={L('Settings', 'సెట్టింగ్‌లు')}
        className="text-base leading-none text-green-100 bg-green-800 active:bg-green-700 rounded-full w-8 h-8 flex items-center justify-center"
      >
        <span aria-hidden>⚙️</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 text-sm z-50"
        >
          <p className="px-4 py-2 text-[11px] text-gray-500 leading-tight border-b border-gray-100 mb-1">
            {L('Switch role', 'పాత్ర మార్చండి')}
          </p>
          <Link
            href="/consumer"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-gray-800 active:bg-gray-100"
          >
            {L('🛒 Shop as Consumer', 'కొనుగోలుదారుగా')}
          </Link>
          <Link
            href="/farmer/dashboard"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-gray-800 active:bg-gray-100"
          >
            {L('🧑‍🌾 Login as Farmer', 'రైతుగా లాగిన్')}
          </Link>
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

function ConsumerMenu({ name, onLogout }: { name: string | null; onLogout: () => Promise<void> }) {
  const { L } = useLang()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const firstName = (name ?? '').split(' ')[0] || 'there'

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

  return (
    // min-w-0 lets the greeting be the pill that gives way when the row is
    // tight, so the brand on the left keeps its full width.
    <div ref={wrapRef} className="relative min-w-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-full text-[11px] font-bold text-green-100 bg-green-800 active:bg-green-700 rounded-full px-3 py-1.5 leading-tight max-w-[104px] truncate"
      >
        Hi {firstName} ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 text-sm z-50"
        >
          <p className="px-4 py-2 text-[11px] text-gray-500 leading-tight border-b border-gray-100 mb-1">
            Logged in as<br />
            <span className="text-gray-800 font-semibold">{name || 'Consumer'}</span>
          </p>
          <Link
            href="/consumer/orders"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-gray-800 active:bg-gray-100 font-semibold"
          >
            {L('🧾 My orders', 'నా ఆర్డర్లు')}
          </Link>
          <Link
            href="/consumer"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-gray-800 active:bg-gray-100"
          >
            {L('🛒 Browse', 'కొనుగోలు')}
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
            className="block w-full text-left px-4 py-2.5 text-red-600 active:bg-red-50 font-semibold border-t border-gray-100 mt-1"
          >
            {L('↪ Log out', 'లాగౌట్')}
          </button>
        </div>
      )}
    </div>
  )
}

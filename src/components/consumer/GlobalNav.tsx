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
  activeTab = 'consumer',
  location,
}: {
  activeTab?: ActiveTab
  location?: LocationControl
}) {
  const { tx, L } = useLang()
  const { state, consumer, openAuth, logout, suspendedReason, dismissSuspension } = useConsumerAuth()

  const tabs = [
    { key: 'consumer' as const, href: '/consumer', label: tx.consumerNav },
    { key: 'farmer' as const, href: '/farmer/dashboard', label: tx.farmerNav },
    { key: 'delivery' as const, href: '/rider', label: tx.deliveryNav },
    { key: 'moderator' as const, href: '#', label: tx.moderatorNav, disabled: true },
  ]

  return (
    <nav className="sticky top-0 z-50 bg-green-900 shadow-lg">
      {/* Logo row */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-green-800 gap-2">
        <Link href="/consumer" className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 bg-green-700 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-white font-black text-xs">GG</span>
          </div>
          <div className="leading-tight min-w-0">
            <span className="text-white font-bold text-sm block truncate">{L('Go Grameen', 'గో గ్రామీణ్')}</span>
            <span className="text-green-300 text-[10px] block truncate">{L('Your Family Farmer', 'యువర్ ఫ్యామిలీ ఫార్మర్')}</span>
          </div>
        </Link>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Location — beside the greeting. Compact so the top bar stays tidy
              on 390px; the name truncates. */}
          {location && (
            <button
              onClick={location.onClick}
              aria-label={L('Set location', 'లొకేషన్ పెట్టండి')}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-green-100 bg-green-800 active:bg-green-700 rounded-full px-2.5 py-1.5 leading-tight max-w-[104px]"
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
              className="text-[11px] font-bold text-green-100 bg-green-800 active:bg-green-700 rounded-full px-3 py-1.5 leading-tight"
            >
              {L('Login', 'లాగిన్')}
            </button>
          )}
          <LanguageToggle />
        </div>
      </div>

      {/* Role tabs */}
      <div className="flex">
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab

          if (tab.disabled) {
            return (
              <span key={tab.key} className="flex-1 text-center py-2.5 text-xs text-green-700 font-medium">
                {tab.label}
              </span>
            )
          }

          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`flex-1 text-center py-2.5 text-xs font-bold transition-colors ${
                isActive
                  ? 'bg-green-700 text-white border-b-2 border-green-300'
                  : 'text-green-300 hover:text-white'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
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
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-[11px] font-bold text-green-100 bg-green-800 active:bg-green-700 rounded-full px-3 py-1.5 leading-tight max-w-[104px] truncate"
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

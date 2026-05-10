'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import LanguageToggle from '@/components/LanguageToggle'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'

type ActiveTab = 'consumer' | 'farmer' | 'delivery' | 'moderator'

export default function GlobalNav({ activeTab = 'consumer' }: { activeTab?: ActiveTab }) {
  const { tx } = useLang()
  const { state, consumer, openAuth, logout } = useConsumerAuth()

  const tabs = [
    { key: 'consumer' as const, href: '/consumer', label: tx.consumerNav },
    { key: 'farmer' as const, href: '/farmer/dashboard', label: tx.farmerNav },
    { key: 'delivery' as const, href: '#', label: tx.deliveryNav, disabled: true },
    { key: 'moderator' as const, href: '#', label: tx.moderatorNav, disabled: true },
  ]

  return (
    <nav className="sticky top-0 z-50 bg-green-900 shadow-lg">
      {/* Logo row */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-green-800 gap-2">
        <Link href="/consumer" className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 bg-green-700 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-white font-black text-xs">YFF</span>
          </div>
          <div className="leading-tight min-w-0">
            <span className="text-white font-bold text-sm block truncate">YourFamilyFarmer</span>
            <span className="text-green-400 text-[11px] block truncate">యువర్ ఫ్యామిలీ ఫార్మర్</span>
          </div>
        </Link>

        <div className="flex items-center gap-2 flex-shrink-0">
          {state.status === 'loading' ? null : consumer ? (
            <ConsumerMenu name={consumer.name} onLogout={logout} />
          ) : (
            <button
              onClick={openAuth}
              className="text-[11px] font-bold text-green-100 bg-green-800 active:bg-green-700 rounded-full px-3 py-1.5 leading-tight"
            >
              Login / లాగిన్
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
    </nav>
  )
}

function ConsumerMenu({ name, onLogout }: { name: string | null; onLogout: () => Promise<void> }) {
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
        className="text-[11px] font-bold text-green-100 bg-green-800 active:bg-green-700 rounded-full px-3 py-1.5 leading-tight max-w-[140px] truncate"
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
            🧾 My orders / నా ఆర్డర్లు
          </Link>
          <Link
            href="/consumer"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-gray-800 active:bg-gray-100"
          >
            🛒 Browse / కొనుగోలు
          </Link>
          <button
            onClick={() => { setOpen(false); void onLogout() }}
            className="block w-full text-left px-4 py-2.5 text-red-600 active:bg-red-50 font-semibold border-t border-gray-100 mt-1"
          >
            ↪ Log out / లాగౌట్
          </button>
        </div>
      )}
    </div>
  )
}

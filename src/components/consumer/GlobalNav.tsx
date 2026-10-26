'use client'

import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'
import LanguageToggle from '@/components/LanguageToggle'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import BrandLogo from '@/components/BrandLogo'

type ActiveTab = 'consumer' | 'farmer' | 'delivery' | 'moderator'

// Optional location control shown in the top bar (right side). Only the consumer browse page passes it; other pages omit it.
type LocationControl = { name: string; onClick: () => void }

export default function GlobalNav({
  location,
}: {
  // Kept for backward-compat with callers that still pass it; it no longer
  // drives any highlight.
  activeTab?: ActiveTab
  location?: LocationControl
}) {
  const { L } = useLang()
  const { state, consumer, openAuth, suspendedReason, dismissSuspension } = useConsumerAuth()

  return (
    <nav className="sticky top-0 z-50 bg-green-900 shadow-lg">
      {/* Logo row */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-green-800 gap-1.5">
        {/* Brand never shrinks: at 390px it must always read in full. */}
        <Link href="/consumer" className="flex items-center gap-2.5 flex-shrink-0">
          <BrandLogo />
        </Link>

        {/* gap-1.5 rather than gap-2: the Telugu brand is ~30px wider than the
            English one, and the tighter gaps are what keep the row inside
            390px when it is rendered. */}
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Location. Compact so the top bar stays tidy
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
          {/* Logged-out users get a Login button. Once signed in, the account
              links (orders, address, complaints, log out, switch role) live on
              the bottom bar's Settings tab — no second menu up here. */}
          {state.status === 'loading' || consumer ? null : (
            <button
              onClick={openAuth}
              className="text-[11px] font-bold text-green-100 bg-green-800 active:bg-green-700 rounded-full px-3 py-1.5 leading-tight flex-shrink-0"
            >
              {L('Login', 'లాగిన్')}
            </button>
          )}
          <div className="flex-shrink-0">
            <LanguageToggle />
          </div>
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

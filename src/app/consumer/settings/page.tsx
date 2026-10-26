'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import LanguageToggle from '@/components/LanguageToggle'
import DefaultDashboardSetting from '@/components/DefaultDashboardSetting'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { useLang } from '@/lib/LanguageContext'
import { readBuyerView, sellerDashboardPath, type SellerRole } from '@/lib/buyerView'
import BackButton from '@/components/BackButton'

// The bottom bar's Settings tab — the one place for account things: the Account
// button (name, phone, saved address), language, requests, complaints, the
// default dashboard, switch role, log out. Order history is not here: it is the
// History tab on the Orders page.
export default function ConsumerSettingsPage() {
  const { L } = useLang()
  const { state, consumer, openAuth, logout } = useConsumerAuth()
  const loggedIn = state.status === 'authenticated'

  // A seller in buyer view goes BACK to their dashboard rather than being asked
  // to log in as a farmer again. Cookie read after mount (not there in SSR).
  const [sellerRole, setSellerRole] = useState<SellerRole | null>(null)
  useEffect(() => { setSellerRole(readBuyerView()) }, [])

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-green-900 px-4 pt-6 pb-12">
        <BackButton fallback="/consumer" />
        <h1 className="text-white text-xl font-extrabold leading-tight mt-4">⚙️ {L('Settings', 'సెట్టింగ్‌లు')}</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-7 space-y-4">
        {/* Account */}
        {loggedIn ? (
          <Link
            href="/consumer/profile"
            className="flex items-center gap-3 bg-white rounded-2xl shadow-md p-4 active:scale-[0.98] transition-transform"
          >
            <span className="w-12 h-12 rounded-full bg-green-700 text-white flex items-center justify-center text-xl font-extrabold flex-shrink-0">
              {(consumer?.name?.trim()?.[0] ?? '👤').toUpperCase()}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-extrabold text-gray-900">{L('Account', 'ఖాతా')}</span>
              <span className="block text-xs text-gray-500 truncate">
                {consumer?.name ?? ''}{consumer?.phone ? ` · +91 ${consumer.phone}` : ''}
              </span>
              <span className="block text-[11px] text-green-700 font-semibold mt-0.5">{L('Name, phone & delivery address', 'పేరు, ఫోన్ & డెలివరీ చిరునామా')}</span>
            </span>
            <span className="text-gray-300 text-xl leading-none">›</span>
          </Link>
        ) : (
          <div className="bg-white rounded-2xl shadow-md p-4 flex items-center gap-3">
            <span className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-xl flex-shrink-0" aria-hidden>👤</span>
            <span className="flex-1 text-sm text-gray-600 leading-snug">{L('Log in to see your account and orders.', 'మీ ఖాతా, ఆర్డర్లు చూడటానికి లాగిన్ అవ్వండి.')}</span>
            <button onClick={() => openAuth()} className="bg-green-700 text-white text-sm font-bold rounded-xl px-4 py-2.5 flex-shrink-0">
              {L('Log in', 'లాగిన్')}
            </button>
          </div>
        )}

        {/* General */}
        <Group>
          <div className="flex items-center gap-3 px-4 py-3">
            <span aria-hidden>🌐</span>
            <span className="flex-1 text-sm font-semibold text-gray-800">{L('Language', 'భాష')}</span>
            <LanguageToggle variant="light" />
          </div>
          {loggedIn && (
            <>
              <Row href="/consumer/intents" icon="📣" label={L('My crop requests', 'నా పంట అభ్యర్థనలు')} />
              <Row href="/consumer/complaints" icon="🛟" label={L('My complaints', 'నా ఫిర్యాదులు')} />
              <div className="px-4 py-3">
                <DefaultDashboardSetting />
              </div>
            </>
          )}
        </Group>

        {/* Switch role */}
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide px-1 mb-1.5">{L('Switch role', 'పాత్ర మార్చండి')}</p>
          <Group>
            {sellerRole ? (
              <Row
                href={sellerDashboardPath(sellerRole)}
                icon="↩"
                label={sellerRole === 'aggregator'
                  ? L('Back to my aggregator dashboard', 'నా సమీకరణదారు డాష్‌బోర్డ్‌కు')
                  : L('Back to my farm dashboard', 'నా వ్యవసాయ డాష్‌బోర్డ్‌కు')}
              />
            ) : (
              <>
                <Row href="/farmer/dashboard" icon="🧑‍🌾" label={L('Login as Farmer', 'రైతుగా లాగిన్')} />
                <Row href="/aggregator/login" icon="🤝" label={L('Login as Aggregator', 'సమీకరణదారుగా లాగిన్')} />
              </>
            )}
            <Row href="/rider" icon="🛵" label={L('Login as Delivery', 'డెలివరీగా లాగిన్')} />
          </Group>
        </div>

        {loggedIn && (
          <button
            onClick={() => void logout()}
            className="w-full bg-white rounded-2xl shadow-sm px-4 py-3.5 text-sm font-bold text-red-600 active:bg-red-50 text-left"
          >
            ↪ {L('Log out', 'లాగౌట్')}
          </button>
        )}
      </div>
    </main>
  )
}

function Group({ children }: { children: ReactNode }) {
  return <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100 overflow-hidden">{children}</div>
}

function Row({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 text-sm font-semibold text-gray-800 active:bg-gray-50">
      <span aria-hidden className="w-5 text-center">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="text-gray-300 text-lg leading-none">›</span>
    </Link>
  )
}

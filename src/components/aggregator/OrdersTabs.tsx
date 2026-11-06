'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'

/* For aggregators, the bottom menu's Orders covers both sides (client,
 * 2026-11-06 — the "My bulk orders" button left the bulk market):
 *   Orders received  /farmer/dashboard/orders   what buyers ordered from them
 *   My bulk orders   /aggregator/purchases      bulk lots they bought
 * Farmers never buy in bulk, so on the orders page the tabs show only once
 * the seller's own profile says aggregator; the purchases page always shows
 * them (only aggregators reach it). */

export default function AggregatorOrdersTabs({ active, alwaysShow = false }: { active: 'received' | 'bought'; alwaysShow?: boolean }) {
  const { L } = useLang()
  const [isAggregator, setIsAggregator] = useState(alwaysShow)

  useEffect(() => {
    if (alwaysShow) return
    let cancelled = false
    fetch('/api/farmer/profile', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.farmer?.account_type === 'aggregator') setIsAggregator(true) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [alwaysShow])

  if (!isAggregator) return null
  const tab = (on: boolean) =>
    `flex-1 min-h-[44px] rounded-xl px-2 text-center text-sm font-bold flex items-center justify-center ${on ? 'bg-white text-gray-900 shadow-sm' : 'text-white/85 active:bg-white/10'}`
  return (
    <nav aria-label={L('Orders', 'ఆర్డర్లు')} className="mt-4 flex gap-1 rounded-2xl bg-black/20 p-1">
      <Link href="/farmer/dashboard/orders" aria-current={active === 'received' ? 'page' : undefined} className={tab(active === 'received')}>
        {L('Orders received', 'వచ్చిన ఆర్డర్లు')}
      </Link>
      <Link href="/aggregator/purchases" aria-current={active === 'bought' ? 'page' : undefined} className={tab(active === 'bought')}>
        {L('My bulk orders', 'నా బల్క్ ఆర్డర్లు')}
      </Link>
    </nav>
  )
}

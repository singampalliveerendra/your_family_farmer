'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { useLang } from '@/lib/LanguageContext'
import { fetchPendingOrderCount } from '@/lib/pendingOrderCount'

export default function MyOrdersChip() {
  const { L } = useLang()
  const { state } = useConsumerAuth()
  const [pending, setPending] = useState<number | null>(null)

  useEffect(() => {
    if (state.status !== 'authenticated') {
      setPending(null)
      return
    }
    let cancelled = false
    // Shared with the bottom bar's Orders badge — one request for both.
    fetchPendingOrderCount().then((n) => { if (!cancelled) setPending(n) })
    return () => { cancelled = true }
  }, [state.status])

  if (state.status !== 'authenticated') return null

  return (
    <Link
      href="/consumer/orders"
      className="relative inline-flex items-center gap-2 bg-white text-green-900 font-bold text-sm rounded-full px-4 py-2 shadow-md active:bg-gray-100"
    >
      {L('🧾 My orders', 'నా ఆర్డర్లు')}
      {pending !== null && pending > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1.5 bg-red-600 text-white text-[11px] font-extrabold rounded-full flex items-center justify-center leading-none">
          {pending > 99 ? '99+' : pending}
        </span>
      )}
    </Link>
  )
}

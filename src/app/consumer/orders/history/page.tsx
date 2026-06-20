'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'
import LanguageToggle from '@/components/LanguageToggle'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import ComplaintModal from '@/components/consumer/ComplaintModal'
import OrderCard, { ConsumerOrder as Order, isResolved } from '@/components/consumer/OrderCard'

export default function ConsumerOrderHistoryPage() {
  const { tx, L } = useLang()
  const { state, openAuth } = useConsumerAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Order code the complaint modal is pinned to ('' means a general complaint
  // with no preset). null means the modal is closed.
  const [complaintFor, setComplaintFor] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    const r = await fetch('/api/consumer/orders', { credentials: 'same-origin' }).catch(() => null)
    if (!r) { setError('Could not load orders. Check your connection.'); setLoading(false); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load orders.'); setLoading(false); return }
    setOrders((json.orders ?? []) as Order[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (state.status === 'authenticated') {
      void refresh()
    } else if (state.status === 'anonymous') {
      setLoading(false)
    }
  }, [state.status, refresh])

  // Resolved orders only — delivered / picked up / received / declined /
  // cancelled. Active ones stay on /consumer/orders.
  const completedOrders = orders.filter(isResolved)
  const activeCount = orders.length - completedOrders.length

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-green-900 px-4 pt-6 pb-10">
        <div className="flex items-center justify-between mb-4">
          <Link href="/consumer/orders" className="text-green-300 text-sm flex items-center gap-1">
            {L('← Back to orders', '← ఆర్డర్‌లకు తిరిగి')}
          </Link>
          <LanguageToggle />
        </div>
        <h1 className="text-white text-xl font-extrabold leading-tight">
          {L('Order history', 'ఆర్డర్ చరిత్ర')}
        </h1>
        <p className="text-green-400 text-sm mt-1">
          {L('Completed, picked up & cancelled orders', 'పూర్తయిన, తీసుకున్న & రద్దు చేసిన ఆర్డర్‌లు')}
        </p>
      </div>

      <div className="px-4 -mt-5 space-y-4 max-w-lg mx-auto">
        {/* Active | History switcher — mirrors the active orders page. */}
        {state.status === 'authenticated' && !error && (
          <div className="bg-white rounded-2xl border border-gray-100 p-1.5 flex gap-1.5">
            <Link
              href="/consumer/orders"
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-center bg-gray-50 text-gray-600 active:bg-gray-100"
            >
              {L('Active', 'ప్రస్తుత')}{activeCount > 0 ? ` (${activeCount})` : ''}
            </Link>
            <span className="flex-1 py-2.5 rounded-xl text-xs font-bold text-center bg-green-700 text-white">
              {L('History', 'చరిత్ర')} ({completedOrders.length})
            </span>
          </div>
        )}

        {state.status === 'loading' || loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-500">
            {L('Loading...', 'లోడ్ అవుతోంది')}
          </div>
        ) : state.status === 'anonymous' ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center space-y-4">
            <div className="text-5xl">🔒</div>
            <div>
              <p className="font-bold text-gray-900">
                {L('Log in to see your orders', 'మీ ఆర్డర్‌లు చూడటానికి లాగిన్ అవ్వండి')}
              </p>
            </div>
            <button
              onClick={openAuth}
              className="w-full bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm active:bg-green-800"
            >
              {L('Log in', 'లాగిన్')}
            </button>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-red-100 p-6 space-y-3">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => void refresh()}
              className="text-sm font-bold text-green-700 underline"
            >
              {L('Try again', 'మళ్లీ ప్రయత్నించండి')}
            </button>
          </div>
        ) : completedOrders.length === 0 ? (
          <div className="text-center py-14">
            <div className="text-5xl mb-3">📦</div>
            <p className="font-semibold text-gray-500 text-sm">
              {L('No completed orders yet', 'పూర్తయిన ఆర్డర్‌లు లేవు')}
            </p>
            <Link href="/consumer/orders" className="mt-4 inline-block text-green-700 text-sm underline font-semibold">
              {L('← Active orders', '← ప్రస్తుత ఆర్డర్‌లు')}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {completedOrders.map((order) => (
              <OrderCard key={order.id} order={order} onComplaint={setComplaintFor} />
            ))}
          </div>
        )}
      </div>

      {complaintFor !== null && (
        <ComplaintModal
          presetOrderCode={complaintFor || null}
          onClose={() => setComplaintFor(null)}
          onCreated={() => setComplaintFor(null)}
        />
      )}
    </main>
  )
}

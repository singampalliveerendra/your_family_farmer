'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'
import LanguageToggle from '@/components/LanguageToggle'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import ComplaintModal from '@/components/consumer/ComplaintModal'
import OrderFeedbackModal from '@/components/consumer/OrderFeedbackModal'
import OrderCard, { ConsumerOrder as Order, isResolved, isCompleted } from '@/components/consumer/OrderCard'
import CancelOrderModal, { CancelSuccessSheet } from '@/components/consumer/CancelOrderModal'

export default function ConsumerOrdersPage() {
  const { tx, L } = useLang()
  const { state, openAuth } = useConsumerAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Order code the complaint modal is pinned to ('' means a general complaint
  // with no preset). null means the modal is closed.
  const [complaintFor, setComplaintFor] = useState<string | null>(null)
  // Order the feedback sheet is open for (null = closed).
  const [feedbackFor, setFeedbackFor] = useState<Order | null>(null)
  // Order id currently mid-request (acknowledge / confirm receipt).
  const [busyId, setBusyId] = useState<string | null>(null)
  // Order the cancel-reason modal is open for (null = closed) + its busy flag.
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  // After a successful cancel, show the animated confirmation with the refund
  // breakdown (the platform fee is withheld on a buyer cancel).
  const [cancelledInfo, setCancelledInfo] = useState<{ wasPaid: boolean; refundAmount?: number; platformFeeWithheld?: number; refundFailed?: boolean; depositForfeited?: number } | null>(null)

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

  // Buyer acknowledges a farmer-declined order — moves it to history.
  const acknowledge = useCallback(async (order: Order) => {
    setBusyId(order.id)
    const r = await fetch(`/api/consumer/orders/${order.id}/acknowledge`, {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => null)
    if (r && r.ok) await refresh()
    else alert(L('Could not update. Please try again.', 'నవీకరించలేకపోయాం. మళ్ళీ ప్రయత్నించండి.'))
    setBusyId(null)
  }, [refresh, L])

  // Buyer confirms a shipped order was delivered/received — moves it to history.
  const confirmReceipt = useCallback(async (order: Order) => {
    if (!window.confirm(L('Confirm you received this order?', 'మీరు ఈ ఆర్డర్‌ను అందుకున్నారా?'))) return
    setBusyId(order.id)
    const r = await fetch(`/api/consumer/orders/${order.id}/received`, {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => null)
    if (r && r.ok) await refresh()
    else alert(L('Could not confirm. Please try again.', 'ధృవీకరించలేకపోయాం. మళ్ళీ ప్రయత్నించండి.'))
    setBusyId(null)
  }, [refresh, L])

  // Buyer cancels a still-pending order with an optional reason. On success the
  // order becomes 'cancelled' (and any paid amount is refunded by the backend),
  // then it surfaces on the farmer's dashboard for them to acknowledge.
  const cancelOrder = useCallback(async (reason: string) => {
    if (!cancellingOrder) return
    setCancelBusy(true)
    const r = await fetch(`/api/consumer/orders/${cancellingOrder.id}/cancel`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }).catch(() => null)
    const json = r ? await r.json().catch(() => ({})) : null
    if (r && r.ok) {
      // A paid order is refunded automatically — drives the refund note.
      const wasPaid = ['paid', 'completed', 'payment_claimed', 'pending_confirmation'].includes(
        cancellingOrder.payment_status ?? '',
      )
      setCancellingOrder(null)
      setCancelledInfo({
        wasPaid,
        refundAmount: typeof json?.refundAmount === 'number' ? json.refundAmount : undefined,
        platformFeeWithheld: typeof json?.platformFeeWithheld === 'number' ? json.platformFeeWithheld : undefined,
        refundFailed: json?.refundFailed === true,
        // Cancelling a part-paid COD order costs the buyer their deposit. Say so
        // — they must never discover it from a bank statement.
        depositForfeited: typeof json?.depositForfeited === 'number' && json.depositForfeited > 0
          ? json.depositForfeited
          : undefined,
      })
      await refresh()
    } else {
      alert(json?.error ?? L('Could not cancel. Please try again.', 'రద్దు చేయలేకపోయాం. మళ్ళీ ప్రయత్నించండి.'))
    }
    setCancelBusy(false)
  }, [cancellingOrder, refresh, L])

  // Active orders only — resolved ones (delivered / picked up / received, or an
  // acknowledged decline / cancel) live on the separate history page. A declined
  // or cancelled order that's NOT yet acknowledged stays here so the buyer sees it.
  const activeOrders = orders.filter((o) => !isResolved(o))
  const completedCount = orders.length - activeOrders.length

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-green-900 px-4 pt-6 pb-10">
        <div className="flex items-center justify-between mb-4">
          <Link href="/consumer" className="text-green-300 text-sm flex items-center gap-1">
            {L('← Back', '← వెనక్కు')}
          </Link>
          <LanguageToggle />
        </div>
        <h1 className="text-white text-xl font-extrabold leading-tight">{tx.myOrders}</h1>
        <p className="text-green-400 text-sm mt-1">
          {L('Your orders in progress', 'మీ ప్రస్తుత ఆర్డర్‌లు')}
        </p>
      </div>

      <div className="px-4 -mt-5 space-y-4 max-w-lg mx-auto">
        {/* Active | History switcher — two separate pages, shown side by side
            so finished orders are one tap away without cluttering this list. */}
        {state.status === 'authenticated' && !error && (
          <div className="bg-white rounded-2xl border border-gray-100 p-1.5 flex gap-1.5">
            <span className="flex-1 py-2.5 rounded-xl text-xs font-bold text-center bg-green-700 text-white">
              {L('Active', 'ప్రస్తుత')} ({activeOrders.length})
            </span>
            <Link
              href="/consumer/orders/history"
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-center bg-gray-50 text-gray-600 active:bg-gray-100"
            >
              {L('History', 'చరిత్ర')}{completedCount > 0 ? ` (${completedCount})` : ''}
            </Link>
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
        ) : orders.length === 0 ? (
          <div className="text-center py-14">
            <div className="text-5xl mb-3">📭</div>
            <p className="font-semibold text-gray-500 text-sm">{tx.noOrdersYet}</p>
            <Link href="/consumer" className="mt-4 inline-block text-green-700 text-sm underline font-semibold">
              {L('Browse harvests →', 'కోతలు చూడండి →')}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {activeOrders.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-2">🧺</div>
                <p className="font-semibold text-gray-500 text-sm">
                  {L('No active orders', 'ప్రస్తుత ఆర్డర్‌లు లేవు')}
                </p>
                <Link href="/consumer" className="mt-3 inline-block text-green-700 text-sm underline font-semibold">
                  {L('Browse harvests →', 'కోతలు చూడండి →')}
                </Link>
              </div>
            ) : (
              activeOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onComplaint={setComplaintFor}
                  onFeedback={setFeedbackFor}
                  onAcknowledge={acknowledge}
                  onConfirmReceipt={confirmReceipt}
                  onCancel={setCancellingOrder}
                  busy={busyId === order.id}
                />
              ))
            )}
          </div>
        )}

        <Link
          href="/consumer/complaints"
          className="mt-6 block text-center text-xs font-semibold text-green-700 underline"
        >
          🛟 {L('My complaints', 'నా ఫిర్యాదులు')}
        </Link>

        <Link
          href="/buyer-protection"
          className="mt-3 block text-center text-xs font-semibold text-green-700 underline"
        >
          🔒 {L('Buyer protection & refund policy', 'కొనుగోలుదారు రక్షణ & రీఫండ్ విధానం')}
        </Link>
      </div>

      {complaintFor !== null && (
        <ComplaintModal
          presetOrderCode={complaintFor || null}
          onClose={() => setComplaintFor(null)}
          onCreated={() => setComplaintFor(null)}
        />
      )}

      {feedbackFor && (
        <OrderFeedbackModal
          orderId={feedbackFor.id}
          produceName={feedbackFor.produce_name}
          completed={isCompleted(feedbackFor)}
          existing={feedbackFor.my_review ?? null}
          onClose={() => setFeedbackFor(null)}
          onSaved={() => { setFeedbackFor(null); void refresh() }}
        />
      )}

      {cancellingOrder && (
        <CancelOrderModal
          order={cancellingOrder}
          cancelling={cancelBusy}
          onClose={() => setCancellingOrder(null)}
          onConfirm={cancelOrder}
        />
      )}

      {cancelledInfo && (
        <CancelSuccessSheet
          wasPaid={cancelledInfo.wasPaid}
          refundAmount={cancelledInfo.refundAmount}
          platformFeeWithheld={cancelledInfo.platformFeeWithheld}
          refundFailed={cancelledInfo.refundFailed}
          depositForfeited={cancelledInfo.depositForfeited}
          onClose={() => setCancelledInfo(null)}
        />
      )}
    </main>
  )
}

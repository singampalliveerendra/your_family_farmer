'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'
import OrderCard, { type FarmerOrder as Order, isResolved } from '@/components/farmer/OrderCard'
import { DeclineReasonSheet, DeclineSuccessSheet } from '@/components/farmer/DeclineSheets'
import { ordersInReportWindow } from '@/lib/orderReport'
import OrderReportSheet from '@/components/farmer/OrderReportSheet'

type StatusFilter = 'all' | 'pending' | 'approved' | 'shipped' | 'completed' | 'declined' | 'cancelled'
type TimeFilter = 'today' | 'week' | 'month' | 'all'

// An order the farmer can still act on (approve/decline, mark picked-up/shipped,
// or acknowledge a buyer cancellation). Everything else is terminal history.
function isActionable(o: Order): boolean {
  if (o.status === 'pending') return true
  if (o.status === 'approved') return !isResolved(o)
  if (o.status === 'cancelled') return !o.acknowledged_at
  return false // declined is always terminal
}

// Which status bucket an order belongs to (drives the status filter chips).
function bucketOf(o: Order): Exclude<StatusFilter, 'all'> {
  if (o.status === 'pending') return 'pending'
  if (o.status === 'declined') return 'declined'
  if (o.status === 'cancelled') return 'cancelled'
  // approved: resolved (collected / received / delivered) → completed; shipped
  // (farmer marked it shipped, buyer hasn't confirmed yet) → shipped; otherwise
  // it's approved-and-awaiting dispatch.
  if (isResolved(o)) return 'completed'
  if (o.shipped_at) return 'shipped'
  return 'approved'
}

function OrdersPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { tx, L } = useLang()
  const [orders, setOrders] = useState<Order[]>([])
  const [farmerId, setFarmerId] = useState<string | null>(null)
  const [farmerName, setFarmerName] = useState<string>('')
  const [showReport, setShowReport] = useState(false)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null)
  const [processingPaidId, setProcessingPaidId] = useState<string | null>(null)
  const [decliningOrder, setDecliningOrder] = useState<Order | null>(null)
  const [declineResult, setDeclineResult] = useState<
    { buyerName: string | null; amount: number | null; refundInitiated: boolean } | null
  >(null)

  // Honour ?status=<bucket> and ?time=<window> deep links from the dashboard
  // (e.g. the pending banner opens ?status=pending; the "My order details" card
  // opens ?time=today).
  useEffect(() => {
    const s = searchParams.get('status')
    if (s && ['pending', 'approved', 'shipped', 'completed', 'declined', 'cancelled'].includes(s)) {
      setStatusFilter(s as StatusFilter)
    }
    const t = searchParams.get('time')
    if (t && ['today', 'week', 'month', 'all'].includes(t)) {
      setTimeFilter(t as TimeFilter)
    }
  }, [searchParams])

  // Silent refresh keeps the spinner only for the very first load.
  const load = useCallback(async (silent = false) => {
    const farmerId = localStorage.getItem('yff_farmer_id')
    if (!farmerId) { router.replace('/farmer/login'); return }
    setFarmerId(farmerId)

    if (!silent) setLoading(true)
    // Explicit columns: handover_otp is deliberately NOT fetched — the pickup
    // code must come from the customer, so the farmer's browser never sees it.
    // Every status is fetched (this page is the full orders hub).
    const { data } = await supabase
      .from('orders')
      .select('id, farmer_id, order_code, produce_listing_id, produce_name, quantity, unit, total_price, buyer_name, buyer_phone, pickup_location, status, payment_method, payment_status, utr_number, decline_reason, refund_status, refund_amount, refunded_at, delivery_type, delivery_status, delivery_boy_id, collected_at, shipped_at, received_at, fulfillment_date, created_at, acknowledged_at')
      .eq('farmer_id', farmerId)
      .order('created_at', { ascending: false })

    setOrders((data ?? []) as Order[])
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  // Farmer name for the PDF report header (fetched once when we know the id).
  useEffect(() => {
    if (!farmerId) return
    let active = true
    void supabase
      .from('farmers')
      .select('name')
      .eq('id', farmerId)
      .single()
      .then(({ data }) => { if (active && data?.name) setFarmerName(data.name) })
    return () => { active = false }
  }, [farmerId])


  // Keep this page live: a buyer can cancel after it loaded. Without this the
  // farmer would keep seeing the order as actionable — and could approve/ship a
  // cancelled order — until a manual refresh. Refetch (silently) on any order
  // change for this farmer, and whenever the tab regains focus as a safety net
  // for dropped websockets on spotty 4G.
  useEffect(() => {
    if (!farmerId) return
    const channel = supabase
      .channel(`farmer_orders_page_${farmerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `farmer_id=eq.${farmerId}` },
        () => { void load(true) },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [farmerId, load])

  useEffect(() => {
    const refetch = () => { if (document.visibilityState === 'visible') void load(true) }
    document.addEventListener('visibilitychange', refetch)
    window.addEventListener('focus', refetch)
    return () => {
      document.removeEventListener('visibilitychange', refetch)
      window.removeEventListener('focus', refetch)
    }
  }, [load])

  /* ─── Order actions (mirror the dashboard) ─────────────────── */

  // Farmer sets/updates the pickup-or-delivery date on an order. When the date
  // is changed on an already-approved order, a reason is passed and stored so
  // the buyer can see why it moved.
  const handleSetFulfillmentDate = async (orderId: string, date: string, reason?: string) => {
    const value = date || null
    setOrders((prev) => prev.map((o) => (o.id === orderId
      ? { ...o, fulfillment_date: value, ...(reason ? { reschedule_reason: reason } : {}) }
      : o)))
    // Date first — this always succeeds.
    await supabase.from('orders').update({ fulfillment_date: value }).eq('id', orderId)
    // Reason is best-effort: the reschedule_reason / rescheduled_at columns may
    // not exist until scripts/reschedule-reason-migration.sql is applied, so a
    // missing column must never block the date change itself.
    if (reason) {
      await supabase.from('orders')
        .update({ reschedule_reason: reason, rescheduled_at: new Date().toISOString() })
        .eq('id', orderId)
    }
  }

  // Approving requires a pickup/delivery date; the order then stays as approved
  // until it's picked up / delivered.
  const handleApprove = async (orderId: string, date: string) => {
    if (!date) return
    setProcessingOrderId(orderId)
    // Guard on status='pending': if the buyer cancelled (or the order was
    // declined) since this list loaded, the update matches 0 rows so we never
    // resurrect a cancelled/declined order into 'approved'. Re-sync and tell the
    // farmer instead of silently flipping it back to active.
    const { data, error } = await supabase
      .from('orders')
      .update({ status: 'approved', fulfillment_date: date, confirmed_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('status', 'pending')
      .select('id')
    if (error || !data?.length) {
      await load(true)
      setProcessingOrderId(null)
      alert(L('This order can no longer be approved — the buyer may have cancelled it.', 'ఈ ఆర్డర్‌ను ఇప్పుడు ఆమోదించలేరు — కొనుగోలుదారు రద్దు చేసి ఉండవచ్చు.'))
      return
    }
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'approved', fulfillment_date: date } : o)),
    )
    setProcessingOrderId(null)
  }

  // Courier / farmer-driven home delivery: the farmer marks it Shipped (trust-
  // based dispatch, no code). Stamps shipped_at; the order stays active until the
  // buyer confirms delivery from their own order page.
  const handleMarkShipped = async (orderId: string) => {
    setProcessingOrderId(orderId)
    try {
      const res = await fetch(`/api/farmer/orders/${orderId}/ship`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { alert(json.error || L('Could not mark shipped. Please try again.', 'షిప్ చేయడం సాధ్యం కాలేదు. మళ్ళీ ప్రయత్నించండి.')); return }
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, shipped_at: json.shipped_at ?? new Date().toISOString() } : o)))
    } catch {
      alert(L('Network error. Please try again.', 'నెట్‌వర్క్ సమస్య. మళ్ళీ ప్రయత్నించండి.'))
    } finally {
      setProcessingOrderId(null)
    }
  }

  // Farmer acknowledges a buyer-cancelled order (stamps acknowledged_at).
  const handleAcknowledgeCancel = async (orderId: string) => {
    setProcessingOrderId(orderId)
    try {
      const res = await fetch(`/api/farmer/orders/${orderId}/acknowledge`, { method: 'POST', credentials: 'same-origin' })
      if (res.ok) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, acknowledged_at: new Date().toISOString() } : o)))
      } else {
        const json = await res.json().catch(() => ({}))
        alert(json.error || L('Could not update. Please try again.', 'నవీకరించలేకపోయాం. మళ్ళీ ప్రయత్నించండి.'))
      }
    } catch {
      alert(L('Network error. Please try again.', 'నెట్‌వర్క్ సమస్య. మళ్ళీ ప్రయత్నించండి.'))
    } finally {
      setProcessingOrderId(null)
    }
  }

  const handleConfirmDecline = async (orderId: string, reason: string) => {
    const declined = decliningOrder
    setProcessingOrderId(orderId)
    try {
      const res = await fetch(`/api/farmer/orders/${orderId}/decline`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || L('Could not decline the order. Please try again.', 'ఆర్డర్ తిరస్కరించలేకపోయాం. మళ్ళీ ప్రయత్నించండి.'))
        return
      }
      const refundInitiated = !!json.refunded || !!json.refundStatus
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: 'declined',
                decline_reason: reason,
                refund_status: refundInitiated ? (o.refund_status ?? 'initiated') : o.refund_status,
                refund_amount: refundInitiated ? (o.refund_amount ?? o.total_price ?? null) : o.refund_amount,
              }
            : o,
        ),
      )
      setDeclineResult({
        buyerName: declined?.buyer_name ?? null,
        amount: declined?.total_price ?? null,
        refundInitiated,
      })
      setDecliningOrder(null)
    } catch {
      alert(L('Network error. Please try again.', 'నెట్‌వర్క్ సమస్య. మళ్ళీ ప్రయత్నించండి.'))
    } finally {
      setProcessingOrderId(null)
    }
  }

  const handleMarkPaid = async (orderId: string) => {
    setProcessingPaidId(orderId)
    await supabase.from('orders').update({ payment_status: 'completed', paid_at: new Date().toISOString() }).eq('id', orderId)
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, payment_status: 'completed' } : o)))
    setProcessingPaidId(null)
  }

  const handleUpdatePaymentStatus = async (orderId: string, status: 'completed' | 'failed' | 'pending') => {
    setProcessingPaidId(orderId)
    const update: Record<string, string> = { payment_status: status }
    if (status === 'completed') {
      update.status = 'approved'
      update.paid_at = new Date().toISOString()
      update.confirmed_at = new Date().toISOString()
    }
    // "Received & Approve" flips status to 'approved'; guard it on the order
    // still being pending so a buyer-cancelled order can't be resurrected. A
    // plain payment_status change (failed/pending) is harmless to apply.
    let query = supabase.from('orders').update(update).eq('id', orderId)
    if (status === 'completed') query = query.eq('status', 'pending')
    const { data, error } = await query.select('id')
    if (status === 'completed' && (error || !data?.length)) {
      await load(true)
      setProcessingPaidId(null)
      alert(L('This order can no longer be approved — the buyer may have cancelled it.', 'ఈ ఆర్డర్‌ను ఇప్పుడు ఆమోదించలేరు — కొనుగోలుదారు రద్దు చేసి ఉండవచ్చు.'))
      return
    }
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, payment_status: status, ...(status === 'completed' ? { status: 'approved' as const } : {}) } : o,
      ),
    )
    setProcessingPaidId(null)
  }

  /* ─── Filtering ────────────────────────────────────────────── */
  const timeStart = () => {
    if (timeFilter === 'today') {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }
    if (timeFilter === 'week') return Date.now() - 7 * 86400000
    if (timeFilter === 'month') return Date.now() - 30 * 86400000
    return 0 // all time
  }

  const reportCount = ordersInReportWindow(orders).length

  const start = timeStart()
  const filtered = orders.filter((o) => {
    if (new Date(o.created_at).getTime() < start) return false
    if (statusFilter === 'all') return true
    return bucketOf(o) === statusFilter
  })

  const revenue = filtered
    .filter((o) => o.status === 'approved')
    .reduce((sum, o) => sum + (o.total_price ?? 0), 0)

  // Per-bucket counts for the chips (respect the active time window).
  const inWindow = orders.filter((o) => new Date(o.created_at).getTime() >= start)
  const countFor = (s: StatusFilter) =>
    s === 'all' ? inWindow.length : inWindow.filter((o) => bucketOf(o) === s).length

  const STATUS_CHIPS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: L('All', 'అన్నీ') },
    { key: 'pending', label: L('Pending', 'పెండింగ్') },
    { key: 'approved', label: L('Approved', 'ఆమోదించారు') },
    { key: 'shipped', label: L('Shipped', 'షిప్ చేశారు') },
    { key: 'completed', label: L('Resolved', 'పరిష్కరించబడింది') },
    { key: 'declined', label: L('Declined', 'తిరస్కరించారు') },
    { key: 'cancelled', label: L('Cancelled', 'రద్దు చేశారు') },
  ]

  const TIME_CHIPS: { key: TimeFilter; label: string }[] = [
    { key: 'today', label: tx.filterToday },
    { key: 'week', label: tx.filterWeek },
    { key: 'month', label: tx.filterMonth },
    { key: 'all', label: L('All time', 'మొత్తం') },
  ]

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-green-900 px-4 pt-6 pb-10">
        <div className="flex items-start justify-between gap-3">
          <Link href="/farmer/dashboard" className="text-green-300 text-sm flex items-center gap-1 mb-4">
            ← {tx.back}
          </Link>
          {/* View report → opens the on-screen report, where the farmer can
              then download the PDF. */}
          <button
            onClick={() => setShowReport(true)}
            disabled={reportCount === 0}
            className="flex items-center gap-1.5 bg-green-800 text-white text-xs font-bold px-3 py-2 rounded-xl active:bg-green-700 disabled:opacity-50"
          >
            📄 {L('View report', 'రిపోర్ట్ చూడండి')}
          </button>
        </div>
        <h1 className="text-white text-xl font-extrabold leading-tight">
          {L('Orders', 'ఆర్డర్లు')}
        </h1>
        <p className="text-green-400 text-sm mt-1">
          {L('All your orders in one place', 'మీ అన్ని ఆర్డర్లు ఒకే చోట')}
        </p>
      </div>

      <div className="px-4 -mt-5 space-y-4">
        {/* Status filter — scrollable chips with live counts */}
        <div className="bg-white rounded-2xl border border-gray-100 p-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {STATUS_CHIPS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  statusFilter === key ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}
              >
                {label} <span className={statusFilter === key ? 'text-green-200' : 'text-gray-400'}>({countFor(key)})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Time filter */}
        <div className="bg-white rounded-2xl border border-gray-100 p-3 flex gap-2">
          {TIME_CHIPS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTimeFilter(key)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                timeFilter === key ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 active:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Revenue summary */}
        {revenue > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                {tx.totalRevenue}
              </p>
              <p className="text-3xl font-black text-green-800 mt-0.5">₹{revenue}</p>
            </div>
            <div className="text-4xl">💰</div>
          </div>
        )}

        {/* Order list */}
        {loading ? (
          <div className="text-center py-16">
            <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 text-sm mt-3">{tx.loadingLabel}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📭</div>
            <p className="font-semibold text-gray-500 text-sm">{L('No orders here', 'ఇక్కడ ఆర్డర్లు లేవు')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((order) =>
              isActionable(order) ? (
                <OrderCard
                  key={order.id}
                  order={order}
                  processing={processingOrderId === order.id}
                  processingPaid={processingPaidId === order.id}
                  onApprove={(date) => handleApprove(order.id, date)}
                  onDecline={() => setDecliningOrder(order)}
                  onAcknowledge={() => handleAcknowledgeCancel(order.id)}
                  onMarkPaid={() => handleMarkPaid(order.id)}
                  onUpdatePaymentStatus={(s) => handleUpdatePaymentStatus(order.id, s)}
                  onSetFulfillmentDate={(d, reason) => handleSetFulfillmentDate(order.id, d, reason)}
                  onMarkShipped={() => handleMarkShipped(order.id)}
                />
              ) : (
                <HistoryCard
                  key={order.id}
                  order={order}
                />
              ),
            )}
          </div>
        )}
      </div>

      {/* Decline reason sheet */}
      {decliningOrder && (
        <DeclineReasonSheet
          order={decliningOrder}
          processing={processingOrderId === decliningOrder.id}
          onCancel={() => setDecliningOrder(null)}
          onConfirm={(reason) => handleConfirmDecline(decliningOrder.id, reason)}
        />
      )}

      {/* Refund confirmation after declining */}
      {declineResult && (
        <DeclineSuccessSheet result={declineResult} onClose={() => setDeclineResult(null)} />
      )}

      {/* Orders report (view → download PDF) */}
      {showReport && (
        <OrderReportSheet
          orders={orders}
          farmerName={farmerName}
          onClose={() => setShowReport(false)}
        />
      )}
    </main>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersPageInner />
    </Suspense>
  )
}

/* ─── Read-only history card (terminal orders) ─────────────────── */
function HistoryCard({ order }: { order: Order }) {
  const { tx, L } = useLang()
  const router = useRouter()
  const openDetails = () => router.push(`/farmer/dashboard/orders/${order.id}`)
  const isApproved = order.status === 'approved'
  const isCancelled = order.status === 'cancelled'
  const isDelivery = order.delivery_type === 'home_delivery'
  const isCourier = order.delivery_type === 'courier'

  const timeStr = new Date(order.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  const stamp = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

  // Completion line for an approved order: the final milestone + its date.
  const isShippedFlow = isCourier || isDelivery
  const completion = !isApproved ? null
    : isShippedFlow
      ? order.received_at
        ? { text: `${L('✓ Received', '✓ అందుకున్నారు')} · ${stamp(order.received_at)}`, cls: 'text-green-700' }
        : order.shipped_at
          ? { text: `${L('🚚 Shipped', '🚚 షిప్ చేయబడింది')} · ${stamp(order.shipped_at)}`, cls: 'text-amber-700' }
          : null
      : order.collected_at
        ? { text: `${L('✓ Picked up', '✓ తీసుకువెళ్ళారు')} · ${stamp(order.collected_at)}`, cls: 'text-green-700' }
        : null

  return (
    <div className={`rounded-2xl border overflow-hidden ${isApproved ? 'border-green-200 bg-white' : 'border-gray-200 bg-gray-50'}`}>
      <div className="p-3 space-y-1.5">
        {/* Tapping the order summary opens the full order details page. */}
        <div onClick={openDetails} role="button" className="cursor-pointer space-y-1.5 active:opacity-70">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-extrabold text-gray-900 text-sm leading-tight">
                  {order.buyer_name || '—'}
                </p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isApproved ? 'bg-green-100 text-green-800'
                    : isCancelled ? 'bg-gray-200 text-gray-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {isApproved ? tx.statusApproved
                    : isCancelled ? L('Cancelled by buyer', 'కొనుగోలుదారు రద్దు చేశారు')
                    : tx.statusDeclined}
                </span>
              </div>
              {order.buyer_phone && (
                <a
                  href={`tel:+91${order.buyer_phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-semibold text-green-700"
                >
                  📞 +91 {order.buyer_phone}
                </a>
              )}
            </div>
            <div className="flex flex-col items-end flex-shrink-0 mt-0.5">
              <span className="text-[11px] text-gray-400 whitespace-nowrap">
                {timeStr}
              </span>
              {order.order_code && (
                <span className="text-[10px] font-mono font-semibold text-gray-400 whitespace-nowrap">
                  {order.order_code}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="font-semibold text-gray-800">{order.produce_name || '—'}</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-600">{order.quantity} {order.unit || 'kg'}</span>
            {order.total_price != null && order.total_price > 0 && (
              <>
                <span className="text-gray-300">·</span>
                <span className="font-bold text-green-700">₹{order.total_price}</span>
              </>
            )}
          </div>

          {order.pickup_location && (
            <p className="text-xs text-gray-500">📍 {order.pickup_location}</p>
          )}

          {/* Completion status + date (picked up / shipped / received). */}
          {completion && (
            <p className={`text-xs font-bold ${completion.cls}`}>{completion.text}</p>
          )}

          <p className="text-[11px] font-semibold text-green-700 pt-0.5">
            {L('View full details', 'పూర్తి వివరాలు చూడండి')} →
          </p>
        </div>

        {/* Approved (resolved) orders: the pickup/delivery date is shown
            read-only. The order is done, so there's nothing left to reschedule —
            the editable picker is intentionally gone here. */}
        {isApproved && order.fulfillment_date && (
          <p className="text-[11px] text-gray-500">
            📅 {isDelivery ? tx.deliveryDateLabel : tx.pickupDateLabel}:{' '}
            <span className="font-semibold text-gray-700">
              {new Date(`${order.fulfillment_date}T00:00:00`).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
            </span>
          </p>
        )}

        {/* Declined orders: show the reason and the refund status to the farmer */}
        {!isApproved && order.decline_reason && (
          <p className="text-xs text-gray-600 leading-snug">
            <span className="font-semibold">{L('Reason', 'కారణం:')}</span> {order.decline_reason}
          </p>
        )}
        {!isApproved && (order.refund_status || (order.refund_amount ?? 0) > 0) && (
          <div className="mt-1 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
            <p className="text-xs font-bold text-green-800 flex items-center gap-1">
              {L('💸 Refund initiated to customer', 'రీఫండ్ ప్రారంభమైంది')}
            </p>
            <p className="text-[11px] text-gray-600 leading-snug mt-0.5">
              ₹{order.refund_amount ?? order.total_price ?? 0} · reflects in 3–5 business days
              {order.refunded_at && (
                <> · {new Date(order.refunded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

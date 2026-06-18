'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'

type Order = {
  id: string
  farmer_id: string
  order_code: string | null
  produce_listing_id: string | null
  produce_name: string | null
  quantity: number | null
  unit: string | null
  total_price: number | null
  buyer_name: string | null
  buyer_phone: string | null
  pickup_location: string | null
  status: 'pending' | 'approved' | 'declined'
  payment_status: string | null
  decline_reason: string | null
  refund_status: string | null
  refund_amount: number | null
  refunded_at: string | null
  delivery_type: 'self_pickup' | 'home_delivery' | 'courier' | null
  collected_at: string | null
  shipped_at: string | null
  received_at: string | null
  fulfillment_date: string | null
  created_at: string
}

type Filter = 'today' | 'week' | 'month'

export default function OrderHistoryPage() {
  const router = useRouter()
  const { tx, L } = useLang()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('week')

  const load = useCallback(async () => {
    const farmerId = localStorage.getItem('yff_farmer_id')
    if (!farmerId) { router.replace('/farmer/login'); return }

    setLoading(true)
    // Explicit columns: handover_otp is deliberately NOT fetched — the pickup
    // code must come from the customer, so the farmer's browser never sees it.
    const { data } = await supabase
      .from('orders')
      .select('id, farmer_id, order_code, produce_listing_id, produce_name, quantity, unit, total_price, buyer_name, buyer_phone, pickup_location, status, payment_status, decline_reason, refund_status, refund_amount, refunded_at, delivery_type, collected_at, shipped_at, received_at, fulfillment_date, created_at')
      .eq('farmer_id', farmerId)
      .in('status', ['approved', 'declined'])
      .order('created_at', { ascending: false })

    setOrders((data ?? []) as Order[])
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  // Farmer sets/updates the pickup-or-delivery date on an approved order.
  const setFulfillmentDate = async (orderId: string, date: string) => {
    const value = date || null
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, fulfillment_date: value } : o)))
    await supabase.from('orders').update({ fulfillment_date: value }).eq('id', orderId)
  }

  const filterStart = () => {
    if (filter === 'today') {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }
    if (filter === 'week') return Date.now() - 7 * 86400000
    return Date.now() - 30 * 86400000
  }

  const filtered = orders.filter((o) => new Date(o.created_at).getTime() >= filterStart())
  const revenue = filtered
    .filter((o) => o.status === 'approved')
    .reduce((sum, o) => sum + (o.total_price ?? 0), 0)

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-green-900 px-4 pt-6 pb-10">
        <Link href="/farmer/dashboard" className="text-green-300 text-sm flex items-center gap-1 mb-4">
          ← {tx.back}
        </Link>
        <h1 className="text-white text-xl font-extrabold leading-tight">
          {tx.orderHistory}
        </h1>
        <p className="text-green-400 text-sm mt-1">Approved &amp; declined orders</p>
      </div>

      <div className="px-4 -mt-5 space-y-4">
        {/* Filter pills */}
        <div className="bg-white rounded-2xl border border-gray-100 p-3 flex gap-2">
          {(['today', 'week', 'month'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                filter === f ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 active:bg-gray-200'
              }`}
            >
              {f === 'today' ? tx.filterToday : f === 'week' ? tx.filterWeek : tx.filterMonth}
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
            <p className="font-semibold text-gray-500 text-sm">{tx.noPendingOrders}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((order) => (
              <HistoryCard
                key={order.id}
                order={order}
                onSetDate={(d) => setFulfillmentDate(order.id, d)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function HistoryCard({ order, onSetDate }: { order: Order; onSetDate: (date: string) => void }) {
  const { tx, L } = useLang()
  const isApproved = order.status === 'approved'
  const isDelivery = order.delivery_type === 'home_delivery'
  const isCourier = order.delivery_type === 'courier'

  const timeStr = new Date(order.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  const stamp = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

  // Completion line for an approved order: the final milestone + its date.
  // Courier: Received (done) ▸ Shipped (in transit). Pickup: Picked up.
  const completion = !isApproved ? null
    : isCourier
      ? order.received_at
        ? { text: `${L('✓ Received', '✓ అందుకున్నారు')} · ${stamp(order.received_at)}`, cls: 'text-green-700' }
        : order.shipped_at
          ? { text: `${L('📦 Shipped', '📦 షిప్ చేయబడింది')} · ${stamp(order.shipped_at)}`, cls: 'text-amber-700' }
          : null
      : !isDelivery && order.collected_at
        ? { text: `${L('✓ Picked up', '✓ తీసుకువెళ్ళారు')} · ${stamp(order.collected_at)}`, cls: 'text-green-700' }
        : null

  return (
    <div className={`rounded-2xl border overflow-hidden ${isApproved ? 'border-green-200 bg-white' : 'border-gray-200 bg-gray-50'}`}>
      <div className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-extrabold text-gray-900 text-sm leading-tight">
                {order.buyer_name || '—'}
              </p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isApproved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
              }`}>
                {isApproved ? tx.statusApproved : tx.statusDeclined}
              </span>
            </div>
            {order.buyer_phone && (
              <a href={`tel:+91${order.buyer_phone}`} className="text-xs font-semibold text-green-700">
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

        {/* Approved orders: farmer sets/edits the pickup-or-delivery date. */}
        {isApproved && (
          <div className="pt-1">
            <label className="text-[11px] font-bold text-gray-600 block mb-1">
              📅 {isDelivery ? tx.deliveryDateLabel : tx.pickupDateLabel}
            </label>
            <input
              type="date"
              value={order.fulfillment_date ?? ''}
              onChange={(e) => onSetDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-green-500 focus:outline-none"
            />
          </div>
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

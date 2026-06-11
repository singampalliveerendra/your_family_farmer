'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'
import LanguageToggle from '@/components/LanguageToggle'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'

type DeliveryStatus = 'unassigned' | 'assigned' | 'picked_up' | 'out_for_delivery' | 'delivered'

type Order = {
  id: string
  order_code: string | null
  produce_name: string | null
  quantity: number | null
  unit: string | null
  total_price: number | null
  pickup_location: string | null
  status: 'pending' | 'approved' | 'declined' | 'cancelled'
  payment_method: string | null
  payment_status: string | null
  refund_status: string | null
  decline_reason: string | null
  payment_proof_path: string | null
  created_at: string
  farmer_id: string
  farmer?: {
    name: string
    slug: string
    village: string
    phone: string | null
    upi_id: string | null
  } | null
  delivery_type?: 'self_pickup' | 'home_delivery' | null
  delivery_status?: DeliveryStatus | null
}

export default function ConsumerOrdersPage() {
  const { tx } = useLang()
  const { state, openAuth } = useConsumerAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryingId, setRetryingId] = useState<string | null>(null)

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

  const handleRetryPayment = async (order: Order) => {
    if (order.status === 'declined') return
    setRetryingId(order.id)
    const r = await fetch(`/api/orders/${order.id}/retry`, {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => null)
    setRetryingId(null)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not retry payment.'); return }

    setOrders((prev) => prev.map((o) =>
      o.id === order.id ? { ...o, payment_status: 'pending', payment_proof_path: null } : o,
    ))
    if (order.farmer?.upi_id && order.total_price) {
      const upiLink = `upi://pay?pa=${encodeURIComponent(order.farmer.upi_id)}&pn=${encodeURIComponent(order.farmer.name)}&am=${order.total_price}&cu=INR&tn=YourFamilyFarmer%20Order`
      window.location.href = upiLink
    }
  }

  const statusColor = (s: string) =>
    s === 'approved'
      ? 'bg-green-100 text-green-800'
      : s === 'declined'
        ? 'bg-red-100 text-red-700'
        : s === 'cancelled'
          ? 'bg-gray-200 text-gray-700'
          : 'bg-amber-100 text-amber-800'

  const deliveryStatusLabel = (s: DeliveryStatus | null | undefined) => {
    switch (s) {
      case 'assigned': return 'Rider assigned'
      case 'picked_up': return 'Picked up'
      case 'out_for_delivery': return 'Out for delivery'
      case 'delivered': return 'Delivered'
      default: return 'Waiting for rider'
    }
  }

  const statusLabel = (s: string) =>
    s === 'approved' ? '✓ Confirmed'
      : s === 'declined' ? '✕ Declined'
      : s === 'cancelled' ? '✕ Cancelled'
      : '⏳ Pending'

  const paymentBadge = (order: Order) => {
    if (!order.payment_method || order.payment_method === 'cod') return null
    // Online payments now go through Razorpay.
    if (order.payment_method === 'razorpay' && order.payment_status === 'paid') {
      return { label: '✓ Paid online / ఆన్‌లైన్ చెల్లించారు', cls: 'bg-green-100 text-green-800' }
    }
    // Manual UPI is retired — legacy UPI orders show no pay prompt.
    return null
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-green-900 px-4 pt-6 pb-10">
        <div className="flex items-center justify-between mb-4">
          <Link href="/consumer" className="text-green-300 text-sm flex items-center gap-1">
            ← Back / వెనక్కు
          </Link>
          <LanguageToggle />
        </div>
        <h1 className="text-white text-xl font-extrabold leading-tight">{tx.myOrders}</h1>
        <p className="text-green-400 text-sm mt-1">
          Your complete order history / మీ ఆర్డర్ల చరిత్ర
        </p>
      </div>

      <div className="px-4 -mt-5 space-y-4 max-w-lg mx-auto">
        {state.status === 'loading' || loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-500">
            Loading... / లోడ్ అవుతోంది
          </div>
        ) : state.status === 'anonymous' ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center space-y-4">
            <div className="text-5xl">🔒</div>
            <div>
              <p className="font-bold text-gray-900">Log in to see your orders</p>
              <p className="text-xs text-gray-500 mt-1">
                మీ ఆర్డర్‌లు చూడటానికి లాగిన్ అవ్వండి
              </p>
            </div>
            <button
              onClick={openAuth}
              className="w-full bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm active:bg-green-800"
            >
              Log in / లాగిన్
            </button>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-red-100 p-6 space-y-3">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => void refresh()}
              className="text-sm font-bold text-green-700 underline"
            >
              Try again
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-14">
            <div className="text-5xl mb-3">📭</div>
            <p className="font-semibold text-gray-500 text-sm">{tx.noOrdersYet}</p>
            <Link href="/consumer" className="mt-4 inline-block text-green-700 text-sm underline font-semibold">
              Browse produce → / పంట చూడండి
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {orders.length} order{orders.length !== 1 ? 's' : ''} found
            </p>
            {orders.map((order) => {
              const badge = paymentBadge(order)
              // Manual UPI flow retired — no pay-via-UPI prompt or retry on legacy orders.
              const needsPayment = false
              const canRetry = false
              const upiLink: string | null = null
              return (
                <Link key={order.id} href={`/consumer/orders/${order.id}`} className="block">
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden active:bg-gray-50">
                    <div className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-extrabold text-gray-900 text-sm leading-tight">
                            {order.produce_name || '—'}
                          </p>
                          {order.order_code && (
                            <p className="text-[11px] font-mono font-semibold text-gray-400 mt-0.5">
                              {order.order_code}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-0.5">
                            {order.quantity} {order.unit || 'kg'}
                            {order.total_price ? ` · ₹${order.total_price}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColor(order.status)}`}>
                            {statusLabel(order.status)}
                          </span>
                          {badge && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${badge.cls}`}>
                              {badge.label}
                            </span>
                          )}
                          {order.refund_status && order.refund_status !== 'failed' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-purple-100 text-purple-800">
                              💸 {order.refund_status === 'processed' ? 'Refunded / రీఫండ్ అయింది' : 'Refund initiated / రీఫండ్ ప్రారంభమైంది'}
                            </span>
                          )}
                          {order.refund_status === 'failed' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-red-100 text-red-800">
                              ⚠️ Refund failed / రీఫండ్ విఫలమైంది
                            </span>
                          )}
                        </div>
                      </div>

                      {order.farmer && (
                        <p className="flex items-center gap-1.5 text-xs text-green-700 font-semibold">
                          🧑‍🌾 {tx.orderedFrom} {order.farmer.name} · {order.farmer.village}
                        </p>
                      )}

                      {order.delivery_type === 'home_delivery' ? (
                        <p className="text-xs text-blue-700 font-semibold">
                          🛵 Home delivery · {deliveryStatusLabel(order.delivery_status)}
                        </p>
                      ) : order.pickup_location ? (
                        <p className="text-xs text-gray-500">📍 {tx.pickedUpAt}: {order.pickup_location}</p>
                      ) : null}

                      <p className="text-[11px] text-gray-400">
                        {new Date(order.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>

                      {/* Decline reason — shown only when farmer declined */}
                      {order.status === 'declined' && order.decline_reason && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-1">
                          <p className="text-[10px] font-bold text-red-700 uppercase tracking-wide">
                            Reason / కారణం
                          </p>
                          <p className="text-xs text-red-800 mt-0.5 leading-snug">{order.decline_reason}</p>
                        </div>
                      )}

                      {/* Refund message — shown when a paid order was declined */}
                      {order.status === 'declined' && order.refund_status === 'initiated' && (
                        <div className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 mt-1">
                          <p className="text-xs text-purple-800 leading-snug">
                            Your payment of Rs.{order.total_price ?? 0} will be refunded to your account in 3-5 business days
                          </p>
                          <p className="text-xs text-purple-800 leading-snug mt-0.5">
                            మీ చెల్లింపు Rs.{order.total_price ?? 0} 3-5 పని దినాలలో తిరిగి వస్తుంది
                          </p>
                        </div>
                      )}

                      {/* Pay Now button for pending UPI orders */}
                      {needsPayment && upiLink && (
                        <div className="pt-1 space-y-2">
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); window.location.href = upiLink }}
                            className="w-full bg-green-700 text-white font-bold py-3 rounded-xl text-sm active:bg-green-800"
                          >
                            📲 Pay ₹{order.total_price} via UPI
                          </button>
                          <p className="text-[11px] text-gray-500 text-center">
                            UPI ID: <span className="font-mono font-semibold">{order.farmer?.upi_id}</span>
                          </p>
                        </div>
                      )}

                      {/* Retry payment */}
                      {canRetry && (
                        <div className="pt-1 space-y-2">
                          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                            <p className="text-xs font-bold text-amber-800">
                              Farmer did not receive your payment / రైతుకు చెల్లింపు అందలేదు
                            </p>
                            <p className="text-[11px] text-amber-700 mt-0.5">
                              Tap retry to pay again. The farmer will be re-notified.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); void handleRetryPayment(order) }}
                            disabled={retryingId === order.id}
                            className="w-full bg-amber-600 text-white font-bold py-3 rounded-xl text-sm active:bg-amber-700 disabled:opacity-50"
                          >
                            {retryingId === order.id ? 'Opening UPI...' : `🔄 Retry payment ₹${order.total_price}`}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        <Link
          href="/consumer/complaints"
          className="mt-6 block text-center text-xs font-semibold text-green-700 underline"
        >
          🛟 My complaints / నా ఫిర్యాదులు
        </Link>

        <Link
          href="/buyer-protection"
          className="mt-3 block text-center text-xs font-semibold text-green-700 underline"
        >
          🔒 Buyer protection & refund policy / కొనుగోలుదారు రక్షణ & రీఫండ్ విధానం
        </Link>
      </div>
    </main>
  )
}

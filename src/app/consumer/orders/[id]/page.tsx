'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
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
  status: 'pending' | 'approved' | 'declined'
  payment_method: string | null
  payment_status: string | null
  refund_status: string | null
  refund_id: string | null
  refund_amount: number | null
  refunded_at: string | null
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
  delivery_address?: string | null
  delivery_landmark?: string | null
  delivery_pincode?: string | null
  delivery_alt_phone?: string | null
  handover_otp?: string | null
  assigned_at?: string | null
  picked_up_at?: string | null
  out_for_delivery_at?: string | null
  delivered_at?: string | null
  rider?: { id: string; name: string | null; phone: string } | null
}

export default function OrderDetailsPage() {
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === 'string' ? params.id : ''
  const { state, openAuth } = useConsumerAuth()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [proofLoading, setProofLoading] = useState(false)

  useEffect(() => {
    if (state.status !== 'authenticated' || !id) {
      if (state.status === 'anonymous') setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/consumer/orders/${id}`, { credentials: 'same-origin' })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) {
          setError(json?.error ?? 'Could not load order.')
          setLoading(false)
          return
        }
        setOrder(json.order as Order)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('Network error. Please try again.')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [id, state.status])

  // Resolve a fresh signed URL for the payment screenshot
  useEffect(() => {
    if (!order?.payment_proof_path) { setProofUrl(null); return }
    let cancelled = false
    setProofLoading(true)
    fetch(`/api/orders/${order.id}/proof`, { credentials: 'same-origin' })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}))
        if (cancelled) return
        setProofUrl(typeof json?.url === 'string' ? json.url : null)
        setProofLoading(false)
      })
      .catch(() => { if (!cancelled) setProofLoading(false) })
    return () => { cancelled = true }
  }, [order?.id, order?.payment_proof_path])

  const statusColor = (s: string) =>
    s === 'approved' ? 'bg-green-100 text-green-800'
      : s === 'declined' ? 'bg-red-100 text-red-700'
      : 'bg-amber-100 text-amber-800'

  const statusLabel = (s: string) =>
    s === 'approved' ? '✓ Confirmed' : s === 'declined' ? '✕ Declined' : '⏳ Pending'

  const paymentLabel = (o: Order) => {
    if (o.payment_method === 'cod') return 'Cash on Delivery / నగదు చెల్లింపు'
    if (o.payment_method === 'upi') {
      if (o.payment_status === 'completed') return 'UPI ✓ Paid'
      if (o.payment_status === 'pending_confirmation' || o.payment_status === 'payment_claimed')
        return 'UPI ⏳ Awaiting farmer confirmation'
      if (o.payment_status === 'failed') return 'UPI ✕ Not received'
      return 'UPI · Pending'
    }
    return o.payment_method ?? '—'
  }

  const orderDate = order
    ? new Date(order.created_at).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : ''
  const orderTime = order
    ? new Date(order.created_at).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit',
      })
    : ''

  const whatsappHref = order?.farmer?.phone && order?.produce_name
    ? `https://wa.me/91${order.farmer.phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
        `Hello ${order.farmer.name} anna, regarding my order of ${order.produce_name} on ${orderDate}.`,
      )}`
    : null

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      <div className="bg-green-900 px-4 pt-6 pb-10">
        <div className="flex items-center justify-between mb-4">
          <Link href="/consumer/orders" className="text-green-300 text-sm flex items-center gap-1">
            ← Back / వెనక్కు
          </Link>
          <LanguageToggle />
        </div>
        <h1 className="text-white text-xl font-extrabold leading-tight">
          Order details / ఆర్డర్ వివరాలు
        </h1>
      </div>

      <div className="px-4 -mt-5 space-y-4 max-w-lg mx-auto">
        {state.status === 'anonymous' ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center space-y-4">
            <div className="text-5xl">🔒</div>
            <p className="font-bold text-gray-900">Log in to view this order</p>
            <button
              onClick={openAuth}
              className="w-full bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm active:bg-green-800"
            >
              Log in / లాగిన్
            </button>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-500">
            Loading... / లోడ్ అవుతోంది
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-red-100 p-6 text-sm text-red-600">{error}</div>
        ) : !order ? null : (
          <>
            {/* Status + payment summary */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order</p>
                  {order.order_code && (
                    <p className="text-[11px] font-mono font-semibold text-gray-400">{order.order_code}</p>
                  )}
                  <p className="text-base font-extrabold text-gray-900 leading-tight">
                    {order.produce_name || '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {order.quantity} {order.unit || 'kg'}
                    {order.total_price ? ` · ₹${order.total_price}` : ''}
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColor(order.status)}`}>
                  {statusLabel(order.status)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100 mt-3">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Placed</p>
                  <p className="text-xs font-semibold text-gray-700">{orderDate}</p>
                  <p className="text-[11px] text-gray-500">{orderTime}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Payment</p>
                  <p className="text-xs font-semibold text-gray-700">{paymentLabel(order)}</p>
                </div>
              </div>

              {order.pickup_location && (
                <div className="pt-1 border-t border-gray-100 mt-1">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Pickup</p>
                  <p className="text-xs font-semibold text-gray-700">📍 {order.pickup_location}</p>
                </div>
              )}
            </div>

            {/* Delivery timeline + handover OTP — only for home delivery orders */}
            {order.delivery_type === 'home_delivery' && order.status !== 'declined' && (
              <DeliveryPanel order={order} />
            )}

            {/* Decline reason */}
            {order.status === 'declined' && order.decline_reason && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Decline reason / కారణం</p>
                <p className="text-sm text-red-800 mt-1 leading-snug">{order.decline_reason}</p>
              </div>
            )}

            {/* Refund status — shown whenever a refund exists for this order */}
            {order.refund_status && <RefundPanel order={order} />}

            {/* Payment screenshot */}
            {order.payment_method === 'upi' && (
              <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Payment screenshot / చెల్లింపు స్క్రీన్‌షాట్
                </p>
                {!order.payment_proof_path ? (
                  <p className="text-xs text-gray-500">No screenshot uploaded yet.</p>
                ) : proofLoading ? (
                  <p className="text-xs text-gray-500">Loading...</p>
                ) : proofUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proofUrl}
                    alt="Payment screenshot"
                    className="w-full max-h-96 object-contain rounded-xl border border-gray-200 bg-gray-50"
                  />
                ) : (
                  <p className="text-xs text-red-600">Could not load screenshot. Please refresh.</p>
                )}
              </div>
            )}

            {/* Farmer details */}
            {order.farmer && (
              <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Farmer / రైతు
                </p>
                <div>
                  <p className="text-base font-extrabold text-gray-900 leading-tight">🧑‍🌾 {order.farmer.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">📍 {order.farmer.village}</p>
                </div>
                <Link
                  href={`/farmer/${order.farmer.slug}`}
                  className="block text-center text-sm font-bold text-green-700 underline"
                >
                  View farm profile / రైతు ప్రొఫైల్ చూడండి ↗
                </Link>
                {whatsappHref && (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl text-sm active:bg-green-700 flex items-center justify-center gap-2"
                  >
                    💬 Contact Farmer / రైతును సంప్రదించు
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function DeliveryPanel({ order }: { order: Order }) {
  const ds: DeliveryStatus = (order.delivery_status as DeliveryStatus) || 'unassigned'

  const steps: Array<{ key: DeliveryStatus; label: string; sub: string; at: string | null | undefined }> = [
    { key: 'unassigned', label: 'Order placed', sub: 'Waiting for a delivery boy', at: order.created_at },
    { key: 'assigned', label: 'Rider assigned', sub: 'On the way to farmer', at: order.assigned_at },
    { key: 'picked_up', label: 'Picked up', sub: 'Collected from farmer', at: order.picked_up_at },
    { key: 'out_for_delivery', label: 'Out for delivery', sub: 'On the way to you', at: order.out_for_delivery_at },
    { key: 'delivered', label: 'Delivered', sub: 'Order completed', at: order.delivered_at },
  ]

  const stageIndex = (k: DeliveryStatus) => ['unassigned', 'assigned', 'picked_up', 'out_for_delivery', 'delivered'].indexOf(k)
  const current = stageIndex(ds)

  const formatAt = (iso: string | null | undefined) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-base">🛵</span>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
          Home delivery / ఇంటికి డెలివరీ
        </p>
      </div>

      {/* Handover OTP — visible once a rider has been assigned. Customer
          reads this 4-digit code to the rider at the door so the system
          can confirm the right person received the goods. */}
      {ds !== 'unassigned' && ds !== 'delivered' && order.handover_otp && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-4 py-3 text-center">
          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wide">
            Read this code to the delivery boy at your door
          </p>
          <p className="text-[10px] text-amber-700 mt-0.5">
            డోర్ వద్ద డెలివరీ బాయ్‌కు ఈ కోడ్ చెప్పండి
          </p>
          <p className="text-4xl font-black tracking-widest text-amber-900 mt-2 font-mono">
            {order.handover_otp}
          </p>
        </div>
      )}

      {ds === 'delivered' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-center">
          <p className="text-sm font-extrabold text-green-800">✓ Delivered</p>
          <p className="text-xs text-green-700 mt-0.5">{formatAt(order.delivered_at)}</p>
        </div>
      )}

      {/* Status timeline */}
      <ol className="space-y-2">
        {steps.map((s, idx) => {
          const reached = idx <= current
          const isCurrent = idx === current
          return (
            <li key={s.key} className="flex items-start gap-3">
              <div className="flex flex-col items-center pt-0.5">
                <span className={`w-3 h-3 rounded-full ${reached ? 'bg-green-700' : 'bg-gray-200'} ${isCurrent ? 'ring-2 ring-green-200' : ''}`} />
                {idx < steps.length - 1 && (
                  <span className={`w-0.5 flex-1 mt-0.5 ${idx < current ? 'bg-green-700' : 'bg-gray-200'}`} style={{ minHeight: 14 }} />
                )}
              </div>
              <div className="flex-1 pb-1">
                <p className={`text-xs font-bold ${reached ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</p>
                <p className="text-[10px] text-gray-500 leading-snug">{s.sub}</p>
                {s.at && reached && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{formatAt(s.at)}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {/* Delivery address (always visible — confirms what consumer entered) */}
      {order.delivery_address && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Delivering to</p>
          <p className="text-xs text-gray-800 leading-snug whitespace-pre-line">{order.delivery_address}</p>
          {order.delivery_landmark && (
            <p className="text-xs text-gray-600 mt-0.5">📍 {order.delivery_landmark}</p>
          )}
          {order.delivery_pincode && (
            <p className="text-xs text-gray-600">PIN: {order.delivery_pincode}</p>
          )}
        </div>
      )}

      {/* Rider contact — only when assigned (and not yet delivered) */}
      {order.rider && ds !== 'delivered' && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Delivery boy / డెలివరీ బాయ్</p>
          <p className="text-sm font-bold text-gray-900 mt-1">{order.rider.name || 'Your delivery partner'}</p>
          <a
            href={`tel:${order.rider.phone}`}
            className="mt-2 w-full inline-flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-3 rounded-xl text-sm active:bg-blue-700"
          >
            📞 Call · {order.rider.phone}
          </a>
        </div>
      )}
    </div>
  )
}

// Refund timeline. Maps the stored refund_status (our manual 'initiated', or
// a Razorpay status: 'pending' / 'processed' / 'failed') onto a simple
// buyer-facing progression: Initiated → Processing → Credited.
function RefundPanel({ order }: { order: Order }) {
  const rs = (order.refund_status || '').toLowerCase()
  const failed = rs === 'failed'
  const amount = order.refund_amount ?? order.total_price ?? 0

  // current = how far along the 3-step bar we are.
  // initiated → 0, pending → 1, processed → 2 (credited).
  const current = rs === 'processed' ? 2 : rs === 'pending' ? 1 : 0

  const steps = [
    { label: 'Refund initiated', sub: 'We started your refund' },
    { label: 'Processing', sub: 'Sent to your bank/UPI' },
    { label: 'Credited', sub: 'Reflects in 3–5 business days' },
  ]

  const refundedAt = order.refunded_at
    ? new Date(order.refunded_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null

  if (failed) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-1.5">
        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
          ⚠️ Refund failed / రీఫండ్ విఫలమైంది
        </span>
        <p className="text-sm text-red-800 leading-snug">
          Your refund of ₹{amount} could not be processed. Please contact support and we&apos;ll fix it.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
          💸 Refund of ₹{amount}
        </span>
        {refundedAt && <span className="text-[10px] text-purple-500">{refundedAt}</span>}
      </div>

      <ol className="space-y-2">
        {steps.map((s, idx) => {
          const reached = idx <= current
          const isCurrent = idx === current
          return (
            <li key={s.label} className="flex items-start gap-3">
              <div className="flex flex-col items-center pt-0.5">
                <span className={`w-3 h-3 rounded-full ${reached ? 'bg-purple-600' : 'bg-purple-200'} ${isCurrent ? 'ring-2 ring-purple-200' : ''}`} />
                {idx < steps.length - 1 && (
                  <span className={`w-0.5 mt-0.5 ${idx < current ? 'bg-purple-600' : 'bg-purple-200'}`} style={{ minHeight: 14 }} />
                )}
              </div>
              <div className="flex-1 pb-1">
                <p className={`text-xs font-bold ${reached ? 'text-purple-900' : 'text-purple-300'}`}>{s.label}</p>
                <p className="text-[10px] text-purple-500 leading-snug">{s.sub}</p>
              </div>
            </li>
          )
        })}
      </ol>

      {order.refund_id && (
        <p className="text-[10px] text-purple-400 font-mono border-t border-purple-100 pt-2">Ref: {order.refund_id}</p>
      )}
    </div>
  )
}

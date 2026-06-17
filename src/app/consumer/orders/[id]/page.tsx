'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import LanguageToggle from '@/components/LanguageToggle'
import { useLang } from '@/lib/LanguageContext'
import { localizeName } from '@/lib/localizeName'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import ComplaintModal from '@/components/consumer/ComplaintModal'

type DeliveryStatus = 'unassigned' | 'assigned' | 'picked_up' | 'out_for_delivery' | 'delivered'

// Fire a browser notification for a buyer-facing status change (e.g. the farmer
// shipped the parcel). Permission-gated: silently no-ops unless the buyer has
// granted notifications, so it's safe to call unconditionally.
function fireConsumerNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, icon: '/icon-192.png', tag: 'yff-order-status' })
  } catch { /* some browsers throw on background tabs — ignore */ }
}

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
  payment_method_detail?: string | null
  payment_status: string | null
  paid_at?: string | null
  confirmed_at?: string | null
  razorpay_payment_id: string | null
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
  delivery_type?: 'self_pickup' | 'home_delivery' | 'courier' | null
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
  collected_at?: string | null
  shipped_at?: string | null
  received_at?: string | null
  fulfillment_date?: string | null
  rider?: { id: string; name: string | null; phone: string } | null
}

export default function OrderDetailsPage() {
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === 'string' ? params.id : ''
  const { state, openAuth } = useConsumerAuth()
  const { tx, L, lang } = useLang()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [proofLoading, setProofLoading] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showComplaint, setShowComplaint] = useState(false)
  const [confirmingReceipt, setConfirmingReceipt] = useState(false)

  // Buyer may cancel only while still pending and within 30 min of placing.
  const canCancel = !!order
    && order.status === 'pending'
    && !!order.created_at
    && Date.now() - new Date(order.created_at).getTime() < 30 * 60 * 1000

  // A shipped courier order awaits the buyer's "Received" confirmation.
  const canConfirmReceipt = !!order
    && order.delivery_type === 'courier'
    && !!order.shipped_at
    && !order.received_at

  const handleCancel = async () => {
    if (!order) return
    if (!window.confirm('Cancel this order? If you have already paid, you will be refunded automatically.\n\nఈ ఆర్డర్‌ను రద్దు చేయాలా? మీరు ఇప్పటికే చెల్లించి ఉంటే, డబ్బు ఆటోమేటిక్‌గా తిరిగి వస్తుంది.')) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/consumer/orders/${order.id}/cancel`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { alert(json.error || 'Could not cancel the order. / ఆర్డర్ రద్దు చేయలేకపోయాం.'); return }
      // Refresh the order so status + any refund show up.
      const r = await fetch(`/api/consumer/orders/${order.id}`, { credentials: 'same-origin' })
      const fresh = await r.json().catch(() => ({}))
      if (r.ok && fresh.order) setOrder(fresh.order as Order)
    } catch {
      alert('Network error. Please try again. / నెట్‌వర్క్ సమస్య. మళ్ళీ ప్రయత్నించండి.')
    } finally {
      setCancelling(false)
    }
  }

  const handleConfirmReceipt = async () => {
    if (!order) return
    if (!window.confirm('Confirm you received this order? / మీరు ఈ ఆర్డర్‌ను అందుకున్నారా?')) return
    setConfirmingReceipt(true)
    try {
      const res = await fetch(`/api/consumer/orders/${order.id}/received`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { alert(json.error || 'Could not confirm receipt. / అందుకున్నట్టు ధృవీకరించలేకపోయాం.'); return }
      const r = await fetch(`/api/consumer/orders/${order.id}`, { credentials: 'same-origin' })
      const fresh = await r.json().catch(() => ({}))
      if (r.ok && fresh.order) setOrder(fresh.order as Order)
    } catch {
      alert('Network error. Please try again. / నెట్‌వర్క్ సమస్య. మళ్ళీ ప్రయత్నించండి.')
    } finally {
      setConfirmingReceipt(false)
    }
  }

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

  // Light polling so status changes the farmer/rider make (e.g. Shipped) show up
  // here without a manual refresh. Stops once the order reaches a final state.
  const orderDone = !!order && (
    order.status === 'declined'
    || order.status === 'cancelled'
    || !!order.received_at
    || !!order.collected_at
    || order.delivery_status === 'delivered'
  )
  const orderActive = !!order && !orderDone && (order.status === 'pending' || order.status === 'approved')
  useEffect(() => {
    if (!orderActive || !id || state.status !== 'authenticated') return
    const timer = setInterval(() => {
      fetch(`/api/consumer/orders/${id}`, { credentials: 'same-origin' })
        .then(async (r) => {
          if (!r.ok) return
          const json = await r.json().catch(() => ({}))
          if (!json.order) return
          const next = json.order as Order
          // Notify the buyer the moment a status they're waiting on flips.
          setOrder((prev) => {
            if (prev && !prev.shipped_at && next.shipped_at) {
              fireConsumerNotification(
                'Your order has shipped 📦 / ఆర్డర్ షిప్ చేయబడింది',
                `${next.produce_name ?? 'Your order'} is on the way. Tap "Received" once it arrives. / మీ ఆర్డర్ వస్తోంది.`,
              )
            }
            return next
          })
        })
        .catch(() => {})
    }, 25000)
    return () => clearInterval(timer)
  }, [orderActive, id, state.status])

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
      : s === 'cancelled' ? 'bg-gray-200 text-gray-700'
      : 'bg-amber-100 text-amber-800'

  const statusLabel = (s: string) =>
    s === 'approved' ? tx.statusConfirmed
      : s === 'declined' ? tx.statusDeclined
      : s === 'cancelled' ? tx.statusCancelled
      : tx.statusPending

  const paymentLabel = (o: Order) => {
    if (o.payment_method === 'cod') return 'Cash on Delivery / నగదు చెల్లింపు'
    if (o.payment_method === 'upi') {
      // Show the real method (PhonePe / Google Pay / UPI…) once we know it,
      // instead of the gateway name. Falls back to "UPI" before it resolves.
      const m = o.payment_method_detail || 'UPI'
      if (o.payment_status === 'paid' || o.payment_status === 'completed') return `${m} ✓ Paid`
      if (o.payment_status === 'pending_confirmation' || o.payment_status === 'payment_claimed')
        return `${m} ⏳ Awaiting farmer confirmation`
      if (o.payment_status === 'failed') return `${m} ✕ Not received`
      return `${m} · Pending`
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
            ← {L('Back', 'వెనక్కు')}
          </Link>
          <LanguageToggle />
        </div>
        <h1 className="text-white text-xl font-extrabold leading-tight">
          {L('Order details', 'ఆర్డర్ వివరాలు')}
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
              {L('Log in', 'లాగిన్')}
            </button>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-500">
            {L('Loading...', 'లోడ్ అవుతోంది')}
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
                    {localizeName(order.produce_name, lang) || '—'}
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

              {(order.payment_status === 'paid' || order.payment_status === 'completed') && (
                <button
                  onClick={() => setShowReceipt(true)}
                  className="mt-3 w-full border border-green-600 text-green-700 font-bold py-2.5 rounded-xl text-sm active:bg-green-50"
                >
                  🧾 {L('View receipt', 'రసీదు చూడండి')}
                </button>
              )}

              {canCancel && (
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="mt-2 w-full border border-red-300 text-red-600 font-bold py-2.5 rounded-xl text-sm active:bg-red-50 disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling... / రద్దు చేస్తోంది...' : '✕ Cancel order / ఆర్డర్ రద్దు (30 min లోపు)'}
                </button>
              )}

              {canConfirmReceipt && (
                <button
                  onClick={handleConfirmReceipt}
                  disabled={confirmingReceipt}
                  className="mt-3 w-full bg-green-600 text-white font-bold py-3 rounded-xl text-sm active:bg-green-700 disabled:opacity-50"
                >
                  {confirmingReceipt ? '…' : '✓ Received / అందుకున్నాను'}
                </button>
              )}
            </div>

            {/* Pickup / Delivery date the farmer scheduled for this order. */}
            {order.fulfillment_date && order.status !== 'declined' && order.status !== 'cancelled' && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
                <span className="text-2xl">📅</span>
                <div>
                  <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">
                    {order.delivery_type === 'home_delivery'
                      ? L('Delivery date', 'డెలివరీ తేదీ')
                      : L('Pickup date', 'పికప్ తేదీ')}
                  </p>
                  <p className="text-sm font-extrabold text-green-900 mt-0.5">
                    {new Date(`${order.fulfillment_date}T00:00:00`).toLocaleDateString('en-IN', {
                      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                </div>
              </div>
            )}

            {/* Delivery timeline + handover OTP — only for home delivery orders */}
            {order.delivery_type === 'home_delivery' && order.status !== 'declined' && (
              <DeliveryPanel order={order} />
            )}

            {/* Simple status timeline for self-pickup orders */}
            {order.delivery_type !== 'home_delivery' && order.status !== 'declined' && (
              <OrderStatusPanel order={order} />
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
                    💬 {L('Contact Farmer', 'రైతును సంప్రదించు')}
                  </a>
                )}
              </div>
            )}

            {/* Report a problem — pins the complaint to this order automatically */}
            <button
              onClick={() => setShowComplaint(true)}
              className="w-full border border-gray-300 text-gray-700 font-bold py-3 rounded-xl text-sm active:bg-gray-50"
            >
              🛟 {L('Report a problem', 'సమస్యను నివేదించండి')}
            </button>
          </>
        )}
      </div>

      {showReceipt && order && (
        <ReceiptOverlay order={order} onClose={() => setShowReceipt(false)} />
      )}

      {showComplaint && order && (
        <ComplaintModal
          presetOrderCode={order.order_code}
          onClose={() => setShowComplaint(false)}
          onCreated={() => setShowComplaint(false)}
        />
      )}
    </main>
  )
}

// Printable payment receipt. Shown as an overlay; the print stylesheet hides
// everything except .yff-receipt so "Print / Save as PDF" produces a clean
// one-page receipt on both phones and laptops.
function ReceiptOverlay({ order, onClose }: { order: Order; onClose: () => void }) {
  const { lang } = useLang()
  const placed = new Date(order.created_at).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const paymentRef = order.razorpay_payment_id || order.order_code || order.id

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .yff-receipt, .yff-receipt * { visibility: visible !important; }
        .yff-receipt { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; }
        .yff-no-print { display: none !important; }
      }`}</style>

      <div className="yff-receipt bg-white rounded-2xl w-full max-w-sm p-6 my-auto">
        <div className="text-center border-b border-dashed border-gray-300 pb-3">
          <p className="text-lg font-extrabold text-green-700">YourFamilyFarmer</p>
          <p className="text-[11px] text-gray-500">Payment Receipt / చెల్లింపు రసీదు</p>
        </div>

        <div className="py-3 space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-gray-500">Order ID / ఆర్డర్ ID</span><span className="font-mono font-bold text-gray-900">{order.order_code || order.id.slice(0, 8)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Date / తేదీ</span><span className="font-semibold text-gray-900">{placed}</span></div>
          {order.farmer && (
            <div className="flex justify-between"><span className="text-gray-500">Farmer / రైతు</span><span className="font-semibold text-gray-900 text-right">{order.farmer.name} · {order.farmer.village}</span></div>
          )}
          <div className="flex justify-between"><span className="text-gray-500">Payment / చెల్లింపు</span><span className="font-semibold text-gray-900">{order.payment_method_detail || (order.payment_method === 'cod' ? 'Cash on Delivery' : order.payment_method === 'upi' ? 'UPI' : order.payment_method || '—')}</span></div>
        </div>

        <div className="border-t border-dashed border-gray-300 py-3">
          <div className="flex justify-between text-xs">
            <span className="text-gray-700">{localizeName(order.produce_name, lang)} × {order.quantity} {order.unit || 'kg'}</span>
            <span className="font-semibold text-gray-900">₹{order.total_price ?? 0}</span>
          </div>
        </div>

        <div className="border-t-2 border-gray-900 pt-2 flex justify-between items-center">
          <span className="text-sm font-bold text-gray-900">Total Paid / మొత్తం చెల్లించారు</span>
          <span className="text-lg font-extrabold text-green-700">₹{order.total_price ?? 0}</span>
        </div>

        <div className="mt-3 text-center">
          <span className="inline-block text-[10px] font-bold px-3 py-1 rounded-full bg-green-100 text-green-800">✓ PAID / చెల్లించారు</span>
        </div>

        <p className="text-[9px] text-gray-400 text-center mt-3 break-all">Ref: {paymentRef}</p>
        <p className="text-[10px] font-semibold text-green-700 text-center mt-2">Thank you for supporting our farmers — GoGrameen Team 🌱</p>
        <p className="text-[9px] text-gray-400 text-center mt-0.5">మా రైతులకు మద్దతు ఇచ్చినందుకు ధన్యవాదాలు — గోగ్రామీణ్ టీం</p>

        <div className="yff-no-print mt-5 grid grid-cols-2 gap-2">
          <button onClick={onClose} className="border border-gray-300 text-gray-700 font-bold py-2.5 rounded-xl text-sm active:bg-gray-50">Close / మూసివేయి</button>
          <button onClick={() => window.print()} className="bg-green-700 text-white font-bold py-2.5 rounded-xl text-sm active:bg-green-800">Print / ప్రింట్</button>
        </div>
      </div>
    </div>
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

// Order status timeline for self-pickup and courier orders. Home delivery has
// its own richer DeliveryPanel; this covers the pickup and courier lifecycles.
// Courier diverges after "Confirmed": Shipped → Received instead of Ready →
// Picked up, so a courier buyer sees the right milestones (and dates).
function OrderStatusPanel({ order }: { order: Order }) {
  const approved = order.status === 'approved'
  const isCourier = order.delivery_type === 'courier'
  const collected = !!order.collected_at
  const shipped = !!order.shipped_at
  const received = !!order.received_at
  // Online orders that have been paid show an extra "Payment received" step.
  const paidOnline = order.payment_method === 'upi'
    && (order.payment_status === 'paid' || order.payment_status === 'completed')

  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

  type Step = { label: string; sub: string; at: string; done: boolean }
  const steps: Step[] = [
    { label: 'Order placed / ఆర్డర్ పెట్టారు', sub: 'We received your order / మీ ఆర్డర్ అందింది', at: fmt(order.created_at), done: true },
    ...(paidOnline
      ? [{ label: 'Payment received / చెల్లింపు అందింది', sub: `${order.payment_method_detail || 'UPI'} payment confirmed / చెల్లింపు ధృవీకరించబడింది`, at: fmt(order.paid_at), done: true }]
      : []),
    { label: 'Confirmed by farmer / రైతు ధృవీకరించారు', sub: 'Farmer accepted your order / రైతు అంగీకరించారు', at: fmt(order.confirmed_at), done: approved },
    ...(isCourier
      ? [
          { label: 'Shipped / షిప్ చేయబడింది', sub: 'Farmer handed the parcel to the courier / రైతు పార్సెల్ పంపారు', at: fmt(order.shipped_at), done: shipped },
          { label: 'Received / అందుకున్నారు', sub: 'You confirmed you received it / మీరు అందుకున్నట్టు ధృవీకరించారు', at: fmt(order.received_at), done: received },
        ]
      : [
          { label: 'Ready for pickup / తీసుకెళ్లడానికి సిద్ధం', sub: order.pickup_location ? `Collect at ${order.pickup_location}` : 'Collect from the farmer / రైతు నుండి తీసుకోండి', at: '', done: approved },
          { label: 'Picked up / తీసుకున్నారు', sub: 'Collection confirmed / తీసుకున్నట్టు ధృవీకరించారు', at: fmt(order.collected_at), done: collected },
        ]),
  ]

  // Current = the furthest milestone reached (last step marked done).
  let current = 0
  steps.forEach((s, i) => { if (s.done) current = i })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Order status / ఆర్డర్ స్థితి</p>

      {/* Handover code — shown once the order is ready and before it's
          collected. The customer reads it to the farmer at pickup. */}
      {approved && !collected && order.handover_otp && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-4 py-3 text-center">
          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wide">
            Show this code to the farmer when you collect
          </p>
          <p className="text-[10px] text-amber-700 mt-0.5">
            తీసుకునేటప్పుడు ఈ కోడ్ రైతుకు చెప్పండి
          </p>
          <p className="text-4xl font-black tracking-widest text-amber-900 mt-2 font-mono">
            {order.handover_otp}
          </p>
        </div>
      )}

      <ol className="space-y-2">
        {steps.map((s, idx) => {
          const reached = idx <= current
          const isCurrent = idx === current
          return (
            <li key={s.label} className="flex items-start gap-3">
              <div className="flex flex-col items-center pt-0.5">
                <span className={`w-3 h-3 rounded-full ${reached ? 'bg-green-700' : 'bg-gray-200'} ${isCurrent ? 'ring-2 ring-green-200' : ''}`} />
                {idx < steps.length - 1 && (
                  <span className={`w-0.5 mt-0.5 ${idx < current ? 'bg-green-700' : 'bg-gray-200'}`} style={{ minHeight: 14 }} />
                )}
              </div>
              <div className="flex-1 pb-1">
                <p className={`text-xs font-bold ${reached ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</p>
                <p className="text-[10px] text-gray-500 leading-snug">{s.sub}</p>
                {s.at && reached && <p className="text-[10px] text-gray-400 mt-0.5">{s.at}</p>}
              </div>
            </li>
          )
        })}
      </ol>
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
    { label: 'Refund initiated / రీఫండ్ మొదలైంది', sub: 'We started your refund / మీ రీఫండ్ ప్రారంభించాం' },
    { label: 'Processing / ప్రాసెస్ అవుతోంది', sub: 'Sent to your bank/UPI / మీ బ్యాంక్/UPIకి పంపాం' },
    { label: 'Credited / జమ అయింది', sub: 'Reflects in 3–5 business days / 3–5 పని రోజుల్లో కనిపిస్తుంది' },
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
        <p className="text-sm text-red-800 leading-snug">
          మీ ₹{amount} రీఫండ్ ప్రాసెస్ కాలేదు. దయచేసి సపోర్ట్‌ను సంప్రదించండి, మేము సరి చేస్తాం.
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

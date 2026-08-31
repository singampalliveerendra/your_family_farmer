'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'
import { isOrderPaid, isPaymentClaimed } from '@/lib/payment'
import { harvestClock } from '@/lib/harvest'
import { requireFarmerSession } from '@/lib/farmer-auth-client'
import { useFarmerRiders } from '@/lib/farmer-riders'
import { useOrderPolling } from '@/lib/useOrderPolling'
import { formatQty } from '@/lib/saleStep'
import {
  type DeliveryStatus,
  deliveryReached,
  farmerDeliveryStage,
  formatStageAt,
  isHandedOver,
  isRiderFlow,
} from '@/lib/delivery'

function isOnlinePayment(method: string | null | undefined): boolean {
  return method === 'razorpay' || method === 'upi'
}

// Full order row for the farmer's detail view. handover_otp is deliberately NOT
// fetched — the pickup code must come from the customer, so the farmer's browser
// never sees it (same rule the orders list follows).
type Order = {
  id: string
  farmer_id: string
  order_code: string | null
  produce_name: string | null
  quantity: number | null
  unit: string | null
  total_price: number | null
  // Platform fee collected on this order (₹0 when none applied). Goes to the
  // platform, not the farmer.
  platform_fee: number | null
  buyer_name: string | null
  buyer_phone: string | null
  pickup_location: string | null
  pickup_phone: string | null
  status: 'pending' | 'approved' | 'declined' | 'cancelled'
  payment_method: string | null
  payment_status: string | null
  utr_number: string | null
  decline_reason: string | null
  refund_status: string | null
  refund_amount: number | null
  refunded_at: string | null
  created_at: string
  confirmed_at: string | null
  paid_at: string | null
  delivery_type: 'self_pickup' | 'home_delivery' | 'courier' | null
  delivery_status: DeliveryStatus | null
  delivery_boy_id: string | null
  delivery_address: string | null
  delivery_city: string | null
  delivery_landmark: string | null
  delivery_pincode: string | null
  delivery_alt_phone: string | null
  assigned_at: string | null
  picked_up_at: string | null
  out_for_delivery_at: string | null
  delivered_at: string | null
  collected_at: string | null
  shipped_at: string | null
  received_at: string | null
  fulfillment_date: string | null
  acknowledged_at: string | null
  reschedule_reason?: string | null
  harvest_id?: string | null
  // Embedded harvest this order was placed against (object or 1-el array).
  harvest?: { harvested_at: string; shelf_life_days?: number | null } | Array<{ harvested_at: string; shelf_life_days?: number | null }> | null
}

// Fetch this order through the authenticated farmer route. The column list now
// lives server-side in src/lib/orderColumns.ts — the page no longer talks to
// Postgres directly, so it no longer needs to know the schema.
async function fetchOrder(orderId: string): Promise<Order | null> {
  const r = await fetch(`/api/farmer/orders/${orderId}`, { credentials: 'same-origin' }).catch(() => null)
  if (!r || !r.ok) return null
  const json = await r.json().catch(() => null)
  return (json?.order ?? null) as Order | null
}

export default function FarmerOrderDetailPage() {
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === 'string' ? params.id : ''
  const { tx, L } = useLang()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return

    let cancelled = false
    setLoading(true)

    void (async () => {
      // Cookie-verified, so an expired session lands on the login page instead
      // of an order page whose buttons all answer "Please log in."
      const farmerId = await requireFarmerSession()
      if (!farmerId || cancelled) return

      // Read through the API route: it scopes to the farmer id in the signed
      // session cookie, so another farmer's order cannot be surfaced even with a
      // guessed id — and the reschedule reason comes back in the same response
      // instead of a second best-effort query.
      const data = await fetchOrder(id)
      if (cancelled) return
      if (!data) { setNotFound(true); setLoading(false); return }
      setOrder(data)
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [id])

  // Live updates: when this order changes (buyer cancels, rider picks up /
  // delivers, payment confirms…), refetch it instantly so the farmer sees the
  // new status without refreshing. The read stays scoped to this farmer's own
  // order, exactly like the initial load — realtime only triggers the refetch.
  // Polling replaces the realtime subscription — `orders` is no longer readable
  // with the anon key, and postgres_changes on an unreadable table goes quiet
  // without erroring. useOrderPolling also refetches on tab focus, which is what
  // the old visibilitychange safety net was for.
  const reload = useCallback(async () => {
    const data = await fetchOrder(id)
    if (data) setOrder(data)
  }, [id])
  useOrderPolling(reload, !!id)

  // Assigned rider's contact for home deliveries (mirrors the card). Read via
  // the farmer API, not straight from delivery_boys: that table is service-role
  // only, so the anon client this page uses gets an empty result every time —
  // which is why the rider's number never used to show up here.
  const riders = useFarmerRiders()
  const rider = order?.delivery_boy_id ? riders[order.id] ?? null : null

  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

  const isCod = !order?.payment_method || order?.payment_method === 'cod'
  // Once an order is handed over (collected at pickup / received on delivery)
  // the money has changed hands — cash is taken at pickup, and an online order
  // would never be shipped unpaid. So a delivered order is settled regardless
  // of whether payment_status was explicitly flipped to 'completed'.
  // A rider-closed home delivery never stamps received_at (the rider's route
  // sets delivery_status + delivered_at), so it has to count here too — else a
  // COD order the rider already delivered still reads "Payment Pending".
  const isDelivered = !!order && isHandedOver(order)
  const isPaid = isOrderPaid(order?.payment_status) || isDelivered
  const isDelivery = order?.delivery_type === 'home_delivery'
  const isCourier = order?.delivery_type === 'courier'
  // Home delivery that a rider has actually taken on. Home deliveries with no
  // rider are farmer-fulfilled, so they follow the farmer's Shipped flow — the
  // same rule the orders list uses to decide which buttons to show.
  const riderFlow = !!order && isRiderFlow(order)
  const riderStage = farmerDeliveryStage(
    order ?? {},
    rider?.name?.trim() || L('The delivery boy', 'డెలివరీ బాయ్'),
    L,
  )
  // Self-pickup: the buyer collects from the farm, so the dispatch milestone
  // reads "Picked up" rather than the courier/delivery wording "Shipped".
  const isPickup = !!order && !isDelivery && !isCourier

  const statusBadge = (s: Order['status']) =>
    s === 'approved' ? 'bg-green-100 text-green-800'
      : s === 'declined' ? 'bg-red-100 text-red-700'
      : s === 'cancelled' ? 'bg-gray-200 text-gray-700'
      : 'bg-amber-100 text-amber-800'

  const statusText = (s: Order['status']) =>
    s === 'approved' ? tx.statusApproved
      : s === 'declined' ? tx.statusDeclined
      : s === 'cancelled' ? L('Cancelled by buyer', 'కొనుగోలుదారు రద్దు చేశారు')
      : L('Pending', 'పెండింగ్')

  const paymentText = (o: Order) => {
    if (!o.payment_method || o.payment_method === 'cod')
      return isPaid ? L('Cash — Received', 'నగదు — అందింది') : 'Payment Pending (COD)'
    // Online payments come through the Razorpay gateway (stored as 'razorpay';
    // some legacy orders use 'upi'). Never surface the gateway name "razorpay"
    // to the farmer — show "UPI".
    if (o.payment_method === 'upi' || o.payment_method === 'razorpay')
      return isPaid ? L('UPI — Paid', 'UPI — చెల్లించారు')
        : isPaymentClaimed(o.payment_status)
          ? L('UPI — Buyer paid, verify', 'UPI — ధృవీకరించండి')
          : L('Payment Pending', 'చెల్లింపు పెండింగ్')
    return o.payment_method
  }

  // Fulfilment milestones. Two different tails, because two different things can
  // actually move an order:
  //
  //   rider flow (home delivery, rider assigned)
  //     … → Approved → Rider assigned → Picked up → Out for delivery → Delivered
  //     Driven by delivery_status + the rider's own timestamps. The rider never
  //     stamps shipped_at/received_at, so keying the tail off those columns left
  //     "Shipped" and "Delivered" greyed out forever even after the rider had
  //     delivered — the farmer's tracker simply never moved.
  //
  //   farmer flow (self-pickup, courier, home delivery with no rider)
  //     … → Approved → (Shipped) → Delivered / Collected
  //     The farmer taps Shipped, the buyer confirms receipt. Self-pickup has no
  //     in-transit step, so "Collected" is its only handover milestone.
  //
  // Both mirror what the buyer sees on their side, so neither party is looking
  // at a tracker the other would disagree with.
  const milestones: { label: string; at: string | null; done: boolean }[] = order
    ? (() => {
        const approved = order.status === 'approved'
        const paidOnline = isOnlinePayment(order.payment_method) && isOrderPaid(order.payment_status)

        const head = [
          { label: L('Order placed', 'ఆర్డర్ వచ్చింది'), at: order.created_at, done: true },
          ...(paidOnline
            ? [{ label: L('Payment received', 'చెల్లింపు అందింది'), at: order.paid_at, done: true }]
            : []),
        ]

        if (riderFlow) {
          const reached = (s: DeliveryStatus) => deliveryReached(order.delivery_status, s)
          return [
            ...head,
            { label: L('Approved by you', 'మీరు ఆమోదించారు'), at: order.confirmed_at, done: approved || reached('assigned') },
            { label: L('Rider assigned', 'రైడర్ కేటాయించారు'), at: order.assigned_at, done: reached('assigned') },
            { label: L('Picked up from you', 'మీ వద్ద నుండి తీసుకెళ్లారు'), at: order.picked_up_at, done: reached('picked_up') },
            { label: L('Out for delivery', 'డెలివరీకి బయలుదేరారు'), at: order.out_for_delivery_at, done: reached('out_for_delivery') },
            { label: L('Delivered to buyer', 'కొనుగోలుదారుకు అందింది'), at: order.delivered_at || order.received_at, done: reached('delivered') },
          ]
        }

        const delivered = !!order.received_at || !!order.collected_at
        return [
          ...head,
          { label: L('Approved by you', 'మీరు ఆమోదించారు'), at: order.confirmed_at, done: approved || delivered },
          ...(isPickup
            ? []
            : [{ label: L('Shipped', 'షిప్ చేశారు'), at: order.shipped_at, done: !!order.shipped_at }]),
          { label: isPickup ? L('Collected', 'తీసుకువెళ్ళారు') : L('Delivered', 'డెలివరీ అయింది'), at: order.received_at || order.collected_at, done: delivered },
        ]
      })()
    : []

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      <div className="bg-green-900 px-4 pt-6 pb-10">
        <Link href="/farmer/dashboard/orders" className="text-green-300 text-sm flex items-center gap-1 mb-4">
          ← {tx.back}
        </Link>
        <h1 className="text-white text-xl font-extrabold leading-tight">
          {L('Order details', 'ఆర్డర్ వివరాలు')}
        </h1>
        {order?.order_code && (
          <p className="text-green-300 text-sm mt-1 font-mono">{order.order_code}</p>
        )}
      </div>

      <div className="px-4 -mt-5 space-y-4 max-w-lg mx-auto">
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
            <div className="w-9 h-9 border-4 border-green-700 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 text-sm mt-3">{tx.loadingLabel}</p>
          </div>
        ) : notFound || !order ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center space-y-3">
            <div className="text-4xl">🔍</div>
            <p className="font-semibold text-gray-600 text-sm">
              {L('Order not found', 'ఆర్డర్ కనబడలేదు')}
            </p>
            <Link href="/farmer/dashboard/orders" className="inline-block text-green-700 text-sm font-bold underline">
              {L('Back to orders', 'ఆర్డర్లకు తిరిగి వెళ్ళు')}
            </Link>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-extrabold text-gray-900 leading-tight">
                    {order.produce_name || '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatQty(order.quantity)} {order.unit || 'kg'}
                    {order.total_price ? ` · ₹${order.total_price}` : ''}
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${statusBadge(order.status)}`}>
                  {statusText(order.status)}
                </span>
              </div>

              {/* Which harvest this order is against — the farmer knows exactly
                  which pick to prepare. */}
              {(() => {
                const h = Array.isArray(order.harvest) ? order.harvest[0] : order.harvest
                if (!h?.harvested_at) return null
                return (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">🌾 {L('Against harvest', 'ఈ కోతకు')}</p>
                    <p className="text-xs font-semibold text-green-900 mt-0.5">
                      {harvestClock(h.harvested_at, L)}
                      <span className="font-normal text-green-700"> · {new Date(h.harvested_at).toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}</span>
                    </p>
                  </div>
                )
              })()}

              {/* Price breakdown — item amount, the platform fee collected on
                  this order (goes to the platform, not the farmer; ₹0 when no
                  fee applied) and the total the buyer pays. */}
              <div className="pt-2 border-t border-gray-100 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">{L('Your Price', 'మీ ధర')}</span>
                  <span className="font-semibold text-gray-900">₹{order.total_price ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">{L('Platform fee collected', 'వసూలు చేసిన ప్లాట్‌ఫామ్ ఫీజు')}</span>
                  <span className="font-semibold text-gray-900">₹{order.platform_fee ?? 0}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  <span className="text-sm font-bold text-gray-900">{L('Buyer pays', 'కొనుగోలుదారు చెల్లించేది')}</span>
                  <span className="text-sm font-extrabold text-green-700">
                    ₹{(order.total_price ?? 0) + (order.platform_fee ?? 0)}
                  </span>
                </div>
                {order.refund_status && order.refund_status !== 'failed' && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-100">
                    <span className="text-gray-500">
                      {order.refund_status === 'processed' ? L('Refunded to buyer', 'కొనుగోలుదారుకు రీఫండ్ అయింది') : L('Refund initiated', 'రీఫండ్ ప్రారంభమైంది')}
                    </span>
                    <span className="font-semibold text-purple-700">₹{order.refund_amount ?? order.total_price ?? 0}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">{L('Placed', 'పెట్టారు')}</p>
                  <p className="text-xs font-semibold text-gray-700">{fmt(order.created_at)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">{L('Payment', 'చెల్లింపు')}</p>
                  <p className="text-xs font-semibold text-gray-700">{paymentText(order)}</p>
                  {(order.payment_method === 'upi' || order.payment_method === 'razorpay') && order.utr_number && (
                    <p className="text-[11px] text-gray-500 font-mono">UTR: {order.utr_number}</p>
                  )}
                </div>
                {order.status !== 'declined' && order.status !== 'cancelled' && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">
                      {isDelivery ? tx.deliveryDateLabel : tx.pickupDateLabel}
                    </p>
                    <p className="text-xs font-semibold text-gray-700">
                      {order.fulfillment_date ? fmt(order.fulfillment_date) : L('Not set', 'సెట్ చేయలేదు')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Buyer */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{L('Buyer', 'కొనుగోలుదారు')}</p>
              <p className="text-base font-extrabold text-gray-900 leading-tight">{order.buyer_name || '—'}</p>
              {order.buyer_phone && (
                <a
                  href={`tel:+91${order.buyer_phone}`}
                  className="mt-1 w-full inline-flex items-center justify-center gap-2 bg-green-600 text-white font-bold py-3 rounded-xl text-sm active:bg-green-700"
                >
                  📞 {L('Call', 'కాల్')} · +91 {order.buyer_phone}
                </a>
              )}
              {order.delivery_alt_phone && (
                <p className="text-xs text-gray-500">{L('Alt phone', 'ప్రత్యామ్నాయ ఫోన్')}: +91 {order.delivery_alt_phone}</p>
              )}
            </div>

            {/* Fulfilment: pickup location or delivery address */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                {isDelivery ? L('Home delivery', 'ఇంటికి డెలివరీ') : isCourier ? L('Courier', 'కొరియర్') : L('Self pickup', 'స్వయంగా తీసుకోవడం')}
              </p>
              {(isDelivery || isCourier) && order.delivery_address ? (
                <>
                  <p className="text-sm text-gray-800 leading-snug whitespace-pre-line">📦 {order.delivery_address}</p>
                  {order.delivery_city && <p className="text-xs text-gray-600">🏙️ {order.delivery_city}</p>}
                  {order.delivery_landmark && <p className="text-xs text-gray-600">📍 {order.delivery_landmark}</p>}
                  {order.delivery_pincode && <p className="text-xs text-gray-600">PIN: {order.delivery_pincode}</p>}
                </>
              ) : order.pickup_location ? (
                <p className="text-sm text-gray-800">📍 {order.pickup_location}</p>
              ) : (
                <p className="text-xs text-gray-500">—</p>
              )}
              {/* Whom to call at the pickup point — often not the account
                  holder. Tappable, since the farmer is usually standing there
                  waiting when they need it. Hidden when it just repeats
                  buyer_phone, which is already shown above. */}
              {!isDelivery && !isCourier && order.pickup_phone && order.pickup_phone !== order.buyer_phone && (
                <p className="text-xs text-gray-600">
                  📞 {L('Pickup contact', 'పికప్ సంప్రదింపు')}:{' '}
                  <a href={`tel:${order.pickup_phone}`} className="text-blue-700 underline font-semibold">
                    +91 {order.pickup_phone}
                  </a>
                </p>
              )}
              {order.fulfillment_date && order.status !== 'declined' && order.status !== 'cancelled' && (
                <p className="text-sm font-bold text-green-700 pt-1">
                  📅 {isDelivery ? tx.deliveryDateLabel : tx.pickupDateLabel}: {fmt(order.fulfillment_date)}
                </p>
              )}
              {order.reschedule_reason && order.status !== 'declined' && order.status !== 'cancelled' && (
                <p className="text-[11px] text-amber-700 leading-snug">
                  ⚠️ {L('Date change reason (shown to buyer)', 'తేదీ మార్పు కారణం (కొనుగోలుదారుకు చూపబడుతుంది)')}: {order.reschedule_reason}
                </p>
              )}
              {/* Rider panel. Shown on every home delivery — not only once the
                  contact has loaded — so the farmer always knows whether anyone
                  has taken the order, and what that person is doing right now. */}
              {isDelivery && order.status !== 'declined' && order.status !== 'cancelled' && (
                <div className="border-t border-gray-100 pt-2 mt-1 space-y-1">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">
                    {L('Delivery boy', 'డెలివరీ బాయ్')}
                    {riderStage.at ? ` · ${formatStageAt(riderStage.at)}` : ''}
                  </p>
                  {rider ? (
                    <>
                      <p className="text-sm font-bold text-gray-900">{rider.name || L('Rider', 'రైడర్')}</p>
                      <a href={`tel:${rider.phone}`} className="text-xs font-semibold text-blue-700">
                        📞 {rider.phone}
                      </a>
                    </>
                  ) : (
                    <p className="text-sm font-bold text-gray-500">{riderStage.title}</p>
                  )}
                  <p className="text-xs text-gray-600 leading-snug">{riderStage.body}</p>
                </div>
              )}
            </div>

            {/* Timeline */}
            {order.status !== 'declined' && order.status !== 'cancelled' && (
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{L('Progress', 'పురోగతి')}</p>
                <ol className="space-y-2">
                  {milestones.map((m, idx) => (
                    <li key={m.label} className="flex items-start gap-3">
                      <div className="flex flex-col items-center pt-0.5">
                        <span className={`w-3 h-3 rounded-full ${m.done ? 'bg-green-700' : 'bg-gray-200'}`} />
                        {idx < milestones.length - 1 && (
                          <span className={`w-0.5 mt-0.5 ${m.done ? 'bg-green-700' : 'bg-gray-200'}`} style={{ minHeight: 14 }} />
                        )}
                      </div>
                      <div className="flex-1 pb-1">
                        <p className={`text-xs font-bold ${m.done ? 'text-gray-900' : 'text-gray-400'}`}>{m.label}</p>
                        {m.at && m.done && <p className="text-[10px] text-gray-400 mt-0.5">{fmt(m.at)}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Decline / cancellation reason */}
            {(order.status === 'declined' || order.status === 'cancelled') && order.decline_reason && (
              <div className={`rounded-2xl p-4 border ${order.status === 'declined' ? 'bg-red-50 border-red-200' : 'bg-gray-100 border-gray-200'}`}>
                <p className={`text-xs font-bold uppercase tracking-wide ${order.status === 'declined' ? 'text-red-700' : 'text-gray-500'}`}>
                  {order.status === 'declined' ? L('Decline reason', 'తిరస్కరణ కారణం') : L('Cancellation reason', 'రద్దు కారణం')}
                </p>
                <p className={`text-sm mt-1 leading-snug ${order.status === 'declined' ? 'text-red-800' : 'text-gray-700'}`}>
                  {order.decline_reason}
                </p>
              </div>
            )}

            {/* Refund */}
            {(order.refund_status || (order.refund_amount ?? 0) > 0) && (
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
                <p className="text-sm font-bold text-purple-800">
                  💸 {L('Refund to buyer', 'కొనుగోలుదారుకు రీఫండ్')}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  ₹{order.refund_amount ?? order.total_price ?? 0} · {L('reflects in 3–5 business days', '3–5 పని రోజుల్లో')}
                  {order.refunded_at && ` · ${fmt(order.refunded_at)}`}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

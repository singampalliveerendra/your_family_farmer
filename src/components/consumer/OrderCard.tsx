'use client'

import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'
import { localizeName } from '@/lib/localizeName'
import type { MyReview } from '@/components/consumer/ProduceReviewBox'

type DeliveryStatus = 'unassigned' | 'assigned' | 'picked_up' | 'out_for_delivery' | 'delivered'

export type ConsumerOrder = {
  id: string
  order_code: string | null
  produce_name: string | null
  produce_listing_id?: string | null
  quantity: number | null
  unit: string | null
  total_price: number | null
  // Platform fee stamped on this row (cart's first row carries it, 0 on the
  // rest). Withheld — not refunded — when the BUYER cancels, so the cancel modal
  // can preview the deduction.
  platform_fee?: number | null
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
  delivery_type?: 'self_pickup' | 'home_delivery' | 'courier' | null
  delivery_status?: DeliveryStatus | null
  shipped_at?: string | null
  collected_at?: string | null
  received_at?: string | null
  delivered_at?: string | null
  // When the buyer acknowledged a declined/cancelled order (moves it to history).
  acknowledged_at?: string | null
  // The buyer's own feedback for this order, if they've left any.
  my_review?: MyReview | null
}

// A completed order — delivered / picked up / received, and not declined or
// cancelled. Feedback on these is published as a public produce rating; feedback
// on any other order is kept private. Mirrors the gate in /api/produce-reviews.
export const isCompleted = (o: ConsumerOrder) =>
  o.status !== 'declined'
  && o.status !== 'cancelled'
  && (o.delivery_status === 'delivered' || !!o.collected_at || !!o.received_at || !!o.delivered_at)

// An order is "resolved" once it reaches a terminal state: delivered (home
// delivery), picked up (self-pickup) or received (courier). A farmer-DECLINED
// order is only resolved once the buyer has acknowledged it — until then it
// stays in the Active list with an Acknowledge button so a decline never
// silently drops into history. A buyer-CANCELLED order is resolved straight
// away: the buyer cancelled it themselves, so it goes to their history at once
// (it's the FARMER who now acknowledges that cancellation, on their dashboard).
// Active = everything else still in progress. Shared so the active list and the
// history page agree on where each order belongs.
export const isResolved = (o: ConsumerOrder) =>
  (o.status === 'declined' && !!o.acknowledged_at)
  || o.status === 'cancelled'
  || o.delivery_status === 'delivered'
  || !!o.collected_at
  || !!o.received_at

// A farmer-declined order still waiting on the buyer's acknowledgement. Shown in
// the Active list with an Acknowledge button. A buyer's own cancellation does
// NOT need their acknowledgement — that's resolved on the farmer's side instead.
export const needsAcknowledge = (o: ConsumerOrder) =>
  o.status === 'declined' && !o.acknowledged_at

// The buyer may cancel any time UP TO the point the order is shipped or handed
// over — i.e. while it is still pending OR approved-and-awaiting. Cancel is
// blocked once it has been shipped (farmer shipped it, or a rider has picked it
// up and is in transit) or resolved (picked up / delivered / received). There is
// no time limit — only the order's progress decides. Shared so the card, the
// order detail page and the cancel API all agree.
export const canBuyerCancel = (o: {
  status: 'pending' | 'approved' | 'declined' | 'cancelled'
  shipped_at?: string | null
  collected_at?: string | null
  received_at?: string | null
  delivery_status?: DeliveryStatus | null
}) =>
  (o.status === 'pending' || o.status === 'approved')
  && !o.shipped_at
  && !o.collected_at
  && !o.received_at
  && o.delivery_status !== 'picked_up'
  && o.delivery_status !== 'out_for_delivery'
  && o.delivery_status !== 'delivered'

export default function OrderCard({
  order,
  onComplaint,
  onFeedback,
  onAcknowledge,
  onConfirmReceipt,
  onCancel,
  busy = false,
}: {
  order: ConsumerOrder
  onComplaint: (orderCode: string) => void
  onFeedback?: (order: ConsumerOrder) => void
  // Acknowledge a declined/cancelled order (moves it to history).
  onAcknowledge?: (order: ConsumerOrder) => void
  // Confirm a shipped order was delivered/received.
  onConfirmReceipt?: (order: ConsumerOrder) => void
  // Cancel a still-pending order (opens the reason modal in the parent).
  onCancel?: (order: ConsumerOrder) => void
  // The parent is mid-request for this card (disables the action buttons).
  busy?: boolean
}) {
  const { tx, lang, L } = useLang()
  const reviewed = Boolean(order.my_review)
  const completed = isCompleted(order)
  const awaitingAck = needsAcknowledge(order)
  // The buyer confirms delivery themselves, once the farmer has marked the order
  // shipped — for every farmer-fulfilled type (self-pickup, courier, farmer-
  // shipped home delivery). Rider home deliveries never set shipped_at (the rider
  // closes them at the door), so they're naturally excluded here.
  const canConfirmReceipt = Boolean(
    onConfirmReceipt
      && order.status !== 'cancelled'
      && order.status !== 'declined'
      && !!order.shipped_at
      && !order.collected_at
      && !order.received_at,
  )
  // Feedback is only offered once the order is completed (delivered / picked up
  // / received). Showing it on a pending order is meaningless — the buyer hasn't
  // received the produce yet. Already-reviewed orders keep the button so the
  // buyer can see / edit what they left.
  const canFeedback = Boolean(onFeedback && order.produce_listing_id && (completed || reviewed))
  // Buyer may cancel any time before the order is shipped or handed over
  // (pending or approved-and-awaiting). Shared rule with the detail page + API.
  const canCancel = Boolean(onCancel && canBuyerCancel(order))

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
      case 'assigned': return L('Rider assigned', 'రైడర్ కేటాయించబడ్డారు')
      case 'picked_up': return L('Picked up', 'తీసుకున్నారు')
      case 'out_for_delivery': return L('Out for delivery', 'డెలివరీకి బయలుదేరారు')
      case 'delivered': return L('Delivered', 'డెలివరీ అయింది')
      default: return L('Waiting for rider', 'రైడర్ కోసం వేచి ఉంది')
    }
  }

  // Home-delivery status line. With a rider assigned it's the rider flow; with
  // no rider it's farmer-shipped, so we show the Shipped → Received progress.
  const homeDeliveryLabel = () => {
    const ds = order.delivery_status
    const riderAssigned = ds != null && ds !== 'unassigned'
    if (riderAssigned) return deliveryStatusLabel(ds)
    if (order.received_at) return L('Delivered', 'డెలివరీ అయింది')
    if (order.shipped_at) return L('On the way', 'దారిలో ఉంది')
    return L('Preparing your order', 'ఆర్డర్ సిద్ధం చేస్తున్నారు')
  }

  const statusLabel = (s: string) =>
    s === 'approved' ? tx.statusConfirmed
      : s === 'declined' ? tx.statusDeclined
      : s === 'cancelled' ? tx.statusCancelled
      : tx.statusPending

  const paymentBadge = () => {
    if (!order.payment_method || order.payment_method === 'cod') return null
    // Online payments now go through Razorpay.
    if (order.payment_method === 'razorpay' && order.payment_status === 'paid') {
      return { label: L('✓ Paid online', 'ఆన్‌లైన్ చెల్లించారు'), cls: 'bg-green-100 text-green-800' }
    }
    // Manual UPI is retired — legacy UPI orders show no pay prompt.
    return null
  }

  const badge = paymentBadge()

  return (
    <Link href={`/consumer/orders/${order.id}`} className="block">
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden active:bg-gray-50">
        <div className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-extrabold text-gray-900 text-sm leading-tight">
                {localizeName(order.produce_name, lang) || '—'}
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
                  💸 {order.refund_status === 'processed' ? L('Refunded', 'రీఫండ్ అయింది') : L('Refund initiated', 'రీఫండ్ ప్రారంభమైంది')}
                </span>
              )}
              {order.refund_status === 'failed' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-red-100 text-red-800">
                  {L('⚠️ Refund failed', '⚠️ రీఫండ్ విఫలమైంది')}
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
              🛵 {L('Home delivery', 'హోమ్ డెలివరీ')} · {homeDeliveryLabel()}
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
                {L('Reason', 'కారణం')}
              </p>
              <p className="text-xs text-red-800 mt-0.5 leading-snug">{order.decline_reason}</p>
            </div>
          )}

          {/* Refund message — shown when a paid order was declined */}
          {order.status === 'declined' && order.refund_status === 'initiated' && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 mt-1">
              <p className="text-xs text-purple-800 leading-snug">
                {L(
                  `Your payment of Rs.${order.total_price ?? 0} will be refunded to your account in 3-5 business days`,
                  `మీ చెల్లింపు Rs.${order.total_price ?? 0} 3-5 పని దినాలలో తిరిగి వస్తుంది`,
                )}
              </p>
            </div>
          )}

          {/* Confirm delivery — once the farmer marked it shipped, the buyer
              taps this to close the order. */}
          {canConfirmReceipt && (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onConfirmReceipt!(order)
              }}
              className="mt-1 w-full text-center text-xs font-bold text-white bg-green-600 rounded-xl py-2.5 active:bg-green-700 disabled:opacity-50"
            >
              {busy ? '…' : `✓ ${order.delivery_type === 'self_pickup' || !order.delivery_type ? L('Mark as Picked up', 'తీసుకున్నారు') : L('Mark as Delivered', 'డెలివరీ అయింది')}`}
            </button>
          )}

          {/* Acknowledge — a declined/cancelled order the buyer hasn't seen yet.
              Tapping it moves the order to history. */}
          {awaitingAck && onAcknowledge && (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onAcknowledge(order)
              }}
              className="mt-1 w-full text-center text-xs font-bold text-white bg-gray-700 rounded-xl py-2.5 active:bg-gray-800 disabled:opacity-50"
            >
              {busy ? '…' : `✓ ${L('Acknowledge — move to history', 'గుర్తించాను — చరిత్రకు తరలించు')}`}
            </button>
          )}

          {/* Cancel — a still-pending order within the 30-min window. Opens the
              reason modal in the parent. */}
          {canCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCancel!(order)
              }}
              className="mt-1 w-full text-center text-xs font-bold text-red-600 bg-white border border-red-300 rounded-xl py-2.5 active:bg-red-50 disabled:opacity-50"
            >
              {busy ? '…' : `✕ ${L('Cancel order', 'ఆర్డర్ రద్దు')}`}
            </button>
          )}

          {/* Per-order actions — complaint + feedback. Both open shared modals
              pinned to this order, and stop the card's link from navigating. */}
          <div className="pt-1 flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onComplaint(order.order_code ?? '')
              }}
              className="flex-1 text-center text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl py-2.5 active:bg-amber-100"
            >
              🛟 {L('Log a Complaint', 'ఫిర్యాదు')}
            </button>
            {canFeedback && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onFeedback!(order)
                }}
                className={`flex-1 text-center text-xs font-bold rounded-xl py-2.5 border ${
                  reviewed
                    ? 'text-green-700 bg-green-50 border-green-200 active:bg-green-100'
                    : 'text-green-800 bg-white border-green-300 active:bg-green-50'
                }`}
              >
                {reviewed
                  ? `⭐ ${L('Feedback given', 'అభిప్రాయం ఇచ్చారు')}`
                  : `⭐ ${completed ? L('Rate harvest', 'రేటింగ్ ఇవ్వండి') : L('Give feedback', 'అభిప్రాయం')}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'

export type DeliveryStatus = 'unassigned' | 'assigned' | 'picked_up' | 'out_for_delivery' | 'delivered'

// Shared farmer-side order shape. Superset of the columns the dashboard and the
// Orders page each fetch, so the same card renders on both.
export type FarmerOrder = {
  id: string
  farmer_id: string
  order_code?: string | null
  produce_listing_id: string | null
  produce_name: string | null
  quantity: number | null
  unit: string | null
  total_price: number | null
  buyer_name: string | null
  buyer_phone: string | null
  pickup_location: string | null
  status: 'pending' | 'approved' | 'declined' | 'cancelled'
  payment_method?: string | null
  payment_status: string | null
  utr_number?: string | null
  decline_reason: string | null
  refund_status?: string | null
  refund_amount?: number | null
  refunded_at?: string | null
  created_at: string
  delivery_type?: 'self_pickup' | 'home_delivery' | 'courier' | null
  delivery_status?: DeliveryStatus | null
  delivery_boy_id?: string | null
  fulfillment_date?: string | null
  collected_at?: string | null
  shipped_at?: string | null
  received_at?: string | null
  // When the farmer acknowledged a buyer-cancelled order (moves it to history).
  acknowledged_at?: string | null
  // Reason the farmer gave when changing the pickup/delivery date after approval
  // (shown to the buyer). Optional — column may not exist before its migration.
  reschedule_reason?: string | null
  rescheduled_at?: string | null
}

// An approved order is "resolved" (and so leaves the farmer's active list) once:
//   self_pickup   → the buyer collected it (collected_at set)
//   courier       → the buyer confirmed receipt (received_at set); note a
//                   shipped-but-unreceived courier order stays active
//   home_delivery → rider flow: the rider delivered it (delivery_status
//                   'delivered'); farmer-ships flow: the buyer confirmed
//                   receipt (received_at set)
export function isResolved(o: FarmerOrder): boolean {
  // A buyer-cancelled order is NOT resolved until the farmer acknowledges it.
  // Until then it stays in the active list so the farmer sees the cancellation
  // instead of it silently dropping into history. Once acknowledged, it's done.
  if (o.status === 'cancelled') return !!o.acknowledged_at
  if (o.status !== 'approved') return false
  if (o.delivery_type === 'home_delivery') return o.delivery_status === 'delivered' || !!o.received_at
  if (o.delivery_type === 'courier') return !!o.received_at
  return !!o.collected_at
}

export default function OrderCard({
  order,
  processing,
  processingPaid,
  onApprove,
  onDecline,
  onAcknowledge,
  onMarkPaid,
  onUpdatePaymentStatus,
  onSetFulfillmentDate,
  onMarkPickedUp,
  onMarkDelivered,
}: {
  order: FarmerOrder
  processing: boolean
  processingPaid: boolean
  onApprove: (date: string) => void
  onDecline: () => void
  onAcknowledge: () => void
  onMarkPaid: () => void
  onUpdatePaymentStatus: (status: 'completed' | 'failed' | 'pending') => void
  // For a pending order, called with just the date (the gate to approval). For
  // an already-approved order, a reason is required and passed too — the buyer
  // sees it, so a date change is never silent.
  onSetFulfillmentDate: (date: string, reason?: string) => void
  // Handover confirmation: the buyer reads their 4-digit code, the farmer enters
  // it. A self-pickup closes via onMarkPickedUp; a farmer-delivered order via
  // onMarkDelivered. Both verify the code server-side and report back so the
  // card can show a "wrong code" message.
  onMarkPickedUp: (code: string) => Promise<{ ok: boolean; error?: string }>
  onMarkDelivered: (code: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const { tx, L } = useLang()
  const router = useRouter()
  const openDetails = () => router.push(`/farmer/dashboard/orders/${order.id}`)
  const isDelivery = order.delivery_type === 'home_delivery'
  const isCourier = order.delivery_type === 'courier'
  const isPickup = !isDelivery && !isCourier
  const isShipped = !!order.shipped_at
  // A home delivery is in the rider flow once a rider is assigned (delivery
  // status moved past 'unassigned'). Those stay rider-closed; home deliveries
  // with no rider are farmer-shipped, so the farmer marks them Shipped.
  const riderAssigned = isDelivery
    && order.delivery_status != null
    && order.delivery_status !== 'unassigned'
  const isApproved = order.status === 'approved'
  const fulfillmentDate = order.fulfillment_date ?? ''
  // Local (not UTC) "today" so the picker still allows today's date in IST
  // evenings. Used as the minimum selectable pickup/delivery date. Computed
  // once on mount via the lazy initializer.
  const [todayStr] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  // Reschedule editor state for an APPROVED order: the date is read-only until
  // the farmer taps "Change date", which reveals a date picker + a required
  // reason that the buyer will see.
  const [editingDate, setEditingDate] = useState(false)
  const [newDate, setNewDate] = useState(fulfillmentDate)
  const [rescheduleReason, setRescheduleReason] = useState('')

  // Handover code entry. Tapping "Picked Up" / "Delivered" reveals a 4-digit
  // box; the farmer types the code the buyer reads out. The farmer never sees
  // the code — it must come from the customer.
  const [enteringCode, setEnteringCode] = useState(false)
  const [handoverCode, setHandoverCode] = useState('')
  const [codeError, setCodeError] = useState('')

  const submitHandoverCode = async () => {
    if (!/^\d{4}$/.test(handoverCode)) {
      setCodeError(L('Enter the 4-digit code from the customer.', 'కస్టమర్ నుండి 4-అంకెల కోడ్ నమోదు చేయండి.'))
      return
    }
    setCodeError('')
    const res = isPickup ? await onMarkPickedUp(handoverCode) : await onMarkDelivered(handoverCode)
    if (!res.ok) {
      setCodeError(res.error || L('Wrong code. Ask the customer to read it again.', 'తప్పు కోడ్. కస్టమర్‌ను మళ్ళీ చదవమని అడగండి.'))
    }
    // On success the parent resolves the order and this card re-renders away.
  }

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  const isCod = !order.payment_method || order.payment_method === 'cod'
  const isUpi = order.payment_method === 'upi'
  const isPaid = order.payment_status === 'completed'
  const isPaymentClaimed = order.payment_status === 'payment_claimed' || order.payment_status === 'pending_confirmation'

  // Buyer cancelled this order. It doesn't need the approve/decline/fulfillment
  // machinery — just a clear "cancelled by buyer" notice and an Acknowledge tap
  // that moves it out of the active list and into Order History.
  if (order.status === 'cancelled') {
    return (
      <div className="border border-red-200 bg-red-50/40 rounded-2xl overflow-hidden">
        <div className="p-3 space-y-2">
          <div onClick={openDetails} role="button" className="cursor-pointer space-y-2 active:opacity-70">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-extrabold text-gray-900 text-sm leading-tight">
                    {order.buyer_name || '—'}
                  </p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 whitespace-nowrap">
                    {L('Cancelled by buyer', 'కొనుగోలుదారు రద్దు చేశారు')}
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
                  {timeAgo(order.created_at)}
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
                  <span className="font-bold text-gray-500 line-through">₹{order.total_price}</span>
                </>
              )}
            </div>
          </div>

          {order.decline_reason && (
            <div className="bg-white border border-red-200 rounded-xl px-3 py-2">
              <p className="text-[10px] font-bold text-red-700 uppercase tracking-wide">
                {L('Reason', 'కారణం')}
              </p>
              <p className="text-xs text-red-800 mt-0.5 leading-snug">{order.decline_reason}</p>
            </div>
          )}

          <button
            onClick={onAcknowledge}
            disabled={processing}
            className="w-full bg-gray-700 text-white font-bold py-2.5 rounded-xl text-sm active:bg-gray-800 disabled:opacity-50"
          >
            {processing ? '…' : `✓ ${L('Acknowledge — move to history', 'గుర్తించాను — చరిత్రకు తరలించు')}`}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`border rounded-2xl overflow-hidden ${isApproved ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}>
      <div className="p-3 space-y-1.5">
        {/* Tapping the order summary opens the full order details page. The
            phone link below stops propagation so calling never navigates. */}
        <div onClick={openDetails} role="button" className="cursor-pointer space-y-1.5 active:opacity-70">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-extrabold text-gray-900 text-sm leading-tight">
                  {order.buyer_name || '—'}
                </p>
                {isApproved && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800 whitespace-nowrap">
                    {tx.statusApproved}
                  </span>
                )}
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
            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
              {isCod && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  isPaid ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {isPaid ? `✓ ${tx.paymentReceived}` : tx.codBadge}
                </span>
              )}
              {isUpi && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  isPaid ? 'bg-green-100 text-green-800'
                  : isPaymentClaimed ? 'bg-orange-100 text-orange-800'
                  : 'bg-blue-100 text-blue-700'
                }`}>
                  {isPaid ? '✓ UPI Paid' : isPaymentClaimed ? '⏳ Buyer Paid — Verify' : '📲 UPI'}
                </span>
              )}
              <div className="flex flex-col items-end">
                <span className="text-[11px] text-gray-400 whitespace-nowrap">
                  {timeAgo(order.created_at)}
                </span>
                {order.order_code && (
                  <span className="text-[10px] font-mono font-semibold text-gray-400 whitespace-nowrap">
                    {order.order_code}
                  </span>
                )}
              </div>
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

          <p className="text-[11px] font-semibold text-green-700 pt-0.5">
            {L('View full details', 'పూర్తి వివరాలు చూడండి')} →
          </p>
        </div>

        {order.delivery_type === 'home_delivery' && (
          <DeliveryTagForFarmer order={order} />
        )}

        {/* Pickup / delivery date. */}
        <div className="pt-1">
          <label className="text-[11px] font-bold text-gray-600 block mb-1">
            📅 {isPickup ? tx.pickupDateLabel : tx.deliveryDateLabel}
          </label>

          {!isApproved ? (
            // Pending: the date is the gate to approval — the farmer picks it,
            // then confirms below. No reason needed for the first choice.
            <input
              type="date"
              value={fulfillmentDate}
              min={todayStr}
              onChange={(e) => onSetFulfillmentDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-green-500 focus:outline-none"
            />
          ) : !editingDate ? (
            // Approved: the date is locked (read-only). Changing it is a
            // deliberate action that requires a reason the buyer will see.
            <>
              <p className="text-sm font-bold text-gray-900">
                {fulfillmentDate
                  ? new Date(`${fulfillmentDate}T00:00:00`).toLocaleDateString('en-IN', {
                      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                    })
                  : '—'}
              </p>
              {fulfillmentDate && !(isCourier && isShipped) && (
                <p className="text-[11px] font-semibold text-green-700 mt-1">
                  ⏳ {isPickup ? tx.awaitingPickup : tx.awaitingDelivery}
                </p>
              )}
              <button
                type="button"
                onClick={() => { setNewDate(fulfillmentDate); setRescheduleReason(''); setEditingDate(true) }}
                disabled={processing}
                className="mt-2 text-[11px] font-bold text-green-700 underline disabled:opacity-50"
              >
                {L('Change date', 'తేదీ మార్చండి')}
              </button>
            </>
          ) : (
            // Reschedule editor: new date + a required reason for the buyer.
            <div className="space-y-2 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
              <input
                type="date"
                value={newDate}
                min={todayStr}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-green-500 focus:outline-none"
              />
              <textarea
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value.slice(0, 200))}
                rows={2}
                placeholder={L('Reason for the new date (the buyer will see this)', 'కొత్త తేదీకి కారణం (కొనుగోలుదారు చూస్తారు)')}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:border-green-500 focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEditingDate(false)}
                  className="border border-gray-300 text-gray-600 font-bold py-2 rounded-xl text-xs active:bg-gray-50"
                >
                  {tx.cancelBtn}
                </button>
                <button
                  type="button"
                  disabled={processing || !newDate || !rescheduleReason.trim() || newDate === fulfillmentDate}
                  onClick={() => { onSetFulfillmentDate(newDate, rescheduleReason.trim()); setEditingDate(false) }}
                  className="bg-green-600 text-white font-bold py-2 rounded-xl text-xs active:bg-green-700 disabled:opacity-50"
                >
                  {L('Save new date', 'కొత్త తేదీ సేవ్')}
                </button>
              </div>
              {newDate && newDate !== fulfillmentDate && !rescheduleReason.trim() && (
                <p className="text-[11px] text-amber-700">{L('Add a reason so the buyer knows why.', 'కొనుగోలుదారుకు కారణం తెలియజేయండి.')}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {isUpi && isPaymentClaimed && (
        <div className="mx-3 mb-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-3 space-y-2.5">
          <div>
            <p className="text-xs font-bold text-orange-800">
              📲 Buyer says they paid via UPI
            </p>
            <p className="text-[11px] text-orange-700 mt-0.5">
              Open your UPI app and confirm you received ₹{order.total_price ?? '?'} from {order.buyer_name || 'buyer'}.
            </p>
            {order.utr_number && (
              <p className="text-[11px] text-orange-700 mt-0.5">
                UTR: <span className="font-mono font-semibold">{order.utr_number}</span>
              </p>
            )}
          </div>
          <p className="text-xs font-bold text-gray-700">
            {L('Update Payment Status', 'చెల్లింపు స్థితి నవీకరించండి')}
          </p>
          <p className="text-[11px] text-gray-500 -mt-1">{tx.receivedApprovesOrderHint}</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onUpdatePaymentStatus('completed')}
              disabled={processingPaid}
              className="bg-green-700 text-white font-bold py-2.5 rounded-xl text-[11px] leading-tight disabled:opacity-50 active:bg-green-800 px-1"
            >
              {L('✓ Received & Approve', 'అందింది & ఆమోదం')}
            </button>
            <button
              onClick={() => onUpdatePaymentStatus('failed')}
              disabled={processingPaid}
              className="border-2 border-red-300 text-red-600 font-bold py-2.5 rounded-xl text-xs disabled:opacity-50 active:bg-red-50"
            >
              {L('✕ Not Received', 'రాలేదు')}
            </button>
            <button
              onClick={() => onUpdatePaymentStatus('pending')}
              disabled={processingPaid}
              className="border-2 border-amber-300 text-amber-700 font-bold py-2.5 rounded-xl text-xs disabled:opacity-50 active:bg-amber-50"
            >
              {L('⏳ Pending', 'పెండింగ్')}
            </button>
          </div>
        </div>
      )}

      <div className="px-3 pb-3 space-y-2">
        {!isApproved ? (
          <>
            {/* Pending: confirming the chosen pickup/delivery date approves the
                order. The confirm button stays disabled until a date is set. */}
            <div className={`grid gap-2 ${isUpi && isPaymentClaimed ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {!(isUpi && isPaymentClaimed) && (
                <button
                  onClick={() => onApprove(fulfillmentDate)}
                  disabled={processing || !fulfillmentDate}
                  className="bg-green-600 text-white font-bold py-3 rounded-xl text-sm active:bg-green-700 disabled:opacity-50"
                >
                  {processing ? tx.approving : (isPickup ? tx.confirmPickupDate : tx.confirmDeliveryDate)}
                </button>
              )}
              <button
                onClick={onDecline}
                disabled={processing}
                className="border-2 border-red-300 text-red-600 font-bold py-3 rounded-xl text-sm active:bg-red-50 disabled:opacity-50"
              >
                {processing ? tx.declining : `✕ ${tx.decline}`}
              </button>
            </div>
            {!fulfillmentDate && !(isUpi && isPaymentClaimed) && (
              <p className="text-[11px] text-gray-500 text-center">{tx.chooseDateToApprove}</p>
            )}
          </>
        ) : isDelivery && riderAssigned ? (
          // Approved home-delivery in the rider flow: the farmer can still
          // cancel; the rider closes it out at the door.
          <button
            onClick={onDecline}
            disabled={processing}
            className="w-full border-2 border-red-300 text-red-600 font-bold py-2.5 rounded-xl text-sm active:bg-red-50 disabled:opacity-50"
          >
            {processing ? tx.declining : `✕ ${tx.decline}`}
          </button>
        ) : isShipped ? (
          // Already shipped (courier / farmer-ships home delivery). Only the
          // BUYER confirms receipt now (Delivered / Received on their order
          // page), which stamps received_at and resolves the order — the farmer
          // just waits for that confirmation.
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <div className="text-center">
              <p className="text-xs font-bold text-amber-800">{L('🚚 Shipped', 'షిప్ చేయబడింది')}</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                {L('Awaiting buyer confirmation', 'కొనుగోలుదారు ధృవీకరణ కోసం వేచి ఉంది')}
              </p>
            </div>
          </div>
        ) : !enteringCode ? (
          // Approved farmer-fulfilled order, not yet handed over. Closing it
          // requires the buyer's 4-digit code: a SELF-PICKUP is marked Picked Up,
          // a farmer-DELIVERED order is marked Delivered. Tapping the button
          // reveals the code box below — the farmer can't close it on trust.
          <>
            <button
              onClick={() => { setHandoverCode(''); setCodeError(''); setEnteringCode(true) }}
              disabled={processing}
              className={`w-full text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50 ${
                isPickup ? 'bg-green-600 active:bg-green-700' : 'bg-amber-600 active:bg-amber-700'
              }`}
            >
              {isPickup ? L('✓ Picked Up', 'తీసుకువెళ్ళారు') : L('✓ Delivered', 'డెలివరీ అయింది')}
            </button>
            <button
              onClick={onDecline}
              disabled={processing}
              className="w-full border-2 border-red-300 text-red-600 font-bold py-2.5 rounded-xl text-sm active:bg-red-50 disabled:opacity-50"
            >
              {processing ? tx.declining : `✕ ${tx.decline}`}
            </button>
          </>
        ) : (
          // Code entry: the buyer reads out their 4-digit code, the farmer types
          // it. Only a correct code closes the order.
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold text-gray-800">
              {isPickup
                ? L('Ask the buyer for their 4-digit pickup code', 'కొనుగోలుదారు 4-అంకెల పికప్ కోడ్ అడగండి')
                : L('Ask the buyer for their 4-digit delivery code', 'కొనుగోలుదారు 4-అంకెల డెలివరీ కోడ్ అడగండి')}
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={handoverCode}
              onChange={(e) => { setHandoverCode(e.target.value.replace(/\D/g, '').slice(0, 4)); setCodeError('') }}
              placeholder="••••"
              maxLength={4}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-center text-2xl font-black tracking-[0.5em] bg-white focus:border-green-500 focus:outline-none"
            />
            {codeError && <p className="text-xs text-red-600">{codeError}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setEnteringCode(false); setCodeError('') }}
                disabled={processing}
                className="border border-gray-300 text-gray-600 font-bold py-2.5 rounded-xl text-sm active:bg-gray-50 disabled:opacity-50"
              >
                {tx.cancelBtn}
              </button>
              <button
                onClick={submitHandoverCode}
                disabled={processing || handoverCode.length !== 4}
                className="bg-green-600 text-white font-bold py-2.5 rounded-xl text-sm active:bg-green-700 disabled:opacity-50"
              >
                {processing ? '…' : (isPickup ? L('Confirm pickup', 'పికప్ నిర్ధారించు') : L('Confirm delivery', 'డెలివరీ నిర్ధారించు'))}
              </button>
            </div>
          </div>
        )}
        {isCod && !isPaid && (
          <button
            onClick={onMarkPaid}
            disabled={processingPaid}
            className="w-full bg-amber-500 text-white font-bold py-3 rounded-xl text-sm active:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            💵 {processingPaid ? tx.markingPaid : tx.markPaid}
          </button>
        )}
      </div>
    </div>
  )
}

/* ─── Home-delivery rider tag ──────────────────────────────── */
function DeliveryTagForFarmer({ order }: { order: FarmerOrder }) {
  const [rider, setRider] = useState<{ name: string | null; phone: string } | null>(null)
  const riderId = order.delivery_boy_id ?? null

  useEffect(() => {
    if (!riderId) { setRider(null); return }
    let cancelled = false
    supabase
      .from('delivery_boys')
      .select('name, phone')
      .eq('id', riderId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setRider({ name: data.name ?? null, phone: data.phone as string })
      })
    return () => { cancelled = true }
  }, [riderId])

  const statusText = (() => {
    switch (order.delivery_status) {
      case 'assigned': return 'Rider assigned'
      case 'picked_up': return 'Picked up'
      case 'out_for_delivery': return 'Out for delivery'
      case 'delivered': return 'Delivered'
      default: return 'Waiting for rider'
    }
  })()

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mt-1 space-y-1.5">
      <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wide">
        🛵 Home delivery · {statusText}
      </p>
      {rider ? (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900 truncate">{rider.name || 'Rider'}</p>
            <p className="text-[11px] text-gray-500">For pickup coordination</p>
          </div>
          <a
            href={`tel:${rider.phone}`}
            className="bg-blue-600 text-white font-bold text-xs px-3 py-2 rounded-xl whitespace-nowrap active:bg-blue-700"
          >
            📞 Call · {rider.phone}
          </a>
        </div>
      ) : (
        <p className="text-[11px] text-blue-700">
          A delivery boy will pick up the order. You&apos;ll see their contact here when assigned.
        </p>
      )}
    </div>
  )
}

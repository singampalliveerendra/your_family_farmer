'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'
import { isOrderPaid, isPaymentClaimed as isPaymentClaimed_ } from '@/lib/payment'
import { harvestClock } from '@/lib/harvest'

export type DeliveryStatus = 'unassigned' | 'assigned' | 'picked_up' | 'out_for_delivery' | 'delivered'

type HarvestRef = { harvested_at: string; shelf_life_days?: number | null }

// Shared farmer-side order shape. Superset of the columns the dashboard and the
// Orders page each fetch, so the same card renders on both.
export type FarmerOrder = {
  id: string
  farmer_id: string
  order_code?: string | null
  produce_listing_id: string | null
  // The specific harvest this order was placed against (harvest-as-product). Lets
  // the farmer see which pick the order is for, and gates the pickup/delivery
  // time to be at/after the harvest time. Embedded from the orders query.
  harvest_id?: string | null
  // PostgREST may hand back a to-one embed as an object or a single-element array.
  harvest?: HarvestRef | HarvestRef[] | null
  produce_name: string | null
  quantity: number | null
  unit: string | null
  total_price: number | null
  // Delivery + platform fees stamped on this row (cart's first row carries them,
  // 0 on the rest). Refunded IN FULL along with the produce price when the FARMER
  // declines, so the decline sheet can preview the buyer's total refund.
  delivery_fee?: number | null
  platform_fee?: number | null
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
  onMarkShipped,
  onConfirmPickup,
  onConfirmDelivery,
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
  // Courier / farmer-driven home delivery is marked Shipped (trust-based
  // dispatch), and the BUYER confirms receipt. A SELF-PICKUP is closed by the
  // farmer entering the buyer's 4-digit handover code (onConfirmPickup) — the
  // buyer reads it off their order page at collection. Returns an error message
  // to show inline, or null on success.
  onMarkShipped: () => void
  onConfirmPickup: (otp: string) => Promise<string | null>
  // Farmer-driven home delivery / courier: after marking Shipped, the farmer
  // types the buyer's code at the door to close the order (received_at).
  onConfirmDelivery: (otp: string) => Promise<string | null>
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
  // Stored as a full timestamp (timestamptz ISO). The schedule carries a time,
  // not just a date, so the picker is a datetime-local.
  const fulfillmentDate = order.fulfillment_date ?? ''
  // A stored UTC ISO string → the yyyy-MM-ddThh:mm LOCAL shape datetime-local
  // wants; and the reverse (local input → UTC ISO for storage).
  const toLocalInput = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  }
  const localToIso = (local: string) => {
    if (!local) return ''
    const d = new Date(local)
    return isNaN(d.getTime()) ? '' : d.toISOString()
  }
  // The harvest this order is against (embed may be an object or 1-el array).
  const harvestRef = Array.isArray(order.harvest) ? order.harvest[0] : order.harvest
  const harvestAt = harvestRef?.harvested_at ?? ''
  // A pickup/delivery can't be scheduled before the produce is harvested, so the
  // chosen date-time must be at/after the harvest time.
  const isAfterHarvest = (iso: string) =>
    !harvestAt || (!!iso && new Date(iso).getTime() >= new Date(harvestAt).getTime())

  // Local (not UTC) "now" so the picker still allows today in IST evenings.
  // Minimum selectable pickup/delivery date-time. For a pre-book (future) harvest
  // the minimum is the harvest time itself; otherwise "now". Computed once on mount.
  const [nowLocalMin] = useState(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  })
  const harvestLocalMin = harvestAt ? toLocalInput(harvestAt) : ''
  const minDateTime = harvestLocalMin && harvestLocalMin > nowLocalMin ? harvestLocalMin : nowLocalMin

  // Error shown when the farmer tries to schedule before the harvest.
  const [dateError, setDateError] = useState('')

  // Reschedule editor state for an APPROVED order: the date is read-only until
  // the farmer taps "Change date", which reveals a date picker + a required
  // reason that the buyer will see.
  const [editingDate, setEditingDate] = useState(false)
  const [newDate, setNewDate] = useState(fulfillmentDate)
  const [rescheduleReason, setRescheduleReason] = useState('')

  // Handover-code entry. The farmer types the buyer's 4-digit code at handover;
  // a match closes the order — collected_at for self-pickup (onConfirmPickup),
  // received_at for farmer-driven delivery (onConfirmDelivery). Only one code
  // form ever renders at a time, so the state is shared. Wrong code shows inline.
  const [pickupOtp, setPickupOtp] = useState('')
  const [pickupErr, setPickupErr] = useState<string | null>(null)
  const submitCode = async (handler: (otp: string) => Promise<string | null>) => {
    setPickupErr(null)
    const err = await handler(pickupOtp)
    if (err) setPickupErr(err)
    else setPickupOtp('')
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
  const isPaid = isOrderPaid(order.payment_status)
  const isPaymentClaimed = isPaymentClaimed_(order.payment_status)

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

          {/* Platform fee collected on this order (goes to the platform, not
              the farmer; ₹0 when none applied) + the total the buyer pays. */}
          <p className="text-[11px] text-gray-500">
            {L('Platform fee', 'ప్లాట్‌ఫామ్ ఫీజు')} ₹{order.platform_fee ?? 0}
            {' · '}
            {L('Buyer pays', 'కొనుగోలుదారు చెల్లించేది')} ₹{(order.total_price ?? 0) + (order.platform_fee ?? 0)}
          </p>

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

        {/* Which harvest this order is against — highlighted so the farmer
            knows exactly which pick to prepare. */}
        {harvestAt && (
          <div className="mt-1 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
            <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">🌾 {L('Against harvest', 'ఈ కోతకు')}</p>
            <p className="text-xs font-semibold text-green-900 mt-0.5">
              {harvestClock(harvestAt, L)}
              <span className="font-normal text-green-700"> · {new Date(harvestAt).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}</span>
            </p>
          </div>
        )}

        {/* Pickup / delivery date. */}
        <div className="pt-1">
          <label className="text-[11px] font-bold text-gray-600 block mb-1">
            📅 {isPickup ? tx.pickupDateLabel : tx.deliveryDateLabel}
          </label>

          {!isApproved ? (
            // Pending: the date is the gate to approval — the farmer picks it,
            // then confirms below. No reason needed for the first choice. It must
            // be at/after the harvest time (can't schedule before it's picked).
            <input
              type="datetime-local"
              value={toLocalInput(fulfillmentDate)}
              min={minDateTime}
              onChange={(e) => {
                const iso = localToIso(e.target.value)
                if (iso && !isAfterHarvest(iso)) {
                  setDateError(L('Pickup/delivery must be after the harvest time.', 'పికప్/డెలివరీ కోత సమయం తర్వాత ఉండాలి.'))
                  return
                }
                setDateError('')
                onSetFulfillmentDate(iso)
              }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-green-500 focus:outline-none"
            />
          ) : !editingDate ? (
            // Approved: the date is locked (read-only). Changing it is a
            // deliberate action that requires a reason the buyer will see.
            <>
              <p className="text-sm font-bold text-gray-900">
                {fulfillmentDate
                  ? new Date(fulfillmentDate).toLocaleString('en-IN', {
                      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })
                  : '—'}
              </p>
              {fulfillmentDate && !isShipped && (
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
                type="datetime-local"
                value={toLocalInput(newDate)}
                min={minDateTime}
                onChange={(e) => {
                  const iso = localToIso(e.target.value)
                  setNewDate(iso)
                  setDateError(iso && !isAfterHarvest(iso)
                    ? L('Pickup/delivery must be after the harvest time.', 'పికప్/డెలివరీ కోత సమయం తర్వాత ఉండాలి.')
                    : '')
                }}
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
                  disabled={processing || !newDate || !rescheduleReason.trim() || newDate === fulfillmentDate || !isAfterHarvest(newDate)}
                  onClick={() => {
                    if (!isAfterHarvest(newDate)) {
                      setDateError(L('Pickup/delivery must be after the harvest time.', 'పికప్/డెలివరీ కోత సమయం తర్వాత ఉండాలి.'))
                      return
                    }
                    onSetFulfillmentDate(newDate, rescheduleReason.trim()); setEditingDate(false)
                  }}
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

          {dateError && (
            <p className="text-[11px] font-semibold text-red-600 mt-1">{dateError}</p>
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
                  onClick={() => {
                    if (!isAfterHarvest(fulfillmentDate)) {
                      setDateError(L('Pickup/delivery must be after the harvest time.', 'పికప్/డెలివరీ కోత సమయం తర్వాత ఉండాలి.'))
                      return
                    }
                    onApprove(fulfillmentDate)
                  }}
                  disabled={processing || !fulfillmentDate || !isAfterHarvest(fulfillmentDate)}
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
          isDelivery ? (
            // Shipped HOME DELIVERY: the farmer does NOT confirm delivery. A
            // delivery person hands it over, and the CUSTOMER closes the order
            // with "Mark Delivered" from their own order page. (No delivery
            // module yet, so we just show a passive status here — see the
            // "remove farmer code-confirm for home delivery" card.)
            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-center space-y-1">
              <p className="text-[11px] font-bold text-amber-800">🚚 {L('Shipped — on the way', 'షిప్ అయింది — దారిలో')}</p>
              <p className="text-xs text-green-800 leading-snug">
                {L('The customer will confirm delivery from their order page.', 'కస్టమర్ వారి ఆర్డర్ పేజీ నుండి డెలివరీని ధృవీకరిస్తారు.')}
              </p>
            </div>
          ) : (
            // Shipped COURIER: the farmer types the buyer's 4-digit code at
            // handover to close the order (received_at) — verified handover, same
            // as self-pickup. Home delivery is handled above (no farmer code).
            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 space-y-2">
              <p className="text-[11px] font-bold text-amber-800 text-center">🚚 {L('Shipped — on the way', 'షిప్ అయింది — దారిలో')}</p>
              <p className="text-xs font-bold text-green-800 text-center">
                {L('Enter the customer’s code at delivery', 'డెలివరీ సమయంలో కస్టమర్ కోడ్ నమోదు చేయండి')}
              </p>
              <div className="flex gap-2">
                <input
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={4}
                  value={pickupOtp}
                  onChange={(e) => { setPickupOtp(e.target.value.replace(/\D/g, '').slice(0, 4)); setPickupErr(null) }}
                  placeholder="0000"
                  className="flex-1 min-w-0 text-center text-lg font-bold tracking-[0.4em] border border-green-300 rounded-lg py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  onClick={() => submitCode(onConfirmDelivery)}
                  disabled={processing || pickupOtp.length !== 4}
                  className="px-4 bg-green-700 text-white font-bold rounded-lg text-sm active:bg-green-800 disabled:opacity-50"
                >
                  {processing ? '…' : L('Confirm', 'ధృవీకరించు')}
                </button>
              </div>
              {pickupErr && <p className="text-[11px] text-red-600 text-center font-semibold">{pickupErr}</p>}
              <p className="text-[10px] text-green-700 text-center leading-snug">
                {L('Ask the customer to read the 4-digit code from their order page.', 'కస్టమర్‌ను వారి ఆర్డర్ పేజీలోని 4-అంకెల కోడ్ చదవమని అడగండి.')}
              </p>
            </div>
          )
        ) : isPickup ? (
          // Approved SELF-PICKUP: the farmer closes the order by entering the
          // buyer's 4-digit handover code (shown only on the buyer's own order
          // page). A match stamps collected_at and resolves the order. There is
          // no "mark picked up" tap — the code proves the customer was actually
          // present to collect, so the farmer can't close it alone.
          <>
            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 space-y-2">
              <p className="text-xs font-bold text-green-800 text-center">
                {L('Enter the customer’s pickup code', 'కస్టమర్ పికప్ కోడ్ నమోదు చేయండి')}
              </p>
              <div className="flex gap-2">
                <input
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={4}
                  value={pickupOtp}
                  onChange={(e) => { setPickupOtp(e.target.value.replace(/\D/g, '').slice(0, 4)); setPickupErr(null) }}
                  placeholder="0000"
                  className="flex-1 min-w-0 text-center text-lg font-bold tracking-[0.4em] border border-green-300 rounded-lg py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  onClick={() => submitCode(onConfirmPickup)}
                  disabled={processing || pickupOtp.length !== 4}
                  className="px-4 bg-green-700 text-white font-bold rounded-lg text-sm active:bg-green-800 disabled:opacity-50"
                >
                  {processing ? '…' : L('Confirm', 'ధృవీకరించు')}
                </button>
              </div>
              {pickupErr && <p className="text-[11px] text-red-600 text-center font-semibold">{pickupErr}</p>}
              <p className="text-[10px] text-green-700 text-center leading-snug">
                {L('Ask the customer to read the 4-digit code from their order page.', 'కస్టమర్‌ను వారి ఆర్డర్ పేజీలోని 4-అంకెల కోడ్ చదవమని అడగండి.')}
              </p>
            </div>
            <button
              onClick={onDecline}
              disabled={processing}
              className="w-full border-2 border-red-300 text-red-600 font-bold py-2.5 rounded-xl text-sm active:bg-red-50 disabled:opacity-50"
            >
              {processing ? tx.declining : `✕ ${tx.decline}`}
            </button>
          </>
        ) : (
          // Approved courier / farmer-driven home delivery (rider deliveries were
          // handled above). The farmer marks it Shipped (trust-based dispatch);
          // the BUYER then confirms receipt from their order page, which closes it.
          <>
            <button
              onClick={onMarkShipped}
              disabled={processing}
              className="w-full bg-amber-600 text-white font-bold py-2.5 rounded-xl text-sm active:bg-amber-700 disabled:opacity-50"
            >
              {processing ? '…' : L('🚚 Mark Shipped', '🚚 షిప్ చేయబడింది')}
            </button>
            <button
              onClick={onDecline}
              disabled={processing}
              className="w-full border-2 border-red-300 text-red-600 font-bold py-2.5 rounded-xl text-sm active:bg-red-50 disabled:opacity-50"
            >
              {processing ? tx.declining : `✕ ${tx.decline}`}
            </button>
          </>
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

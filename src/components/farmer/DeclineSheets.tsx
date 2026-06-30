'use client'

import { useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { isOrderPaid, isPaymentClaimed } from '@/lib/payment'
import type { FarmerOrder } from './OrderCard'

/* ─── Decline success / refund confirmation sheet ──────────── */
export function DeclineSuccessSheet({
  result,
  onClose,
}: {
  result: { buyerName: string | null; amount: number | null; refundInitiated: boolean }
  onClose: () => void
}) {
  const { L } = useLang()
  const buyer = result.buyerName || 'the customer'
  return (
    <div className="fixed inset-0 z-[130] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 text-center space-y-3">
        <div className="relative w-16 h-16 mx-auto">
          <span className="order-success-ring bg-green-300" aria-hidden />
          <div className="order-success-icon relative w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl">
            ✅
          </div>
        </div>
        <h2 className="order-success-rise font-extrabold text-gray-900 text-lg leading-tight">
          {L('Order declined', 'ఆర్డర్ తిరస్కరించబడింది')}
        </h2>

        {result.refundInitiated ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-left space-y-1.5">
            <p className="font-bold text-green-800 text-sm flex items-center gap-1.5">
              <span>💸</span> {L('Refund initiated', 'రీఫండ్ ప్రారంభమైంది')}
            </p>
            <p className="text-sm text-gray-700 leading-snug">
              {result.amount != null && result.amount > 0 ? (
                <>A refund of <span className="font-extrabold text-green-800">₹{result.amount}</span> has been started to {buyer}.</>
              ) : (
                <>A refund has been started to {buyer}.</>
              )}
            </p>
            <p className="text-xs text-gray-500 leading-snug">
              {L('It will reach their account in 3–5 business days. The customer has been told this automatically.', 'కొనుగోలుదారు ఖాతాకు 3–5 పని దినాలలో జమ అవుతుంది. కస్టమర్‌కు ఇది తెలియజేయబడింది.')}
            </p>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-left">
            <p className="text-sm text-gray-700 leading-snug">
              {L(`${buyer} hadn't paid yet, so no refund is needed.`, `${buyer} ఇంకా చెల్లించలేదు, కాబట్టి రీఫండ్ అవసరం లేదు.`)}
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full bg-green-700 text-white font-bold py-3 rounded-xl text-sm active:bg-green-800"
        >
          {L('Done', 'సరే')}
        </button>
      </div>
    </div>
  )
}

/* ─── Decline reason bottom sheet ──────────────────────────── */
const DECLINE_PRESETS = [
  'Stock finished',
  'Not available this week',
  'Price changed',
  'Incorrect order details',
]

export function DeclineReasonSheet({
  order,
  processing,
  onCancel,
  onConfirm,
}: {
  order: FarmerOrder
  processing: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const { L } = useLang()
  const [selected, setSelected] = useState<string | null>(null)
  const [custom, setCustom] = useState('')

  const finalReason = selected ?? custom.trim()
  const canSubmit = finalReason.length >= 3 && !processing

  // Refund preview, shown BEFORE the farmer confirms. A farmer decline makes the
  // buyer whole — it refunds the FULL amount they paid: produce price plus the
  // delivery and platform fees stamped on this row. Mirrors the decline API.
  // Only relevant once the buyer's money is in or claimed.
  const buyerPaid = isOrderPaid(order.payment_status) || isPaymentClaimed(order.payment_status)
  const buyerRefund =
    (Number(order.total_price) || 0) +
    (Number(order.delivery_fee) || 0) +
    (Number(order.platform_fee) || 0)

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-end justify-center">
      <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-gray-900 text-lg leading-tight">
              {L('Why decline this order?', 'ఎందుకు తిరస్కరిస్తున్నారు?')}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">
              {L('The reason will be shown to the buyer', 'కారణం కొనుగోలుదారుకు చూపబడుతుంది')}
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={processing}
            className="text-gray-400 text-3xl leading-none p-1 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-700">
          <span className="font-semibold">{order.buyer_name || 'Buyer'}</span>
          {order.produce_name && <> · {order.produce_name}</>}
          {order.quantity != null && <> · {order.quantity} {order.unit || 'kg'}</>}
        </div>

        {/* Refund preview — what the buyer gets back if the farmer declines. */}
        {buyerPaid && buyerRefund > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-700 font-semibold">
                {L('Buyer will be refunded', 'కొనుగోలుదారుకు తిరిగి ఇవ్వబడేది')}
              </span>
              <span className="font-extrabold text-amber-800">₹{Math.round(buyerRefund)}</span>
            </div>
            <p className="text-[11px] text-gray-500 leading-snug">
              {L('The full amount they paid (including any delivery & platform fees) is refunded in 3–5 business days.', 'వారు చెల్లించిన పూర్తి మొత్తం (డెలివరీ, ప్లాట్‌ఫామ్ ఫీజులతో సహా) 3–5 పని దినాలలో తిరిగి ఇవ్వబడుతుంది.')}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">
            {L('Pick a reason', 'కారణం ఎంచుకోండి')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DECLINE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => { setSelected(preset); setCustom('') }}
                className={`px-3 py-2.5 rounded-xl text-xs font-bold border-2 transition-colors text-left leading-snug ${
                  selected === preset
                    ? 'border-red-500 bg-red-50 text-red-800'
                    : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1.5">
            {L('Or type your reason', 'లేదా టైప్ చేయండి')}
          </label>
          <textarea
            value={custom}
            onChange={(e) => { setCustom(e.target.value); if (e.target.value.trim()) setSelected(null) }}
            placeholder="e.g. Heavy rain damaged the harvest"
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none resize-none"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={processing}
            className="flex-1 border-2 border-gray-300 text-gray-700 font-bold py-3 rounded-xl text-sm disabled:opacity-50"
          >
            {L('Cancel', 'రద్దు')}
          </button>
          <button
            onClick={() => onConfirm(finalReason)}
            disabled={!canSubmit}
            className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50 active:bg-red-700"
          >
            {processing ? 'Declining...' : 'Confirm decline'}
          </button>
        </div>
      </div>
    </div>
  )
}

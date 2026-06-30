'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'
import { isOrderPaid, isPaymentClaimed } from '@/lib/payment'
import type { ConsumerOrder } from '@/components/consumer/OrderCard'

// Animated "Order cancelled" confirmation, shown after a buyer cancels — mirrors
// the order-placed and farmer-decline success screens. `wasPaid` adds a refund
// note since a paid order is refunded automatically on cancel.
export function CancelSuccessSheet({
  wasPaid,
  refundAmount,
  platformFeeWithheld,
  onClose,
}: {
  wasPaid: boolean
  refundAmount?: number
  platformFeeWithheld?: number
  onClose: () => void
}) {
  const { L } = useLang()
  const showFeeBreakdown = wasPaid && (platformFeeWithheld ?? 0) > 0
  return (
    <div className="fixed inset-0 z-[130] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 text-center space-y-3">
        <div className="relative w-16 h-16 mx-auto">
          <span className="order-success-ring bg-gray-300" aria-hidden />
          <div className="order-success-icon relative w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-3xl font-black text-gray-600">
            ✓
          </div>
        </div>
        <div className="order-success-rise space-y-2">
          <h2 className="font-extrabold text-gray-900 text-lg leading-tight">
            {L('Order cancelled', 'ఆర్డర్ రద్దు చేయబడింది')}
          </h2>
          {wasPaid ? (
            <>
              <p className="text-sm text-gray-600 leading-snug">
                {L('A refund has been started — it will reach your account in 3–5 business days.', 'రీఫండ్ ప్రారంభమైంది — 3–5 పని దినాలలో మీ ఖాతాకు జమ అవుతుంది.')}
              </p>
              {showFeeBreakdown && (
                <div className="bg-gray-50 rounded-2xl px-4 py-3 text-left space-y-1">
                  {refundAmount != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{L('Refund amount', 'రీఫండ్ మొత్తం')}</span>
                      <span className="font-extrabold text-green-800">₹{refundAmount}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{L('Platform fee (not refunded)', 'ప్లాట్‌ఫామ్ ఫీజు (తిరిగి ఇవ్వబడదు)')}</span>
                    <span className="font-semibold text-gray-500">− ₹{platformFeeWithheld}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-snug pt-1">
                    {L('Since the order was cancelled by you, the platform fee covers the payment & service cost and is not refunded.', 'ఆర్డర్‌ను మీరు రద్దు చేసినందున, ప్లాట్‌ఫామ్ ఫీజు చెల్లింపు, సేవా ఖర్చును కవర్ చేస్తుంది, తిరిగి ఇవ్వబడదు.')}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-600 leading-snug">
              {L('Your order has been cancelled. The farmer has been notified.', 'మీ ఆర్డర్ రద్దు చేయబడింది. రైతుకు తెలియజేయబడింది.')}
            </p>
          )}
        </div>
        <Link
          href="/consumer/orders/history"
          className="block w-full text-center text-sm font-semibold text-green-700 underline"
        >
          {L('View order history', 'ఆర్డర్ చరిత్ర చూడండి')}
        </Link>
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

// Lets the buyer pick / type a reason before cancelling. The reason is stored on
// the order and shown to the farmer, so they understand why it fell through.
export default function CancelOrderModal({
  order,
  cancelling,
  onClose,
  onConfirm,
}: {
  order: ConsumerOrder
  cancelling: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const { L } = useLang()

  // Refund preview, shown BEFORE the buyer confirms. A buyer cancel refunds the
  // produce price only (= total_price) and WITHHOLDS the platform fee — it
  // covers the payment/service cost already incurred. Mirrors the cancel API and
  // the post-cancel success sheet. Only relevant once money is in or claimed.
  const wasPaid = isOrderPaid(order.payment_status) || isPaymentClaimed(order.payment_status)
  const refundAmount = Math.max(0, Number(order.total_price) || 0)
  const platformFeeWithheld = Math.max(0, Number(order.platform_fee) || 0)

  const presets = [
    L('Ordered by mistake', 'పొరపాటున ఆర్డర్ చేశాను'),
    L('Found it cheaper elsewhere', 'వేరే చోట చౌకగా దొరికింది'),
    L('No longer needed', 'ఇప్పుడు అవసరం లేదు'),
    L('Delivery / pickup takes too long', 'డెలివరీ / పికప్ చాలా ఆలస్యం'),
  ]
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div>
          <p className="text-base font-extrabold text-gray-900">{L('Cancel order', 'ఆర్డర్ రద్దు')}</p>
          <p className="text-xs text-gray-500 mt-1 leading-snug">
            {L('Please tell the farmer why. If you have already paid, you will be refunded automatically.', 'రైతుకు కారణం చెప్పండి. మీరు ఇప్పటికే చెల్లించి ఉంటే, డబ్బు ఆటోమేటిక్‌గా తిరిగి వస్తుంది.')}
          </p>
        </div>

        {/* "Are you sure?" warning — cancelling can't be undone. */}
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-3 py-2.5">
          <p className="text-xs font-bold text-amber-800 leading-snug">
            ⚠️ {L('Are you sure you want to cancel this order? This cannot be undone.', 'మీరు ఖచ్చితంగా ఈ ఆర్డర్‌ను రద్దు చేయాలనుకుంటున్నారా? దీన్ని తిరిగి మార్చలేరు.')}
          </p>
        </div>

        {/* Refund preview — what the buyer will get back if they go ahead. */}
        {wasPaid && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-700 font-semibold">{L('You will be refunded', 'మీకు తిరిగి వచ్చేది')}</span>
              <span className="font-extrabold text-green-800">₹{refundAmount}</span>
            </div>
            {platformFeeWithheld > 0 && (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">{L('Platform fee (not refunded)', 'ప్లాట్‌ఫామ్ ఫీజు (తిరిగి ఇవ్వబడదు)')}</span>
                  <span className="font-semibold text-gray-500">− ₹{platformFeeWithheld}</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-snug pt-0.5">
                  {L('Since you are cancelling, the platform fee covers the payment & service cost and is not refunded.', 'మీరు రద్దు చేస్తున్నందున, ప్లాట్‌ఫామ్ ఫీజు చెల్లింపు, సేవా ఖర్చును కవర్ చేస్తుంది, తిరిగి ఇవ్వబడదు.')}
                </p>
              </>
            )}
            <p className="text-[11px] text-gray-400 leading-snug pt-0.5">
              {L('The refund reaches your account in 3–5 business days.', 'రీఫండ్ 3–5 పని దినాలలో మీ ఖాతాకు జమ అవుతుంది.')}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setReason(p)}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border ${
                reason === p
                  ? 'bg-green-700 text-white border-green-700'
                  : 'bg-gray-50 text-gray-700 border-gray-200 active:bg-gray-100'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder={L('Reason (optional)', 'కారణం (ఐచ్ఛికం)')}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-green-500 focus:outline-none resize-none"
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onClose}
            disabled={cancelling}
            className="border border-gray-300 text-gray-700 font-bold py-3 rounded-xl text-sm active:bg-gray-50 disabled:opacity-50"
          >
            {L('Keep order', 'ఆర్డర్ ఉంచు')}
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={cancelling}
            className="bg-red-600 text-white font-bold py-3 rounded-xl text-sm active:bg-red-700 disabled:opacity-50"
          >
            {cancelling ? L('Cancelling...', 'రద్దు...') : L('Cancel order', 'రద్దు చేయి')}
          </button>
        </div>
      </div>
    </div>
  )
}

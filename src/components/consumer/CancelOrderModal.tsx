'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'

// Animated "Order cancelled" confirmation, shown after a buyer cancels — mirrors
// the order-placed and farmer-decline success screens. `wasPaid` adds a refund
// note since a paid order is refunded automatically on cancel.
export function CancelSuccessSheet({
  wasPaid,
  onClose,
}: {
  wasPaid: boolean
  onClose: () => void
}) {
  const { L } = useLang()
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
            <p className="text-sm text-gray-600 leading-snug">
              {L('A refund has been started — it will reach your account in 3–5 business days.', 'రీఫండ్ ప్రారంభమైంది — 3–5 పని దినాలలో మీ ఖాతాకు జమ అవుతుంది.')}
            </p>
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
  cancelling,
  onClose,
  onConfirm,
}: {
  cancelling: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const { L } = useLang()
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

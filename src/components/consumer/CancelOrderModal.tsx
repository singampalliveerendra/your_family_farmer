'use client'

import { useState } from 'react'
import { useLang } from '@/lib/LanguageContext'

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

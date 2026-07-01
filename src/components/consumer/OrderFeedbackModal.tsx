'use client'

import { useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { localizeName } from '@/lib/localizeName'
import type { MyReview } from '@/components/consumer/ProduceReviewBox'

// Shared feedback sheet, opened from an order card. A buyer can rate the produce
// for any of their orders. For a completed order it's a public verified-buyer
// rating; for a declined / cancelled / pending order it's private feedback about
// the order experience (kept off the public produce card).
export default function OrderFeedbackModal({
  orderId,
  produceName,
  completed,
  existing,
  onClose,
  onSaved,
}: {
  orderId: string
  produceName: string | null
  completed: boolean
  existing: MyReview | null
  onClose: () => void
  onSaved: () => void
}) {
  const { L, lang } = useLang()
  const name = localizeName(produceName, lang) || L('this harvest', 'ఈ కోత')
  const [rating, setRating] = useState(existing?.star_rating ?? 0)
  const [hover, setHover] = useState(0)
  const [text, setText] = useState(existing?.review_text ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const readOnly = Boolean(existing)

  const submit = async () => {
    if (rating === 0) { setError(L('Please tap a star to rate.', 'రేటింగ్ కోసం స్టార్ నొక్కండి.')); return }
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/produce-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ order_id: orderId, star_rating: rating, review_text: text.trim() || null }),
    }).catch(() => null)
    const json = await res?.json().catch(() => ({})) as { review?: MyReview; error?: string }
    setSubmitting(false)
    if (!res || !res.ok || !json.review) {
      setError(json?.error === 'already_reviewed'
        ? L('You already gave feedback on this order.', 'మీరు ఇప్పటికే ఈ ఆర్డర్‌పై అభిప్రాయం ఇచ్చారు.')
        : (json?.error ?? L('Could not submit. Try again.', 'సమర్పించలేకపోయాం. మళ్ళీ ప్రయత్నించండి.')))
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <p className="font-extrabold text-gray-900">
            {readOnly
              ? L('Your feedback', 'మీ అభిప్రాయం')
              : completed
                ? `${L('Rate', 'రేటింగ్')} ${name}`
                : L('Give feedback', 'అభిప్రాయం ఇవ్వండి')}
          </p>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none p-1">×</button>
        </div>

        <p className="text-[11px] text-gray-500 mb-3">
          {readOnly
            ? L('Thanks for helping other buyers!', 'ఇతర కొనుగోలుదారులకు సహాయం చేసినందుకు ధన్యవాదాలు!')
            : completed
              ? L('How was it? Your review helps other buyers.', 'ఎలా ఉంది? మీ సమీక్ష ఇతర కొనుగోలుదారులకు సహాయపడుతుంది.')
              : L('Tell us about this order. This stays private and helps us improve.', 'ఈ ఆర్డర్ గురించి చెప్పండి. ఇది గోప్యంగా ఉంటుంది & మేము మెరుగుపడటానికి సహాయపడుతుంది.')}
        </p>

        <div className="flex gap-1 mb-3">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              disabled={readOnly}
              onClick={() => setRating(s)}
              onMouseEnter={() => !readOnly && setHover(s)}
              onMouseLeave={() => !readOnly && setHover(0)}
              className="text-4xl leading-none transition-transform active:scale-110 disabled:active:scale-100"
              aria-label={`${s} stars`}
            >
              <span className={(hover || rating) >= s ? 'text-yellow-400' : 'text-gray-200'}>★</span>
            </button>
          ))}
        </div>

        {readOnly ? (
          existing?.review_text && (
            <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-4 py-3 leading-relaxed">{existing.review_text}</p>
          )
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 600))}
            placeholder={L('Share a few words (optional)', 'కొన్ని మాటలు రాయండి (ఐచ్ఛికం)')}
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:border-green-500 focus:outline-none"
          />
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 mt-2">{error}</p>}

        {!readOnly && (
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="mt-3 w-full bg-green-700 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50 active:bg-green-800"
          >
            {submitting ? L('Submitting…', 'సమర్పిస్తోంది…') : L('Submit feedback', 'అభిప్రాయం సమర్పించు')}
          </button>
        )}
      </div>
    </div>
  )
}

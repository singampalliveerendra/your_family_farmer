'use client'

import { useState } from 'react'
import { useLang } from '@/lib/LanguageContext'

export type MyReview = {
  id: string
  star_rating: number
  review_text: string | null
  created_at: string
}

// Shown on the order detail page once an order is completed. Lets the buyer
// rate the produce they ordered (one review per order), or shows the review
// they already left.
export default function ProduceReviewBox({
  orderId,
  produceName,
  existing,
}: {
  orderId: string
  produceName: string
  existing: MyReview | null
}) {
  const { L } = useLang()
  const [review, setReview] = useState<MyReview | null>(existing)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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
        ? L('You already reviewed this order.', 'మీరు ఇప్పటికే ఈ ఆర్డర్‌ను సమీక్షించారు.')
        : (json?.error ?? L('Could not submit. Try again.', 'సమర్పించలేకపోయాం. మళ్ళీ ప్రయత్నించండి.')))
      return
    }
    setReview(json.review)
  }

  if (review) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
        <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-1">
          ⭐ {L('Your rating', 'మీ రేటింగ్')}
        </p>
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <span key={s} className={`text-xl ${s <= review.star_rating ? 'text-yellow-400' : 'text-gray-300'}`}>★</span>
          ))}
        </div>
        {review.review_text && (
          <p className="text-sm text-gray-700 mt-2 leading-relaxed">{review.review_text}</p>
        )}
        <p className="text-[11px] text-green-700 mt-2">
          {L('Thanks for helping other buyers!', 'ఇతర కొనుగోలుదారులకు సహాయం చేసినందుకు ధన్యవాదాలు!')}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <p className="text-sm font-extrabold text-gray-900">
        {L('Rate', 'రేటింగ్ ఇవ్వండి')} {produceName}
      </p>
      <p className="text-[11px] text-gray-500 mt-0.5 mb-3">
        {L('How was it? Your review helps other buyers.', 'ఎలా ఉంది? మీ సమీక్ష ఇతర కొనుగోలుదారులకు సహాయపడుతుంది.')}
      </p>

      <div className="flex gap-1 mb-3">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setRating(s)}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(0)}
            className="text-4xl leading-none transition-transform active:scale-110"
            aria-label={`${s} stars`}
          >
            <span className={(hover || rating) >= s ? 'text-yellow-400' : 'text-gray-200'}>★</span>
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 600))}
        placeholder={L('Share a few words (optional)', 'కొన్ని మాటలు రాయండి (ఐచ్ఛికం)')}
        rows={3}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:border-green-500 focus:outline-none"
      />

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 mt-2">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="mt-3 w-full bg-green-700 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50 active:bg-green-800"
      >
        {submitting ? L('Submitting…', 'సమర్పిస్తోంది…') : L('Submit rating', 'రేటింగ్ సమర్పించు')}
      </button>
    </div>
  )
}

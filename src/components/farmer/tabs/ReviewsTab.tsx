'use client'

import { useState, useEffect } from 'react'
import { useLang } from '@/lib/LanguageContext'

type Review = {
  id: string
  reviewer_name: string
  reviewer_location?: string
  star_rating: number
  review_text?: string
  produce_ordered?: string
  created_at: string
}

export default function ReviewsTab({
  reviews: initialReviews,
  farmerId,
}: {
  reviews: Record<string, unknown>[]
  farmerId: string
}) {
  const { tx, L } = useLang()
  const [reviews, setReviews] = useState<Review[]>(initialReviews as Review[])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [produceBought, setProduceBought] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // Restore already-reviewed state from localStorage on mount
  useEffect(() => {
    if (localStorage.getItem(`yff_reviewed_${farmerId}`)) setDone(true)
  }, [farmerId])

  const avg =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.star_rating, 0) / reviews.length
      : 0

  const counts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.star_rating === star).length,
  }))

  const resetForm = () => {
    setName('')
    setPhone('')
    setRating(0)
    setHoverRating(0)
    setReviewText('')
    setProduceBought('')
    setError('')
  }

  const handleSubmit = async () => {
    if (!name.trim() || phone.replace(/\D/g, '').length < 10 || rating === 0) {
      setError(tx.reviewRequiredFields)
      return
    }
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmer_id: farmerId,
        reviewer_name: name.trim(),
        reviewer_phone: phone.replace(/\D/g, '').slice(-10),
        star_rating: rating,
        review_text: reviewText.trim() || null,
        produce_ordered: produceBought.trim() || null,
      }),
    })

    const json = await res.json().catch(() => ({}))
    setSubmitting(false)

    if (res.status === 409 || json.error === 'already_reviewed') {
      localStorage.setItem(`yff_reviewed_${farmerId}`, '1')
      setDone(true)
      setShowForm(false)
      resetForm()
      return
    }

    if (!res.ok) {
      setError(json.error ?? tx.reviewError)
      return
    }

    if (json.review) setReviews((prev) => [json.review as Review, ...prev])
    localStorage.setItem(`yff_reviewed_${farmerId}`, '1')
    setDone(true)
    setShowForm(false)
    resetForm()
  }

  return (
    <div className="space-y-4">
      {/* CTA / success */}
      {done ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <div className="text-3xl mb-1">⭐</div>
          <p className="font-bold text-green-800 text-sm">{tx.reviewSubmitted}</p>
        </div>
      ) : !showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm active:bg-green-800"
        >
          ✏️ {tx.writeReview}
        </button>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="font-extrabold text-gray-900 text-sm">{tx.writeReview}</h3>
            <button
              onClick={() => { setShowForm(false); resetForm() }}
              className="text-gray-400 text-2xl leading-none p-1"
            >
              ×
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Star picker */}
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-2">
                {tx.starRatingLabel}
              </label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => setRating(s)}
                    onMouseEnter={() => setHoverRating(s)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="text-4xl leading-none transition-transform active:scale-110"
                    aria-label={`${s} stars`}
                  >
                    <span className={(hoverRating || rating) >= s ? 'text-yellow-400' : 'text-gray-200'}>
                      ★
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">
                {tx.reviewerNameLabel}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={L('Ramya', 'రమ్య')}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">
                {tx.reviewerPhoneLabel}
              </label>
              <div className="flex gap-2">
                <span className="flex items-center px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210"
                  maxLength={10}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">{L('Used only to verify your review.', 'సమీక్షను ధృవీకరించడానికి మాత్రమే.')}</p>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">
                {tx.produceOrderedLabel}
              </label>
              <input
                type="text"
                value={produceBought}
                onChange={(e) => setProduceBought(e.target.value)}
                placeholder={L('e.g. Tomato, Brinjal', 'ఉదా. టమాటా, వంకాయ')}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">
                {tx.reviewTextLabel}
              </label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value.slice(0, 400))}
                placeholder={L('Share your experience with this farmer...', 'ఈ రైతుతో మీ అనుభవం పంచుకోండి...')}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:border-green-500 focus:outline-none"
              />
              <p className="text-right text-xs text-gray-400">{reviewText.length}/400</p>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowForm(false); resetForm() }}
                className="flex-1 border-2 border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm"
              >
                {tx.cancelBtn}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 bg-green-700 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50 active:bg-green-800"
              >
                {submitting ? tx.submittingReview : tx.submitReview}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rating summary */}
      {reviews.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-gray-900">{avg.toFixed(1)}</p>
              <div className="flex justify-center mt-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} className={`text-base ${s <= Math.round(avg) ? 'text-yellow-400' : 'text-gray-200'}`}>
                    ★
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">{reviews.length} {tx.reviews}</p>
            </div>
            <div className="flex-1 space-y-1">
              {counts.map(({ star, count }) => (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-3">{star}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-yellow-400 h-2 rounded-full"
                      style={{ width: reviews.length ? `${(count / reviews.length) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-4">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {reviews.length === 0 && !showForm && !done && (
        <div className="text-center py-8 text-gray-400 text-sm">{tx.noReviews}</div>
      )}

      {/* Individual reviews */}
      {reviews.length > 0 && (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-800 font-bold text-sm flex-shrink-0">
                    {review.reviewer_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{review.reviewer_name}</p>
                    {review.reviewer_location && (
                      <p className="text-xs text-gray-500">{review.reviewer_location}</p>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex justify-end">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <span key={s} className={`text-sm ${s <= review.star_rating ? 'text-yellow-400' : 'text-gray-200'}`}>
                        ★
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(review.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>
              {review.review_text && (
                <p className="text-sm text-gray-600 mt-3 leading-relaxed">{review.review_text}</p>
              )}
              {review.produce_ordered && (
                <p className="text-xs text-green-700 font-semibold mt-2">
                  {tx.bought} {review.produce_ordered}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

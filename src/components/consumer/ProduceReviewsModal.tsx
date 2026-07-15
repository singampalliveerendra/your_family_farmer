'use client'

import { useEffect, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'

type Review = {
  id: string
  reviewer_name: string
  star_rating: number
  review_text: string | null
  created_at: string
}

// Bottom-sheet listing all buyer reviews for a produce. Opened from a produce
// card's rating chip. Reviews come from GET /api/produce-reviews.
export default function ProduceReviewsModal({
  listingId,
  produceName,
  onClose,
}: {
  listingId: string
  produceName: string
  onClose: () => void
}) {
  const { L } = useLang()
  const [reviews, setReviews] = useState<Review[]>([])
  const [avg, setAvg] = useState<number | null>(null)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Lock the page behind the sheet while it's open. Without this the background
  // keeps scrolling and the mobile browser's dynamic toolbar shifts, so the
  // fixed overlay no longer reaches the visible bottom — leaving a gap where the
  // page peeks below the sheet.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    let alive = true
    fetch(`/api/produce-reviews?listing_id=${listingId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        setReviews((j.reviews ?? []) as Review[])
        setAvg(j.rating_avg ?? null)
        setCount(j.review_count ?? 0)
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [listingId])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85dvh] overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <h3 className="font-extrabold text-gray-900 text-base truncate">{produceName}</h3>
            <p className="text-xs text-gray-500">{L('Buyer reviews', 'కొనుగోలుదారుల సమీక్షలు')}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-3xl leading-none p-1">×</button>
        </div>

        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3">
          {avg != null && count > 0 && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
              <p className="text-3xl font-extrabold text-gray-900">{avg.toFixed(1)}</p>
              <div>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span key={s} className={`text-base ${s <= Math.round(avg) ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {count} {count === 1 ? L('review', 'సమీక్ష') : L('reviews', 'సమీక్షలు')}
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-center text-sm text-gray-400 py-8">{L('Loading…', 'లోడ్ అవుతోంది…')}</p>
          ) : reviews.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">{L('No reviews yet.', 'ఇంకా సమీక్షలు లేవు.')}</p>
          ) : (
            reviews.map((r) => (
              <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-800 font-bold text-xs flex-shrink-0">
                      {r.reviewer_name.slice(0, 2).toUpperCase()}
                    </div>
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.reviewer_name}</p>
                  </div>
                  <div className="flex flex-shrink-0">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <span key={s} className={`text-sm ${s <= r.star_rating ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
                    ))}
                  </div>
                </div>
                {r.review_text && <p className="text-sm text-gray-600 mt-2 leading-relaxed">{r.review_text}</p>}
                <p className="text-[10px] text-gray-400 mt-1.5">
                  {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

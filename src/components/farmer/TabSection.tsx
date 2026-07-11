'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLang } from '@/lib/LanguageContext'
import StoryTab from './tabs/StoryTab'
import ProduceTab from './tabs/ProduceTab'
import QualityTab from './tabs/QualityTab'
import ReviewsTab from './tabs/ReviewsTab'
import FarmMediaTab from './tabs/FarmMediaTab'
import { CartFab } from '@/components/consumer/Cart'

export type ProduceReviewSummary = Record<
  string,
  { avg: number; count: number; latest: { name: string; text: string | null; stars: number } | null }
>

type Props = {
  farmer: Record<string, unknown>
  produce: Record<string, unknown>[]
  reviews: Record<string, unknown>[]
  produceReviews?: ProduceReviewSummary
  media: Record<string, unknown>[]
}

// Stable, language-independent tab names for deep links (?tab=reviews), so the
// farmer dashboard's rating badge can open this page straight on Reviews.
const TAB_SLUGS = ['story', 'produce', 'quality', 'reviews', 'farm'] as const

export default function TabSection({ farmer, produce, reviews, produceReviews, media }: Props) {
  const { tx, L } = useLang()
  const searchParams = useSearchParams()
  const isEditMode = searchParams.get('edit') === 'true'

  const linkedTab = TAB_SLUGS.indexOf(searchParams.get('tab') as (typeof TAB_SLUGS)[number])
  // Produce (1) is the default landing tab.
  const [activeTab, setActiveTab] = useState(linkedTab === -1 ? 1 : linkedTab)

  // A deep link should land on the tab's content, not on the hero above it.
  // Offset by the two stacked sticky bars so the tab strip stays visible.
  const tabBarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (linkedTab === -1 || !tabBarRef.current) return
    const top = tabBarRef.current.getBoundingClientRect().top + window.scrollY - 53
    window.scrollTo({ top, behavior: 'smooth' })
    // Only on first paint of a deep link — re-running would fight the farmer
    // once they start switching tabs by hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const TABS = [tx.story, tx.produce, tx.quality, tx.reviews, tx.farm]

  return (
    <div>
      <div ref={tabBarRef} className="sticky top-[53px] z-40 bg-white border-b border-gray-200">
        <div className="flex overflow-x-auto scrollbar-hide">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`flex-shrink-0 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === i
                  ? 'border-green-700 text-green-700'
                  : 'border-transparent text-gray-500'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        {activeTab === 0 && <StoryTab farmer={farmer} />}
        {activeTab === 1 && <ProduceTab farmer={farmer} produce={produce} produceReviews={produceReviews} isEditMode={isEditMode} />}
        {activeTab === 2 && <QualityTab farmer={farmer} produce={produce} />}
        {activeTab === 3 && <ReviewsTab reviews={reviews} farmerId={farmer.id as string} />}
        {activeTab === 4 && <FarmMediaTab media={media} />}
      </div>
      <CartFab />
    </div>
  )
}

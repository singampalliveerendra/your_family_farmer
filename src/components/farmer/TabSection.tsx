'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLang } from '@/lib/LanguageContext'
import StoryTab from './tabs/StoryTab'
import ProduceTab from './tabs/ProduceTab'
import QualityTab from './tabs/QualityTab'
import ReviewsTab from './tabs/ReviewsTab'
import FarmMediaTab from './tabs/FarmMediaTab'
import { CartFab } from '@/components/consumer/Cart'

type Props = {
  farmer: Record<string, unknown>
  produce: Record<string, unknown>[]
  reviews: Record<string, unknown>[]
  media: Record<string, unknown>[]
}

export default function TabSection({ farmer, produce, reviews, media }: Props) {
  const { tx, L } = useLang()
  const [activeTab, setActiveTab] = useState(1)
  const searchParams = useSearchParams()
  const isEditMode = searchParams.get('edit') === 'true'

  const TABS = [tx.story, tx.produce, tx.quality, tx.reviews, tx.farm]

  return (
    <div>
      <div className="sticky top-[53px] z-40 bg-white border-b border-gray-200">
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
        {activeTab === 1 && <ProduceTab farmer={farmer} produce={produce} isEditMode={isEditMode} />}
        {activeTab === 2 && <QualityTab farmer={farmer} produce={produce} />}
        {activeTab === 3 && <ReviewsTab reviews={reviews} farmerId={farmer.id as string} />}
        {activeTab === 4 && <FarmMediaTab media={media} />}
      </div>
      <CartFab />
    </div>
  )
}

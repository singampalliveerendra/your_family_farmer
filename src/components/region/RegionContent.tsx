'use client'

import { useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import RegionMap from './RegionMap'
import FarmersTab from './tabs/FarmersTab'
import BrowseProduceTab from './tabs/BrowseProduceTab'
import AddFarmerTab from './tabs/AddFarmerTab'
import { CartFab } from '@/components/consumer/Cart'

const CATEGORY_MAP: Record<string, string[]> = {
  Vegetables: ['Tomato', 'Brinjal', 'Drumstick', 'Bitter Gourd', 'Raw Banana'],
  Fruits: ['Mango', 'Banana', 'Papaya', 'Guava'],
  'Leafy greens': ['Palakura', 'Spinach', 'Methi', 'Coriander'],
}

export default function RegionContent({
  farmers,
  produce,
}: {
  farmers: Record<string, unknown>[]
  produce: Record<string, unknown>[]
}) {
  const { tx, L } = useLang()
  const [activeFilter, setActiveFilter] = useState('All')
  const [activeTab, setActiveTab] = useState(0)
  const [highlightedFarmerId, setHighlightedFarmerId] = useState<string | null>(null)

  const FILTERS = [tx.all, tx.vegetables, tx.fruits, tx.leafyGreens, tx.naturalOnly]
  const TABS = [tx.farmers, tx.browseProduce, tx.addFarmer]

  // Map filter label back to English key for category lookup
  const filterKeyMap: Record<string, string> = {
    [tx.all]: 'All',
    [tx.vegetables]: 'Vegetables',
    [tx.fruits]: 'Fruits',
    [tx.leafyGreens]: 'Leafy greens',
    [tx.naturalOnly]: 'Natural only',
  }

  const filterKey = filterKeyMap[activeFilter] ?? activeFilter

  const filteredProduce = produce.filter((p) => {
    if (filterKey === 'All') return true
    if (filterKey === 'Natural only') return p.method === 'natural'
    const names = CATEGORY_MAP[filterKey] ?? []
    return names.some((n) => (p.name as string).includes(n))
  })

  const filteredFarmerIds = new Set(filteredProduce.map((p) => p.farmer_id))
  const filteredFarmers = filterKey === 'All'
    ? farmers
    : farmers.filter((f) => filteredFarmerIds.has(f.id))

  return (
    <div>
      {/* Filter chips */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                activeFilter === filter
                  ? 'bg-green-700 text-white border-green-700'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Map */}
      <RegionMap
        farmers={filteredFarmers}
        highlightedFarmerId={highlightedFarmerId}
        onPinClick={setHighlightedFarmerId}
      />

      {/* Tabs */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="flex">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-colors ${
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
        {activeTab === 0 && (
          <FarmersTab
            farmers={filteredFarmers}
            produce={produce}
            highlightedFarmerId={highlightedFarmerId}
          />
        )}
        {activeTab === 1 && <BrowseProduceTab produce={filteredProduce} farmers={farmers} />}
        {activeTab === 2 && <AddFarmerTab farmerCount={farmers.length} />}
      </div>

      <CartFab />
    </div>
  )
}

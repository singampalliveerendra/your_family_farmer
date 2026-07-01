'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'

type Farmer = {
  id: string
  slug: string
  name: string
  village?: string
  district?: string
  method?: string
  rating_avg?: number
  buyer_count?: number
  follower_count?: number
  farming_since_year?: number
}

type Produce = {
  farmer_id: string
  name: string
  emoji?: string
}

type Sort = 'most_followed' | 'newest' | 'top_rated'

export default function FarmersTab({
  farmers,
  produce,
  highlightedFarmerId,
}: {
  farmers: Record<string, unknown>[]
  produce: Record<string, unknown>[]
  highlightedFarmerId: string | null
}) {
  const { tx, L } = useLang()
  const list = farmers as Farmer[]
  const produceList = produce as Produce[]
  // Default = most followed, so popular farmers in this region surface first.
  const [sort, setSort] = useState<Sort>('most_followed')
  const [search, setSearch] = useState('')

  const firstFarmerId = list[0]?.id

  const sorted = useMemo(() => {
    const filtered = list.filter((f) => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        f.name.toLowerCase().includes(q) ||
        (f.village ?? '').toLowerCase().includes(q)
      )
    })
    if (sort === 'most_followed') {
      return [...filtered].sort((a, b) => (b.follower_count ?? 0) - (a.follower_count ?? 0))
    }
    if (sort === 'top_rated') {
      return [...filtered].sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0))
    }
    return filtered
  }, [list, sort, search])

  if (list.length === 0) {
    return <div className="text-center py-10 text-gray-400 text-sm">{tx.noFarmersFound}</div>
  }

  return (
    <div className="space-y-3">
      {/* Search + sort controls */}
      <div className="space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tx.searchFarmersPlaceholder}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none bg-white"
        />
        <div className="flex gap-2">
          {(['most_followed', 'newest', 'top_rated'] as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                sort === s ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 active:bg-gray-200'
              }`}
            >
              {s === 'most_followed' ? L('Most followed', 'ఎక్కువ అనుచరులు') : s === 'newest' ? tx.sortNewest : tx.sortTopRated}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">{tx.noFarmersFound}</div>
      ) : (
        sorted.map((farmer) => {
          const farmerProduce = produceList.filter((p) => p.farmer_id === farmer.id)
          const isHighlighted = highlightedFarmerId === farmer.id
          const isCofounder = farmer.id === firstFarmerId
          const yearsfarming = farmer.farming_since_year
            ? new Date().getFullYear() - farmer.farming_since_year
            : null

          return (
            <div
              key={farmer.id}
              className={`bg-white rounded-xl border p-4 transition-all ${
                isHighlighted ? 'border-green-500 shadow-md' : 'border-gray-100'
              } ${isCofounder ? 'border-l-4 border-l-green-600' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full bg-green-700 flex items-center justify-center text-white font-bold flex-shrink-0">
                  {farmer.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-900 text-sm">{farmer.name}</h3>
                    {isCofounder && (
                      <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {tx.cofounder}
                      </span>
                    )}
                    {!farmer.rating_avg && (
                      <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {tx.newFarmer}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mt-0.5">
                    {farmer.village ?? farmer.district}
                    {yearsfarming ? ` · ${yearsfarming} ${tx.yrsFarming}` : ''}
                  </p>

                  {/* Follower count — plain number, drives the "Most followed" rank */}
                  <p className="text-xs font-semibold text-green-700 mt-1">
                    👥 {(farmer.follower_count ?? 0).toLocaleString('en-IN')} {(farmer.follower_count ?? 0) === 1 ? L('follower', 'అనుచరుడు') : L('followers', 'అనుచరులు')}
                  </p>

                  {/* Star rating row */}
                  {farmer.rating_avg ? (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <span
                            key={s}
                            className={`text-xs ${s <= Math.round(farmer.rating_avg!) ? 'text-yellow-400' : 'text-gray-200'}`}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                      <span className="text-xs font-semibold text-gray-700">
                        {farmer.rating_avg.toFixed(1)}
                      </span>
                      {farmer.buyer_count ? (
                        <span className="text-xs text-gray-400">
                          · {farmer.buyer_count} {tx.buyersLabel}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {farmerProduce.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {farmerProduce.slice(0, 4).map((p) => (
                        <span
                          key={p.name}
                          className="bg-green-50 text-green-800 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        >
                          {p.emoji ?? '🌿'} {p.name}
                        </span>
                      ))}
                      {farmerProduce.length > 4 && (
                        <span className="text-[10px] text-gray-400">
                          +{farmerProduce.length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3">
                    {farmer.method === 'natural' ? (
                      <span className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        🌱 {tx.naturalFarming}
                      </span>
                    ) : <span />}
                    <Link
                      href={`/farmer/${farmer.slug}`}
                      className="bg-green-700 text-white text-xs font-semibold px-4 py-2 rounded-lg"
                    >
                      {tx.viewShop}
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )
        })
      )}

    </div>
  )
}

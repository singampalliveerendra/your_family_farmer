'use client'

import { useLang } from '@/lib/LanguageContext'

type Farmer = {
  farming_since_year: number
  rating_avg: number
  buyer_count: number
}

export default function TrustStrip({
  farmer,
  produceCount,
}: {
  farmer: Farmer
  produceCount: number
}) {
  const { tx, L } = useLang()
  const yearsfarming = new Date().getFullYear() - farmer.farming_since_year

  const stats = [
    { label: tx.yearsFarming, value: yearsfarming.toString() },
    { label: tx.starRating, value: `${farmer.rating_avg} ★` },
    { label: tx.buyers, value: farmer.buyer_count.toString() },
    { label: tx.chemicals, value: '0' },
    { label: tx.produceNow, value: `${produceCount}` },
  ]

  return (
    <div className="bg-white border-b border-gray-100">
      <div className="grid grid-cols-5 divide-x divide-gray-100">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col items-center py-3 px-1">
            <span className="text-base font-extrabold text-gray-900">{stat.value}</span>
            <span className="text-[11px] text-gray-500 text-center leading-tight mt-0.5">
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

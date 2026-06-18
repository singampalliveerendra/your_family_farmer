'use client'

import { useLang } from '@/lib/LanguageContext'

type Farmer = {
  story_quote?: string
  farm_size_acres?: number
  village?: string
  district?: string
  farming_since_year?: number
  method?: string
  water_source?: string
  pickup_available?: boolean
  delivery_available?: boolean
  farm_visit_day?: string
  name?: string
  phone?: string
}

export default function StoryTab({ farmer }: { farmer: Record<string, unknown> }) {
  const { tx, L } = useLang()
  const f = farmer as Farmer

  const infoGrid = [
    { label: tx.farmSize, value: f.farm_size_acres ? `${f.farm_size_acres} acres` : '—' },
    { label: tx.location, value: f.village ? `${f.village}, ${f.district}` : '—' },
    { label: tx.farmingSince, value: f.farming_since_year?.toString() ?? '—' },
    { label: tx.method, value: f.method === 'natural' ? tx.naturalFarming : f.method ?? '—' },
    { label: tx.waterSource, value: f.water_source ?? '—' },
    {
      label: tx.pickupDelivery,
      value: [f.pickup_available && 'Pickup', f.delivery_available && 'Delivery']
        .filter(Boolean)
        .join(' · ') || tx.pickupOnly,
    },
  ]

  const certifications = [tx.noPesticides, tx.noHybridSeeds, tx.onFarmCompost, tx.cowDungManure]

  const whatsappVisitLink = `https://wa.me/${f.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(
    tx.visitWhatsApp.replace('{name}', f.name ?? '')
  )}`

  return (
    <div className="space-y-5">
      {f.story_quote && (
        <blockquote className="bg-green-50 border-l-4 border-green-700 px-4 py-3 rounded-r-lg">
          <p className="text-sm italic text-green-900 leading-relaxed">"{f.story_quote}"</p>
          <cite className="text-xs text-green-700 font-semibold mt-2 block">— {f.name}</cite>
        </blockquote>
      )}

      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-3">{tx.farmDetails}</h3>
        <div className="grid grid-cols-2 gap-2">
          {infoGrid.map((item) => (
            <div key={item.label} className="bg-white rounded-lg p-3 border border-gray-100">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">{item.label}</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg p-4 border border-gray-100">
        <h3 className="text-sm font-bold text-gray-700 mb-2">{tx.howWeGrow}</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{tx.howWeGrowDesc}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {certifications.map((cert) => (
            <span key={cert} className="bg-green-100 text-green-800 text-xs font-semibold px-3 py-1 rounded-full">
              {cert}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-amber-900">{tx.visitFarm}</h3>
            <p className="text-xs text-amber-700 mt-1">
              {tx.visitFarmDesc} {f.farm_visit_day ?? 'Saturday morning'}. {tx.visitFarmDesc2}
            </p>
          </div>
          <span className="text-2xl">🌾</span>
        </div>
        <a
          href={whatsappVisitLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block w-full text-center bg-amber-600 text-white text-sm font-semibold py-2.5 rounded-lg"
        >
          {tx.scheduleVisit}
        </a>
      </div>
    </div>
  )
}

'use client'

import { useLang } from '@/lib/LanguageContext'

type Farmer = {
  id: string
  name: string
  slug: string
  village?: string
}

export default function RegionMap({
  farmers,
  highlightedFarmerId,
  onPinClick,
}: {
  farmers: Record<string, unknown>[]
  highlightedFarmerId: string | null
  onPinClick: (id: string) => void
}) {
  const { tx, L } = useLang()
  const list = farmers as Farmer[]

  const PIN_POSITIONS = [
    { x: 195, y: 110 },
    { x: 140, y: 85 },
    { x: 250, y: 90 },
    { x: 160, y: 140 },
    { x: 230, y: 145 },
    { x: 195, y: 70 },
  ]

  return (
    <div className="bg-white mx-4 my-4 rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-600">{tx.farmersNearby}</p>
      </div>
      <svg viewBox="0 0 390 200" className="w-full" style={{ height: 200 }}>
        <rect width="390" height="200" fill="#e8f5e9" />
        <ellipse cx="195" cy="110" rx="160" ry="80" fill="#c8e6c9" stroke="#81c784" strokeWidth="1.5" strokeDasharray="6,3" />
        <circle cx="195" cy="110" r="70" fill="none" stroke="#4caf50" strokeWidth="1" strokeDasharray="4,3" opacity="0.6" />
        <path d="M 20 160 Q 80 150 130 155 Q 180 160 230 152 Q 280 144 350 150" fill="none" stroke="#64b5f6" strokeWidth="4" opacity="0.7" />
        <text x="160" y="168" fontSize="8" fill="#1565c0" opacity="0.8">{L('Krishna River', 'కృష్ణా నది')}</text>

        {list.map((farmer, i) => {
          const pos = PIN_POSITIONS[i] ?? { x: 195 + i * 20, y: 110 }
          const isHighlighted = highlightedFarmerId === farmer.id
          const initials = farmer.name.slice(0, 2).toUpperCase()
          return (
            <g key={farmer.id} onClick={() => onPinClick(farmer.id)} style={{ cursor: 'pointer' }}>
              <circle cx={pos.x} cy={pos.y} r={isHighlighted ? 18 : 14}
                fill={isHighlighted ? '#1b5e20' : '#2e7d32'} stroke="white" strokeWidth="2" />
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize="9" fontWeight="bold" fill="white">
                {initials}
              </text>
              {isHighlighted && (
                <text x={pos.x} y={pos.y + 30} textAnchor="middle" fontSize="8" fill="#1b5e20" fontWeight="bold">
                  {farmer.name}
                </text>
              )}
            </g>
          )
        })}

        <g opacity="0.5">
          <circle cx="270" cy="80" r="14" fill="none" stroke="#9e9e9e" strokeWidth="2" strokeDasharray="3,2" />
          <text x="270" y="76" textAnchor="middle" fontSize="14" fill="#9e9e9e">+</text>
          <text x="270" y="100" textAnchor="middle" fontSize="7" fill="#9e9e9e">invite farmer</text>
        </g>

        <circle cx="195" cy="110" r="3" fill="#f44336" />
        <text x="200" y="107" fontSize="7" fill="#c62828">{L('Tadepalligudem', 'తాడేపల్లిగూడెం')}</text>
      </svg>
    </div>
  )
}

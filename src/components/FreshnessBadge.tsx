'use client'

import { useLang } from '@/lib/LanguageContext'

export function FreshnessBadge({ harvestDate, dot = false }: { harvestDate: string; dot?: boolean }) {
  const { tx, L } = useLang()

  // Parse as local midnight so timezone doesn't flip the day
  const harvest = new Date(harvestDate + 'T00:00:00')
  const today = new Date()
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.floor((todayMidnight.getTime() - harvest.getTime()) / 86400000)

  if (days < 0) return null

  const label =
    days === 0 ? tx.harvestToday
    : days === 1 ? tx.harvestYesterday
    : tx.harvestDaysAgo.replace('{n}', String(days))

  // Compact "dot" variant for the consumer product card: green dot + label
  // on a fixed light-green pill, regardless of age.
  if (dot) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-0.5"
        style={{ backgroundColor: '#e8f5e9', color: '#1a5c2a' }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#1a5c2a' }} />
        {label}
      </span>
    )
  }

  const cls =
    days === 0 ? 'text-green-700 bg-green-50'
    : days === 1 ? 'text-amber-700 bg-amber-50'
    : 'text-red-600 bg-red-50'

  return (
    <span className={`text-[10px] font-bold ${cls} px-2 py-0.5 rounded-full`}>
      {label}
    </span>
  )
}

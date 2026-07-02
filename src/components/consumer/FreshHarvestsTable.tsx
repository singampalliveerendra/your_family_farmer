'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'
import { localizeName } from '@/lib/localizeName'
import { harvestClock } from '@/lib/harvest'

// Two compact harvest tables shown above the consumer search box:
//   FreshHarvestsTable    — already-picked harvests (buyable now), newest first
//   UpcomingHarvestsTable — future/pre-book harvests, soonest first
// Both show the harvest name + its clock; tapping a row opens the complete
// harvest details (the produce page). They read the `harvests` table (see
// scripts/harvests-migration.sql) and silently render nothing when the table
// isn't present yet or there are no matching harvests.

type Listing = {
  id: string
  name: string
  emoji?: string | null
  status?: string | null
}

type HarvestRow = {
  id: string
  harvested_at: string
  produce_listing_id: string
  // PostgREST embeds the parent listing as an object (many-to-one).
  produce_listings?: Listing | Listing[] | null
}

const DAY = 86_400_000
type Variant = 'fresh' | 'upcoming'

function HarvestTable({ variant }: { variant: Variant }) {
  const { lang, L } = useLang()
  const router = useRouter()
  const [rows, setRows] = useState<HarvestRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const now = Date.now()
    const base = supabase
      .from('harvests')
      .select('id, harvested_at, produce_listing_id, produce_listings!inner(id, name, emoji, status)')
      .eq('produce_listings.status', 'available')
    // Fresh = picked within the last 2 days, newest first.
    // Upcoming = picks in the next 7 days (pre-book), soonest first.
    const q =
      variant === 'fresh'
        ? base
            .gte('harvested_at', new Date(now - 2 * DAY).toISOString())
            .lte('harvested_at', new Date(now).toISOString())
            .order('harvested_at', { ascending: false })
        : base
            .gt('harvested_at', new Date(now).toISOString())
            .lte('harvested_at', new Date(now + 7 * DAY).toISOString())
            .order('harvested_at', { ascending: true })
    q.limit(12).then(({ data }) => {
      if (cancelled) return
      setRows((data ?? []) as HarvestRow[])
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [variant])

  // One listing from the embed (handle either object or single-element array).
  const listingOf = (r: HarvestRow): Listing | null => {
    const l = r.produce_listings
    if (!l) return null
    return Array.isArray(l) ? (l[0] ?? null) : l
  }

  if (!loaded || rows.length === 0) return null

  const title = variant === 'fresh'
    ? L('Fresh Harvests near you', 'మీ దగ్గర తాజా కోతలు')
    : L('Upcoming Harvests', 'రాబోయే కోతలు')
  const icon = variant === 'fresh' ? '🌾' : '🌱'
  const hint = variant === 'fresh' ? L('Freshest first', 'తాజావి ముందు') : L('Soonest first', 'త్వరలో వచ్చేవి')
  const whenLabel = variant === 'fresh' ? L('When', 'ఎప్పుడు') : L('Expected', 'అంచనా')

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden self-start">
      <div className="px-4 pt-4 pb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-extrabold text-gray-900">
          {icon} {title}
        </h2>
        <span className="text-[11px] text-gray-500 whitespace-nowrap">{hint}</span>
      </div>

      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
            <th className="font-bold px-4 py-2">{L('Harvest', 'కోత')}</th>
            <th className="font-bold px-4 py-2 text-right">{whenLabel}</th>
            <th className="w-6" aria-hidden="true"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const item = listingOf(r)
            if (!item) return null
            return (
              <tr
                key={r.id}
                onClick={() => router.push(`/consumer/produce/${item.id}`)}
                className="border-b border-gray-50 last:border-0 cursor-pointer active:bg-green-50"
              >
                <td className="pl-4 pr-2 py-3">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="text-lg shrink-0">{item.emoji || '🌿'}</span>
                    <span className="text-sm font-bold text-gray-900 truncate">
                      {localizeName(item.name, lang)}
                    </span>
                  </span>
                </td>
                <td className="px-2 py-3 text-right align-middle">
                  <span className={`text-[11px] font-semibold whitespace-nowrap ${variant === 'fresh' ? 'text-green-700' : 'text-blue-700'}`}>
                    ⏱ {harvestClock(r.harvested_at, L)}
                  </span>
                </td>
                {/* Chevron — signals the whole row is tappable and opens the
                    complete harvest details. */}
                <td className="pr-3 pl-1 py-3 text-right align-middle">
                  <span className="text-gray-300 text-lg leading-none">›</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Hint so it's clear the rows are tappable. */}
      <p className="px-4 pb-3 pt-1 text-[11px] text-gray-400">
        {L('Tap a harvest to see full details', 'పూర్తి వివరాల కోసం కోతను నొక్కండి')}
      </p>
    </div>
  )
}

export function FreshHarvestsTable() {
  return <HarvestTable variant="fresh" />
}

export function UpcomingHarvestsTable() {
  return <HarvestTable variant="upcoming" />
}

export default FreshHarvestsTable

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'
import { localizeName } from '@/lib/localizeName'
import { harvestClock, freshnessLabel } from '@/lib/harvest'

// "Today's Harvest near you" — the freshness-driven USP feed. Lists harvests
// from the last 2 days (buyable now) plus the next 3 days (pre-book), newest
// pick first, each with the "Harvested 2h ago" clock. Tapping opens the produce.
// Reads the `harvests` table (see scripts/harvests-migration.sql); silently
// renders nothing if the table/migration isn't present yet.

type Listing = {
  id: string
  name: string
  variety?: string | null
  emoji?: string | null
  image_url?: string | null
  image_urls?: string[] | null
  method?: string | null
  status?: string | null
  price_tier_1_price?: number | null
  unit?: string | null
}

type HarvestRow = {
  id: string
  harvested_at: string
  shelf_life_days?: number | null
  approx_quantity?: number | null
  unit?: string | null
  produce_listing_id: string
  // PostgREST embeds the parent listing as an object (many-to-one).
  produce_listings?: Listing | Listing[] | null
}

const DAY = 86_400_000

export default function TodaysHarvest() {
  const { lang, L } = useLang()
  const [rows, setRows] = useState<HarvestRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const start = new Date(Date.now() - 2 * DAY).toISOString()
    const end = new Date(Date.now() + 3 * DAY).toISOString()
    supabase
      .from('harvests')
      .select('id, harvested_at, shelf_life_days, approx_quantity, unit, produce_listing_id, produce_listings!inner(id, name, variety, emoji, image_url, image_urls, method, status, price_tier_1_price, unit)')
      .gte('harvested_at', start)
      .lte('harvested_at', end)
      .eq('produce_listings.status', 'available')
      .order('harvested_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (cancelled) return
        setRows((data ?? []) as HarvestRow[])
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [])

  // One listing from the embed (handle either object or single-element array).
  const listingOf = (r: HarvestRow): Listing | null => {
    const l = r.produce_listings
    if (!l) return null
    return Array.isArray(l) ? (l[0] ?? null) : l
  }

  // Past/today harvests first (buyable now, freshest), then upcoming (pre-book).
  const ordered = [...rows].sort((a, b) => {
    const ta = new Date(a.harvested_at).getTime()
    const tb = new Date(b.harvested_at).getTime()
    const now = Date.now()
    const aFuture = ta > now, bFuture = tb > now
    if (aFuture !== bFuture) return aFuture ? 1 : -1   // past before future
    return aFuture ? ta - tb : tb - ta                  // future: soonest; past: most recent
  })

  if (!loaded || ordered.length === 0) return null

  return (
    <section className="mb-4">
      <div className="flex items-baseline justify-between px-1 mb-2">
        <h2 className="text-base font-extrabold text-gray-900">
          🌾 {L("Today's Harvest near you", 'మీ దగ్గర ఈరోజు కోత')}
        </h2>
        <span className="text-[11px] text-gray-500">{L('Freshest first', 'తాజావి ముందు')}</span>
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1 snap-x">
        {ordered.map((r) => {
          const item = listingOf(r)
          if (!item) return null
          const emoji = item.emoji || '🌿'
          const cover = (item.image_urls && item.image_urls.length ? item.image_urls[0] : item.image_url) || null
          const clock = harvestClock(r.harvested_at, L)
          const fresh = freshnessLabel(r.harvested_at, r.shelf_life_days, L)
          const future = new Date(r.harvested_at).getTime() > Date.now()
          return (
            <Link
              key={r.id}
              href={`/consumer/produce/${item.id}`}
              className="snap-start shrink-0 w-36 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden active:opacity-80"
            >
              <div className="h-24 w-full bg-green-50 flex items-center justify-center relative">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl">{emoji}</span>
                )}
                {future && (
                  <span className="absolute top-1.5 left-1.5 bg-blue-600 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5">
                    {L('Pre-book', 'ముందస్తు')}
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="text-[13px] font-bold text-gray-900 truncate">{localizeName(item.name, lang)}</p>
                <p className="text-[10px] font-semibold text-green-700 truncate mt-0.5">⏱ {clock}</p>
                {fresh && <p className="text-[10px] text-amber-700 truncate">{fresh}</p>}
                {item.price_tier_1_price != null && (
                  <p className="text-xs font-extrabold text-green-800 mt-0.5">₹{item.price_tier_1_price}<span className="text-[10px] font-medium text-gray-400">/{item.unit || 'kg'}</span></p>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

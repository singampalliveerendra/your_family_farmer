'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useCart } from '@/components/consumer/Cart'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { useLang } from '@/lib/LanguageContext'
import { localizeName } from '@/lib/localizeName'
import { harvestClock } from '@/lib/harvest'
import { normalizePickupSchedule } from '@/lib/pickup-slots'
import { CONSUMER_VISIBLE_STATUSES } from '@/lib/produceStatus'

// "Today's Harvest near you" — the freshness-driven USP feed. Lists harvests
// from the last 2 days (buyable now) plus the next 3 days (pre-book), newest
// pick first, each with the "Harvested 2h ago" clock. Each card is one harvest
// and taps through to that harvest's own detail page. Reads the `harvests`
// table (see scripts/harvests-migration.sql); silently renders nothing if the
// table/migration isn't present yet.

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
  shelf_life_days?: number | null
}

type HarvestRow = {
  id: string
  harvested_at: string
  shelf_life_days?: number | null
  approx_quantity?: number | null
  stock_qty?: number | null
  unit?: string | null
  produce_listing_id: string
  // PostgREST embeds the parent listing as an object (many-to-one).
  produce_listings?: Listing | Listing[] | null
}

const DAY = 86_400_000

export default function TodaysHarvest() {
  const { lang, L } = useLang()
  const { addItem, cart } = useCart()
  const { requireAuth } = useConsumerAuth()
  const [rows, setRows] = useState<HarvestRow[]>([])
  const [loaded, setLoaded] = useState(false)
  // Harvest ids mid add-to-cart, so the button can show progress / ignore taps.
  const [adding, setAdding] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    const start = new Date(Date.now() - 2 * DAY).toISOString()
    const end = new Date(Date.now() + 3 * DAY).toISOString()
    supabase
      .from('harvests')
      .select('id, harvested_at, shelf_life_days, approx_quantity, stock_qty, unit, produce_listing_id, produce_listings!inner(id, name, variety, emoji, image_url, image_urls, method, status, price_tier_1_price, unit, shelf_life_days)')
      .eq('paused', false)
      .gte('harvested_at', start)
      .lte('harvested_at', end)
      // A harvest has its own stock, so a 'sold_out' template must not hide it —
      // only a genuine takedown (paused/suspended) should. See produceStatus.ts.
      .in('produce_listings.status', CONSUMER_VISIBLE_STATUSES)
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

  // Add THIS harvest to the cart (keyed by harvest id). Fetches price tiers +
  // farmer from the template on tap; uses the harvest's own stock. requireAuth
  // gates it behind consumer login.
  const addHarvestToCart = (r: HarvestRow) => {
    if (adding[r.id]) return
    requireAuth(async () => {
      setAdding((s) => ({ ...s, [r.id]: true }))
      const { data: listing } = await supabase
        .from('produce_listings')
        .select('id, name, variety, emoji, unit, price_tier_1_qty, price_tier_1_price, price_tier_2_qty, price_tier_2_price, price_tier_3_price, farmer_id')
        .eq('id', r.produce_listing_id)
        .single()
      if (!listing) { setAdding((s) => ({ ...s, [r.id]: false })); return }
      const { data: farmer } = await supabase
        .from('farmers')
        .select('id, name, phone, village, slug, pickup_locations, pickup_slots')
        .eq('id', listing.farmer_id)
        .single()
      setAdding((s) => ({ ...s, [r.id]: false }))
      if (!farmer?.phone || !listing.price_tier_1_price) return
      addItem({
        listingId: listing.id,
        harvestId: r.id,
        harvestedAt: r.harvested_at,
        shelfLifeDays: r.shelf_life_days ?? undefined,
        name: listing.name,
        variety: listing.variety,
        emoji: listing.emoji,
        unit: listing.unit ?? undefined,
        stockQty: r.stock_qty ?? undefined,
        pricePerKg: listing.price_tier_1_price,
        priceTier1Qty: listing.price_tier_1_qty,
        priceTier1Price: listing.price_tier_1_price,
        priceTier2Qty: listing.price_tier_2_qty,
        priceTier2Price: listing.price_tier_2_price,
        priceTier3Price: listing.price_tier_3_price,
        farmerId: farmer.id,
        farmerName: farmer.name,
        farmerPhone: farmer.phone,
        farmerVillage: farmer.village ?? '',
        farmerSlug: farmer.slug,
        farmerPickupLocations: farmer.pickup_locations ?? [],
        farmerPickupSlots: normalizePickupSchedule(farmer.pickup_slots, farmer.pickup_locations ?? []),
      }, 1)
    })
  }

  const now = Date.now()
  // Split into two sides: already-picked (buyable now, hottest first) and
  // upcoming (pre-book, soonest first).
  const freshRows = rows
    .filter((r) => new Date(r.harvested_at).getTime() <= now)
    .sort((a, b) => new Date(b.harvested_at).getTime() - new Date(a.harvested_at).getTime())
  const upcomingRows = rows
    .filter((r) => new Date(r.harvested_at).getTime() > now)
    .sort((a, b) => new Date(a.harvested_at).getTime() - new Date(b.harvested_at).getTime())

  if (!loaded || (freshRows.length === 0 && upcomingRows.length === 0)) return null

  // One harvest card. Fresh picks get a 🔥 "hot" badge; upcoming get "Pre-book".
  const renderCard = (r: HarvestRow, kind: 'fresh' | 'upcoming') => {
    const item = listingOf(r)
    if (!item) return null
    // A pick judges itself by its own stock — null means quantity not tracked,
    // not zero. Spent picks stay in the strip (the buyer wants to know the crop
    // exists) but say so, and the add button goes.
    const soldOut = r.stock_qty != null && r.stock_qty <= 0
    const emoji = item.emoji || '🌿'
    const cover = (item.image_urls && item.image_urls.length ? item.image_urls[0] : item.image_url) || null
    const clock = harvestClock(r.harvested_at, L)
    return (
      <Link
        key={r.id}
        href={`/consumer/harvest/${r.id}`}
        className={`snap-start shrink-0 w-36 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden active:opacity-80 ${soldOut ? 'opacity-75' : ''}`}
      >
        <div className="h-24 w-full bg-green-50 flex items-center justify-center relative">
          {cover ? (
            <Image src={cover} alt={item.name} fill sizes="144px" className="object-cover" />
          ) : (
            <span className="text-4xl">{emoji}</span>
          )}
          {kind === 'fresh' ? (
            <span className="absolute top-1.5 left-1.5 bg-orange-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
              🔥
            </span>
          ) : (
            <span className="absolute top-1.5 left-1.5 bg-blue-600 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5">
              {L('Pre-book', 'ముందస్తు')}
            </span>
          )}
          {/* Add-to-cart — adds THIS harvest without leaving the page.
              preventDefault/stopPropagation so it doesn't follow the card link.
              A spent pick gets a SOLD OUT tag in its place. */}
          {soldOut ? (
            <span className="absolute top-1.5 right-1.5 bg-red-50 text-red-600 text-[9px] font-bold rounded-full px-1.5 py-0.5">
              {L('Sold out', 'అయిపోయింది')}
            </span>
          ) : (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); addHarvestToCart(r) }}
            disabled={!!adding[r.id]}
            aria-label={L('Add to cart', 'బుట్టలో వేయండి')}
            className={`absolute top-1.5 right-1.5 inline-flex items-center justify-center w-7 h-7 rounded-full shadow active:scale-95 disabled:opacity-50 ${
              cart[r.id] ? 'bg-green-600 text-white' : 'bg-white text-green-700'
            }`}
          >
            {adding[r.id] ? (
              <span className="text-[10px] leading-none">…</span>
            ) : cart[r.id] ? (
              <span className="text-xs leading-none">✓</span>
            ) : (
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="20" r="1.4" />
                <circle cx="18" cy="20" r="1.4" />
                <path d="M2.5 3h2l2.2 12.1a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
              </svg>
            )}
          </button>
          )}
        </div>
        <div className="p-2">
          <p className="text-[13px] font-bold text-gray-900 truncate">{localizeName(item.name, lang)}</p>
          <p className={`text-[10px] font-semibold truncate mt-0.5 ${kind === 'fresh' ? 'text-green-700' : 'text-blue-700'}`}>⏱ {clock}</p>
          {item.price_tier_1_price != null && (
            <p className="text-xs font-extrabold text-green-800 mt-0.5">₹{item.price_tier_1_price}<span className="text-[10px] font-medium text-gray-400">/{item.unit || 'kg'}</span></p>
          )}
        </div>
      </Link>
    )
  }

  return (
    <section className="mb-4">
      <h2 className="text-base font-extrabold text-gray-900 px-1 mb-2">
        🌾 {L("Today's Harvest near you", 'మీ దగ్గర ఈరోజు కోత')}
      </h2>

      {/* Fresh on one side, Upcoming on the other (stacked on mobile). Each side
          renders nothing when it has no harvests. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        {freshRows.length > 0 && (
          <div>
            <div className="flex items-baseline justify-between px-1 mb-1.5">
              <h3 className="text-sm font-extrabold text-gray-900">🔥 {L('Fresh Harvests', 'తాజా కోతలు')}</h3>
              <span className="text-[11px] text-gray-500">{L('Freshest first', 'తాజావి ముందు')}</span>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1 snap-x">
              {freshRows.map((r) => renderCard(r, 'fresh'))}
            </div>
          </div>
        )}
        {upcomingRows.length > 0 && (
          <div>
            <div className="flex items-baseline justify-between px-1 mb-1.5">
              <h3 className="text-sm font-extrabold text-gray-900">🌱 {L('Upcoming Harvests', 'రాబోయే కోతలు')}</h3>
              <span className="text-[11px] text-gray-500">{L('Soonest first', 'త్వరలో వచ్చేవి')}</span>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1 snap-x">
              {upcomingRows.map((r) => renderCard(r, 'upcoming'))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

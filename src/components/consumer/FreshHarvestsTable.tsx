'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCart } from '@/components/consumer/Cart'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { useLang } from '@/lib/LanguageContext'
import { localizeName } from '@/lib/localizeName'
import { harvestClock } from '@/lib/harvest'
import { normalizePickupSchedule } from '@/lib/pickup-slots'

// Two compact harvest tables shown above the consumer search box:
//   FreshHarvestsTable    — already-picked harvests (buyable now), newest first
//   UpcomingHarvestsTable — future/pre-book harvests, soonest first
// Each row is one HARVEST (its own product): tapping it opens that harvest's
// detail page, and the cart icon adds that specific harvest — so two harvests of
// the same produce are independent. They read the `harvests` table (see
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
  stock_qty?: number | null
  shelf_life_days?: number | null
  // PostgREST embeds the parent listing as an object (many-to-one).
  produce_listings?: Listing | Listing[] | null
}

const DAY = 86_400_000
type Variant = 'fresh' | 'upcoming'

function HarvestTable({ variant }: { variant: Variant }) {
  const { lang, L } = useLang()
  const router = useRouter()
  const { addItem, cart } = useCart()
  const { requireAuth } = useConsumerAuth()
  const [rows, setRows] = useState<HarvestRow[]>([])
  const [loaded, setLoaded] = useState(false)
  // Listing ids currently being fetched-and-added, so the cart icon can show a
  // spinner and ignore double taps.
  const [adding, setAdding] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    const now = Date.now()
    const base = supabase
      .from('harvests')
      .select('id, harvested_at, produce_listing_id, stock_qty, shelf_life_days, produce_listings!inner(id, name, emoji, status)')
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

  // Add THIS harvest to the cart from the table (keyed by harvest id, so two
  // harvests of the same produce are separate cart lines). The row holds the
  // harvest's own stock/date; we fetch price tiers + farmer from the template on
  // tap. requireAuth gates it behind consumer login.
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
            <th className="w-10" aria-hidden="true"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const item = listingOf(r)
            if (!item) return null
            return (
              <tr
                key={r.id}
                onClick={() => router.push(`/consumer/harvest/${r.id}`)}
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
                {/* Add-to-cart — adds THIS harvest (keyed by harvest id, so the
                    fresh and upcoming rows don't mirror each other). stopPropagation
                    so it doesn't also open the details row. */}
                <td className="pr-3 pl-1 py-3 text-right align-middle">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void addHarvestToCart(r) }}
                    disabled={!!adding[r.id]}
                    aria-label={L('Add to cart', 'బుట్టలో వేయండి')}
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full active:scale-95 disabled:opacity-50 ${
                      cart[r.id] ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700'
                    }`}
                  >
                    {adding[r.id] ? (
                      <span className="text-xs leading-none">…</span>
                    ) : cart[r.id] ? (
                      <span className="text-sm leading-none">✓</span>
                    ) : (
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="9" cy="20" r="1.4" />
                        <circle cx="18" cy="20" r="1.4" />
                        <path d="M2.5 3h2l2.2 12.1a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
                      </svg>
                    )}
                  </button>
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

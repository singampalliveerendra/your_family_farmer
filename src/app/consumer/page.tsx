'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import GlobalNav from '@/components/consumer/GlobalNav'
import { CartFab, useCart } from '@/components/consumer/Cart'
import MyOrdersChip from '@/components/consumer/MyOrdersChip'
import RoleGateModal from '@/components/consumer/RoleGateModal'
import ProduceReviewsModal from '@/components/consumer/ProduceReviewsModal'
import ShareButton from '@/components/consumer/ShareButton'
import FreshHarvestsTable, { UpcomingHarvestsTable } from '@/components/consumer/FreshHarvestsTable'
import { supabase } from '@/lib/supabase'
import { haversineKm, nearestTown, formatDistance, farmerCoords, townByName } from '@/lib/location'
import { todayInIndia, isPastDate } from '@/lib/date'
import LocationSearch from '@/components/LocationSearch'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { useLang } from '@/lib/LanguageContext'
import { localizeName } from '@/lib/localizeName'
import { harvestClock, freshnessLabel } from '@/lib/harvest'
import { normalizePickupSchedule } from '@/lib/pickup-slots'

const DEFAULT_REGION = 'tadepalligudem'

// Which region's farmers should see a demand intent.
//
// The consumer's saved location is free text, so slugging it directly minted
// regions that no farmer belongs to ("gajuwaka") and the intent became invisible
// to everyone. Resolve it against the known towns instead, and fall back to the
// default region when it doesn't match one — better that a real farmer sees the
// request than that it vanishes.
function intentRegionSlug(): string {
  const saved = typeof localStorage === 'undefined'
    ? null
    : localStorage.getItem('yff_consumer_location_name')
  const town = townByName(saved)
  return town ? town.name.toLowerCase().replace(/\s+/g, '') : DEFAULT_REGION
}

type Farmer = {
  id: string
  name: string
  village: string
  slug: string
  phone: string
  method: string
  pickup_locations?: string[] | null
  pickup_slots?: unknown
  lat?: number | null
  lng?: number | null
}

type ProduceListing = {
  id: string
  name: string
  variety?: string
  emoji?: string
  image_url?: string
  image_urls?: string[] | null
  method?: string
  category?: string | null
  description?: string | null
  status: string
  price_tier_1_price?: number
  price_tier_1_qty?: number
  price_tier_2_price?: number
  price_tier_2_qty?: number
  price_tier_3_price?: number
  price_tier_3_qty?: number
  stock_qty?: number
  unit?: string
  available_to?: string
  rating_avg?: number | null
  review_count?: number | null
  // Non-cancelled/declined order count for this listing — powers "sort by
  // Purchases". Attached by /api/produce and /api/produce/search.
  purchase_count?: number | null
  farmer_id: string
  farmer?: Farmer
  // Shelf life set on the listing itself (produce Edit form) — used as the
  // fallback when the latest logged harvest doesn't carry its own.
  shelf_life_days?: number | null
  // Harvest date/time set on the listing itself (produce Edit form). Drives the
  // clock when no separate `harvests` row has been logged for this produce.
  harvest_date?: string | null
  // Latest harvest for this produce (template), attached client-side from the
  // `harvests` table — drives the "Harvested 2 hours ago" clock on the card.
  latest_harvested_at?: string | null
  latest_shelf_life_days?: number | null
}

// One logged harvest of a produce (template). The main grid shows a separate
// card per harvest — so 3 harvests of the same Banana are 3 cards, each with its
// own pick date/time, shelf life and stock — while inheriting everything else
// (photos, price, farmer, quality) from the produce_listing. Reads the
// `harvests` table (scripts/harvests-migration.sql).
type GridHarvest = {
  id: string
  harvested_at: string
  shelf_life_days: number | null
  stock_qty: number | null
  unit: string | null
}

// A produce listing with its computed distance from the consumer.
type WithDist = ProduceListing & { distKm: number | null; distApprox: boolean }

// One grid tile. `harvest` present → a specific harvest of the produce (own
// date/shelf/stock, links to the harvest page); absent → the produce template
// (fallback when nothing has been logged). `sortAt` is the harvest date/time
// used by the "Freshest first" sort; `key` is the React/cart key.
type DisplayCard = { item: WithDist; harvest?: GridHarvest; key: string; sortAt: number }

// Keyword fallback for categorising older listings that don't have an explicit
// `category` set. Kept in sync with /api/produce/search so the client-side
// filter (below) matches what the server would have returned — but instantly,
// with no network round-trip.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  vegetables: [
    'tomato', 'capsicum', 'brinjal', 'eggplant', 'bean', 'pea', 'pumpkin',
    'gourd', 'onion', 'potato', 'garlic', 'carrot', 'radish', 'cucumber',
    'okra', 'ladyfinger', 'drumstick', 'ridge gourd', 'bottle gourd', 'chilli',
    'pepper', 'bitter gourd', 'cluster bean', 'snake gourd',
  ],
  fruits: [
    'mango', 'banana', 'papaya', 'guava', 'pomegranate', 'orange', 'lime',
    'lemon', 'coconut', 'tamarind', 'jackfruit', 'sapota', 'fig', 'grapes',
    'watermelon', 'muskmelon', 'pineapple', 'custard apple',
  ],
  grains: [
    'rice', 'wheat', 'jowar', 'bajra', 'ragi', 'maize', 'corn', 'dal',
    'lentil', 'chickpea', 'groundnut', 'sesame', 'turmeric', 'ginger',
    'pulses', 'toor', 'moong', 'urad', 'chana',
  ],
  leafy: [
    'spinach', 'methi', 'fenugreek', 'coriander', 'mint', 'curry',
    'amaranth', 'sorrel', 'moringa', 'drumstick leaves', 'palak',
  ],
  spices: [
    'turmeric', 'ginger', 'chilli', 'pepper', 'cardamom', 'clove',
    'cinnamon', 'cumin', 'coriander seed', 'mustard', 'fenugreek seed',
    'tamarind', 'curry leaf', 'garlic', 'nutmeg', 'fennel', 'asafoetida',
  ],
}

const CATEGORIES = [
  { key: 'all',        en: 'All',             te: 'అన్నీ' },
  { key: 'vegetables', en: 'Vegetables',      te: 'కూరగాయలు' },
  { key: 'fruits',     en: 'Fruits',          te: 'పళ్ళు' },
  { key: 'grains',     en: 'Grains & Pulses', te: 'ధాన్యాలు' },
  { key: 'leafy',      en: 'Leafy Greens',    te: 'ఆకు కూరలు' },
  { key: 'spices',     en: 'Spices',          te: 'మసాలాలు' },
  { key: 'other',      en: 'Other',           te: 'ఇతర' },
]

// Short, single-word method label for the small pill on the image corner.
const METHOD_SHORT: Record<string, string> = {
  natural:      'Natural',
  organic:      'Organic',
  low_chemical: 'Semi-org',
  chemical:     'Chemical',
}

// Solid pill colour for the method badge over the image (spec: natural=green,
// organic=blue). White text sits on a solid colour so it reads over any photo.
const METHOD_PILL: Record<string, string> = {
  natural:      'bg-green-600 text-white',
  organic:      'bg-blue-600 text-white',
  low_chemical: 'bg-amber-500 text-white',
  chemical:     'bg-red-500 text-white',
}

// Image-area background tint by produce type, used only for the emoji
// fallback (no photo). Fruits=yellow, vegetables=pink, leafy greens=green.
const PRODUCE_BG: Record<string, string> = {
  '🍌': '#fff8e1', '🥭': '#fff8e1', '🍓': '#fff8e1', '🥥': '#fff8e1', '🍇': '#fff8e1', '🍋': '#fff8e1', // fruits
  '🍅': '#fce4ec', '🍆': '#fce4ec', '🫑': '#fce4ec', '🥕': '#fce4ec', '🌽': '#fce4ec', '🧅': '#fce4ec', '🧄': '#fce4ec', // vegetables
  '🥬': '#e8f5e9', '🥦': '#e8f5e9', '🌿': '#e8f5e9', '🫒': '#e8f5e9', // leafy greens
}
const DEFAULT_PRODUCE_BG = '#f5f5f5'

export default function ConsumerPage() {
  const { L } = useLang()
  const [available, setAvailable]     = useState<ProduceListing[]>([])
  const [comingSoon, setComingSoon]   = useState<ProduceListing[]>([])
  // All logged harvests per produce (listing id → harvests, newest first). Each
  // becomes its own card; the newest also drives the fallback clock. Best-effort
  // from the `harvests` table.
  const [harvestsByListing, setHarvestsByListing] = useState<Record<string, GridHarvest[]>>({})
  const [search, setSearch]           = useState('')
  const [method, setMethod]           = useState('all')
  const [category, setCategory]       = useState('all')
  // Harvest-list sort + farmer filter (Trello: sort/filter the harvests list).
  const [sortBy, setSortBy]           = useState<'fresh' | 'rating' | 'purchases'>('fresh')
  const [farmerFilter, setFarmerFilter] = useState('all')
  const [loading, setLoading]         = useState(true)
  const [farmerCount, setFarmerCount] = useState(0)

  // Consumer location
  const [consumerLat, setConsumerLat]           = useState<number | null>(null)
  const [consumerLng, setConsumerLng]           = useState<number | null>(null)
  const [consumerLocationName, setConsumerLocationName] = useState('')
  const [showLocationSheet, setShowLocationSheet]       = useState(false)
  const [distanceFilter, setDistanceFilter]             = useState<number | null>(null)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [avRes, csRes] = await Promise.all([
        fetch('/api/produce', { cache: 'no-store' }),
        fetch('/api/produce?status=coming_soon', { cache: 'no-store' }),
      ])
      const av: ProduceListing[] = await avRes.json().catch(() => [])
      const cs: ProduceListing[] = await csRes.json().catch(() => [])
      const avArr = Array.isArray(av) ? av : []
      const csArr = Array.isArray(cs) ? cs : []
      setAvailable(avArr)
      setComingSoon(csArr)
      setFarmerCount(new Set(avArr.map((p) => p.farmer_id)).size)

      // All harvests per produce (last 14 days + any future pre-books) → one card
      // each. Best-effort: a missing `harvests` table (migration not applied)
      // just leaves the map empty, so the grid falls back to one card per produce.
      try {
        const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
        const { data: hs } = await supabase
          .from('harvests')
          .select('id, produce_listing_id, harvested_at, shelf_life_days, stock_qty, unit')
          .gte('harvested_at', since)
          .order('harvested_at', { ascending: false })
          .limit(500)
        const map: Record<string, GridHarvest[]> = {}
        for (const h of (hs ?? []) as (GridHarvest & { produce_listing_id: string })[]) {
          ;(map[h.produce_listing_id] ??= []).push({
            id: h.id,
            harvested_at: h.harvested_at,
            shelf_life_days: h.shelf_life_days ?? null,
            stock_qty: h.stock_qty ?? null,
            unit: h.unit ?? null,
          })
        }
        setHarvestsByListing(map)
      } catch { /* harvests table not present yet */ }
    } catch { /* silent */ }
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    // Background refreshes — no skeleton flash
    const onVisible = () => { if (document.visibilityState === 'visible') fetchData(true) }
    document.addEventListener('visibilitychange', onVisible)
    const channel = supabase
      .channel('produce_listings_consumer')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produce_listings' }, () => fetchData(true))
      .subscribe()
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [fetchData])

  // Search/method/category filtering, done entirely client-side over the
  // already-loaded `available` list. Everything needed (name, variety,
  // description, method, category) comes back from /api/produce, so switching
  // categories is instant — no debounce, no network round-trip, no stale flash
  // of the previous category while a request is in flight.
  const filtered = useMemo<ProduceListing[]>(() => {
    let items = available
    const q = search.trim().toLowerCase()
    if (q) {
      items = items.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.variety?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      )
    }
    if (method !== 'all') {
      items = items.filter((p) => p.method?.toLowerCase().includes(method.toLowerCase()))
    }
    if (category !== 'all') {
      const keywords = CATEGORY_KEYWORDS[category] ?? []
      items = items.filter((p) =>
        p.category
          ? p.category === category
          : keywords.some((kw) => p.name?.toLowerCase().includes(kw))
      )
    }
    return items
  }, [available, search, method, category])

  // Load consumer location from localStorage
  useEffect(() => {
    const lat  = localStorage.getItem('yff_consumer_lat')
    const lng  = localStorage.getItem('yff_consumer_lng')
    const name = localStorage.getItem('yff_consumer_location_name')
    if (lat && lng) {
      setConsumerLat(Number(lat))
      setConsumerLng(Number(lng))
      setConsumerLocationName(name ?? '')
    } else if (!localStorage.getItem('yff_location_prompted')) {
      setShowLocationSheet(true)
    }
  }, [])

  const saveConsumerLocation = useCallback((lat: number, lng: number, name: string) => {
    setConsumerLat(lat)
    setConsumerLng(lng)
    setConsumerLocationName(name)
    localStorage.setItem('yff_consumer_lat', String(lat))
    localStorage.setItem('yff_consumer_lng', String(lng))
    localStorage.setItem('yff_consumer_location_name', name)
    localStorage.setItem('yff_location_prompted', '1')
    setShowLocationSheet(false)
  }, [])

  // Farmers present in the current harvest list → the "Filter by farmer" options.
  const farmerOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of available) {
      if (p.farmer_id && p.farmer?.name) m.set(p.farmer_id, p.farmer.name)
    }
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [available])

  // Filter (farmer + distance), expand each produce into one card PER harvest,
  // then sort (harvest date / rating / purchases).
  const displayItems = useMemo<DisplayCard[]>(() => {
    let items: WithDist[] = filtered.map((item) => {
      let distKm: number | null = null
      let distApprox = false
      if (consumerLat && consumerLng && item.farmer) {
        const coords = farmerCoords(item.farmer)
        if (coords) {
          distKm = haversineKm(consumerLat, consumerLng, coords.lat, coords.lng)
          distApprox = coords.approximate
        }
      }
      const latest = (harvestsByListing[item.id] ?? [])[0]
      return {
        ...item,
        distKm,
        distApprox,
        // Fallback clock (used only when this produce has NO logged harvest, so
        // it shows a single template card): the newest logged harvest, else the
        // harvest date/time set on the listing's Edit form.
        latest_harvested_at: latest?.harvested_at ?? item.harvest_date ?? item.latest_harvested_at ?? null,
        latest_shelf_life_days: latest?.shelf_life_days ?? item.latest_shelf_life_days ?? item.shelf_life_days ?? null,
      }
    })

    // Filter by farmer.
    if (farmerFilter !== 'all') items = items.filter((i) => i.farmer_id === farmerFilter)
    // Filter by distance (only meaningful once a location is set).
    if (consumerLat && consumerLng && distanceFilter) {
      items = items.filter((i) => i.distKm !== null && i.distKm <= distanceFilter)
    }

    const ts = (iso: string | null | undefined) => {
      const t = iso ? new Date(iso).getTime() : NaN
      return Number.isNaN(t) ? -Infinity : t
    }

    // Expand: a produce with logged harvests becomes one card per harvest (each
    // its own product — own date, shelf, stock); a produce with none falls back
    // to a single template card.
    const cards: DisplayCard[] = []
    for (const item of items) {
      const hs = harvestsByListing[item.id] ?? []
      if (hs.length) {
        for (const h of hs) cards.push({ item, harvest: h, key: h.id, sortAt: ts(h.harvested_at) })
      } else {
        cards.push({ item, key: item.id, sortAt: ts(item.latest_harvested_at) })
      }
    }

    cards.sort((a, b) => {
      if (sortBy === 'rating') {
        return (b.item.rating_avg ?? 0) - (a.item.rating_avg ?? 0) || (b.item.review_count ?? 0) - (a.item.review_count ?? 0)
      }
      if (sortBy === 'purchases') {
        return (b.item.purchase_count ?? 0) - (a.item.purchase_count ?? 0)
      }
      // 'fresh' — most recent harvest date/time first.
      return b.sortAt - a.sortAt
    })
    return cards
  }, [filtered, consumerLat, consumerLng, distanceFilter, harvestsByListing, farmerFilter, sortBy])

  return (
    <main className="min-h-screen bg-[#f8f8f8] pb-12">
      <RoleGateModal />
      <GlobalNav activeTab="consumer" />

      {/* ── Hero ─────────────────────────────── */}
      <div className="bg-green-900">
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-14">
          {/* Page title — its own full-width place in the hero, where it is
              always fully visible. (The top-bar logo keeps the "Go Grameen"
              brand; this marketing title lives here, not squeezed into the nav.) */}
          <h1 className="text-2xl sm:text-4xl font-extrabold text-white leading-snug">
            {L('Fresh from your local farmers', 'మీ స్థానిక రైతుల నుండి తాజా ఆహారం')}
          </h1>
          <p className="text-green-400 text-sm mt-1">
            {L('Straight from the farm. No Middlemen', 'నేరుగా పొలం నుండి. మధ్యవర్తులు లేరు')}
          </p>

          {/* My Orders quick link (only when logged in) + location on the right */}
          <div className="mt-5 flex items-center gap-2">
            <MyOrdersChip />
            <button
              onClick={() => setShowLocationSheet(true)}
              aria-label={L('Set location', 'లొకేషన్ పెట్టండి')}
              className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-green-100 bg-green-800 active:bg-green-700 rounded-full px-3 py-2 leading-tight max-w-[160px]"
            >
              <span aria-hidden>📍</span>
              <span className="truncate">{consumerLocationName || L('Set location', 'లొకేషన్ పెట్టండి')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Fresh Harvests table + Search card (float over hero) ────── */}
      <div className="max-w-3xl mx-auto px-4 -mt-7 space-y-3">
        {/* Fresh + upcoming harvests near you, above the search box. Sit side by
            side on larger screens, stacked on mobile. Each renders nothing when
            it has no matching harvests / the harvests table isn't present yet. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
          <FreshHarvestsTable />
          <UpcomingHarvestsTable />
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-4 space-y-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/>
            </svg>
            <input
              type="search"
              placeholder={L('Search harvests...', 'కోతలు వెతకండి...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-green-500 focus:outline-none"
            />
          </div>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base bg-white focus:border-green-500 focus:outline-none"
          >
            <option value="all">{L('🌿 All methods', 'అన్ని పద్ధతులు')}</option>
            <option value="natural">{L('🌱 Natural', 'సహజం')}</option>
            <option value="organic">{L('🍃 Organic', 'సేంద్రీయ')}</option>
            <option value="low_chemical">{L('⚡ Semi Organic', 'సెమీ ఆర్గానిక్')}</option>
            <option value="chemical">{L('🧪 Chemical', 'రసాయన')}</option>
          </select>

          {/* Sort + farmer filter for the harvest list. */}
          <div className="grid grid-cols-2 gap-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'fresh' | 'rating' | 'purchases')}
              className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl text-sm bg-white focus:border-green-500 focus:outline-none"
            >
              <option value="fresh">{L('⏱ Freshest first', 'తాజావి ముందు')}</option>
              <option value="rating">{L('⭐ Top rated', 'టాప్ రేటెడ్')}</option>
              <option value="purchases">{L('🔥 Most bought', 'ఎక్కువ కొన్నవి')}</option>
            </select>
            <select
              value={farmerFilter}
              onChange={(e) => setFarmerFilter(e.target.value)}
              className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl text-sm bg-white focus:border-green-500 focus:outline-none"
            >
              <option value="all">{L('🧑‍🌾 All farmers', 'రైతులందరూ')}</option>
              {farmerOptions.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Category chips ───────────────────── */}
      <div className="max-w-3xl mx-auto mt-4 px-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {CATEGORIES.map((chip) => (
            <button
              key={chip.key}
              onClick={() => setCategory(chip.key)}
              className={`flex-shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold border transition-all ${
                category === chip.key
                  ? 'bg-green-700 text-white border-green-700'
                  : 'bg-white text-gray-700 border-gray-200'
              }`}
            >
              {L(chip.en, chip.te)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Distance filter chips (only when location set) ── */}
      {consumerLat && consumerLng && (
        <div className="max-w-3xl mx-auto mt-3 px-4">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {([null, 5, 10, 25] as const).map((d) => (
              <button
                key={d ?? 'all'}
                onClick={() => setDistanceFilter(d)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                  distanceFilter === d
                    ? 'bg-green-700 text-white border-green-700'
                    : 'bg-white text-gray-700 border-gray-200'
                }`}
              >
                {d === null ? L('All', 'అన్నీ') : `< ${d} km`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Available now ────────────────────── */}
      <div className="max-w-3xl mx-auto px-3 mt-6">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">{L('Fresh Harvests', 'తాజా కోతలు')}</h2>
            <p className="text-green-700 font-semibold text-sm leading-tight">
              {L('Fresh from farms nearby', 'దగ్గర్లోని ఫామ్‌ల నుండి తాజాగా')}
            </p>
          </div>
          {!loading && (
            <span className="text-sm font-bold text-gray-400">
              {displayItems.length} {L('items', 'వస్తువులు')}
            </span>
          )}
        </div>

        {loading ? (
          <LoadingSkeleton />
        ) : displayItems.length === 0 ? (
          distanceFilter ? (
            <DistanceEmptyState km={distanceFilter} onClear={() => setDistanceFilter(null)} />
          ) : (
            <EmptyState />
          )
        ) : (
          <div className="grid grid-cols-2 gap-2 auto-rows-fr">
            {displayItems.map((card) => (
              <ProduceCard
                key={card.key}
                item={card.item}
                harvest={card.harvest}
                distanceKm={card.item.distKm}
                distanceApprox={card.item.distApprox}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Coming soon ──────────────────────── */}
      {!loading && comingSoon.length > 0 && (
        <div className="max-w-3xl mx-auto px-3 mt-10">
          <div className="mb-4">
            <h2 className="text-xl font-extrabold text-gray-900">{L('Coming soon', 'త్వరలో వస్తుంది')}</h2>
            <p className="text-amber-600 font-semibold text-sm">
              {L('Reserve early', 'ముందుగానే రిజర్వ్')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 auto-rows-fr">
            {comingSoon.map((item) => (
              <ComingSoonCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* ── Demand intent banner ─────────────── */}
      <DemandIntentBanner />

      {/* ── Floating cart button ─────────────── */}
      <CartFab />

      {/* ── Location bottom sheet ─────────────── */}
      {showLocationSheet && (
        <LocationBottomSheet
          onSet={saveConsumerLocation}
          onClose={() => {
            localStorage.setItem('yff_location_prompted', '1')
            setShowLocationSheet(false)
          }}
        />
      )}
    </main>
  )
}

/* ─── Produce card ──────────────────────────────────────── */
// `harvest` present → this tile is one specific harvest of the produce (its own
// pick date, shelf life and stock; tapping opens the harvest page and Add puts
// that harvest in the cart). Absent → the produce template, as a fallback for
// produce with no logged harvest. Everything else (photos, price, farmer,
// quality, reviews) is inherited from the produce_listing either way.
function ProduceCard({ item, harvest, distanceKm, distanceApprox }: { item: ProduceListing; harvest?: GridHarvest; distanceKm?: number | null; distanceApprox?: boolean }) {
  const emoji       = item.emoji ?? '🌿'
  const produceBg   = PRODUCE_BG[emoji] ?? DEFAULT_PRODUCE_BG
  const method      = item.method?.toLowerCase() ?? 'natural'
  const methodPill  = METHOD_PILL[method]  ?? 'bg-green-600 text-white'
  const methodShort = METHOD_SHORT[method] ?? 'Natural'
  const farmer      = item.farmer
  const farmerHref  = farmer ? `/farmer/${farmer.slug}` : '#'
  // Harvest card links to the harvest page and is keyed on the harvest; template
  // card links to the produce page and is keyed on the listing.
  const produceHref = harvest ? `/consumer/harvest/${harvest.id}` : `/consumer/produce/${item.id}`
  const cartKey     = harvest ? harvest.id : item.id
  const unit        = harvest?.unit || item.unit || 'kg'

  // Clock + freshness: from THIS harvest when it's a harvest card, else the
  // produce's fallback (latest logged / Edit-form harvest date).
  const clockAt    = harvest ? harvest.harvested_at : (item.latest_harvested_at ?? null)
  const clockShelf = harvest ? (harvest.shelf_life_days ?? item.shelf_life_days ?? null) : (item.latest_shelf_life_days ?? null)
  // Stock: the harvest carries its own; the template uses the listing's.
  const baseStock  = harvest ? (harvest.stock_qty ?? null) : (item.stock_qty ?? null)

  const { tx, lang, L } = useLang()
  const { cart, addItem, setQty } = useCart()
  const { requireAuth } = useConsumerAuth()
  const inCart = cart[cartKey]

  const canAdd = !!farmer && !!farmer.phone

  const [liveStock, setLiveStock] = useState<number | null>(baseStock)
  const [stockMsg, setStockMsg]   = useState('')
  const [adding, setAdding]       = useState(false)

  // All photos for this produce (cover first) — an Amazon/Flipkart-style swipe
  // gallery on the card. activeImg tracks which slide is centred, for the dots.
  const gallery = (item.image_urls && item.image_urls.length ? item.image_urls : (item.image_url ? [item.image_url] : []))
    .filter(Boolean) as string[]
  const [activeImg, setActiveImg] = useState(0)
  const galleryRef = useRef<HTMLDivElement>(null)
  const onGalleryScroll = () => {
    const el = galleryRef.current
    if (!el) return
    setActiveImg(Math.round(el.scrollLeft / el.clientWidth))
  }
  const [showReviews, setShowReviews] = useState(false)

  useEffect(() => { setLiveStock(baseStock) }, [baseStock])

  const isOutOfStock = liveStock !== null && liveStock <= 0
  const atMax        = liveStock !== null && inCart != null && inCart.qty >= liveStock

  const handleAdd = async () => {
    if (!farmer) return
    requireAuth(() => { void doAdd() })
  }

  const doAdd = async () => {
    if (!farmer) return
    setAdding(true)
    setStockMsg('')

    // Re-read the live stock from the right source: the harvest's own row for a
    // harvest card, else the produce listing.
    const { data } = harvest
      ? await supabase.from('harvests').select('stock_qty').eq('id', harvest.id).single()
      : await supabase.from('produce_listings').select('stock_qty').eq('id', item.id).single()

    const fresh = data?.stock_qty ?? null
    if (fresh !== null) setLiveStock(fresh)
    setAdding(false)

    if (fresh !== null) {
      if (fresh <= 0) {
        setStockMsg(L('Out of stock', 'అయిపోయింది'))
        return
      }
      const curQty = inCart?.qty ?? 0
      if (curQty >= fresh) {
        setStockMsg(`${L('Maximum available', 'గరిష్ట పరిమాణం')}: ${fresh} ${unit}`)
        return
      }
      if (curQty + 1 > fresh) {
        setStockMsg(L(`Stock updated, only ${fresh} ${unit} available`, `స్టాక్ మారింది, కేవలం ${fresh} ${unit} అందుబాటులో`))
        return
      }
    }

    addItem({
      listingId: item.id,
      // Harvest card → tie the cart line to this harvest (own date/shelf/stock),
      // so two harvests of the same produce are separate lines.
      ...(harvest
        ? {
            harvestId: harvest.id,
            harvestedAt: harvest.harvested_at,
            shelfLifeDays: harvest.shelf_life_days ?? item.shelf_life_days ?? undefined,
          }
        : {}),
      name: item.name,
      variety: item.variety,
      emoji: item.emoji,
      unit,
      stockQty: fresh != null ? fresh : (baseStock ?? undefined),
      pricePerKg: item.price_tier_1_price,
      priceTier1Qty: item.price_tier_1_qty,
      priceTier1Price: item.price_tier_1_price,
      priceTier2Qty: item.price_tier_2_qty,
      priceTier2Price: item.price_tier_2_price,
      priceTier3Price: item.price_tier_3_price,
      farmerId: farmer.id,
      farmerName: farmer.name,
      farmerPhone: farmer.phone,
      farmerVillage: farmer.village,
      farmerSlug: farmer.slug,
      farmerPickupLocations: farmer.pickup_locations ?? [],
      farmerPickupSlots: normalizePickupSchedule(farmer.pickup_slots, farmer.pickup_locations ?? []),
    }, 1)
  }

  const handleInc = () => {
    if (liveStock !== null && inCart.qty >= liveStock) {
      setStockMsg(`${L('Maximum available', 'గరిష్ట పరిమాణం')}: ${liveStock} ${unit}`)
      return
    }
    setStockMsg('')
    setQty(cartKey, inCart.qty + 1)
  }

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.08)] flex flex-col h-full">
      {/* Image — fixed 160px. Multiple photos become a swipe gallery (swipe
          right-to-left for the rest); method pill top-right, dots bottom-centre. */}
      <div className="relative h-40 w-full flex-shrink-0">
        {gallery.length ? (
          <div
            ref={galleryRef}
            onScroll={onGalleryScroll}
            className="flex h-full w-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
          >
            {gallery.map((url) => (
              <Link
                key={url}
                href={produceHref}
                className="snap-center shrink-0 w-full h-40 block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
              </Link>
            ))}
          </div>
        ) : (
          <Link
            href={produceHref}
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: produceBg }}
          >
            <span className="text-5xl">{emoji}</span>
          </Link>
        )}
        <span
          className={`absolute top-2 right-2 ${methodPill} text-[10px] font-bold rounded-full px-1.5 py-0.5 shadow-sm`}
        >
          {methodShort}
        </span>
        <div className="absolute top-2 left-2">
          <ShareButton
            info={{
              id: item.id,
              name: item.name,
              variety: item.variety,
              emoji: item.emoji,
              method: item.method,
              pricePerUnit: item.price_tier_1_price,
              unit,
              farmerName: farmer?.name,
              farmerVillage: farmer?.village,
            }}
          />
        </div>
        {gallery.length > 1 && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
            {gallery.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === activeImg ? 'w-4 bg-white' : 'w-1.5 bg-white/60'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1 min-w-0">
        {/* Name + variety — single line each, ellipsis on overflow */}
        <Link href={produceHref} className="block min-w-0">
          <h3 className="font-bold text-[15px] leading-[1.2] text-gray-900 truncate">
            {localizeName(item.name, lang)}
          </h3>
          {item.variety && (
            <p className="text-[12px] text-[#666] truncate mt-0.5">{localizeName(item.variety, lang)}</p>
          )}
        </Link>

        {/* Harvest clock — "Harvested 2 hours ago", from THIS harvest (or the
            produce's latest as a fallback). Only shows once a harvest date exists. */}
        {clockAt && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 rounded-full px-2 py-0.5">
              ⏱ {harvestClock(clockAt, L)}
            </span>
            {(() => {
              const fresh = freshnessLabel(clockAt, clockShelf, L)
              return fresh ? <span className="text-[11px] font-semibold text-amber-700">{fresh}</span> : null
            })()}
          </div>
        )}

        {/* Farmer + location, with a small tappable "View profile" link */}
        {farmer && (
          <div className="flex items-center justify-between gap-1.5 mt-1">
            <p className="text-[11px] text-[#666] truncate min-w-0">
              👨‍🌾 {farmer.name} · {farmer.village}
            </p>
            <Link
              href={farmerHref}
              className="flex-shrink-0 text-[11px] font-semibold text-[#1a5c2a] whitespace-nowrap active:opacity-70"
            >
              {tx.viewProfile} ›
            </Link>
          </div>
        )}

        {/* Distance (only when location set) */}
        {distanceKm != null && (
          <p className="text-[11px] font-semibold text-blue-700 truncate mt-0.5">
            📍 {distanceApprox ? '~' : ''}{formatDistance(distanceKm)} away
          </p>
        )}

        {/* Buyer rating — tap to read reviews. Only when at least one exists. */}
        {(item.review_count ?? 0) > 0 && item.rating_avg != null && (
          <button
            type="button"
            onClick={() => setShowReviews(true)}
            className="flex items-center gap-1 mt-1 active:opacity-70"
          >
            <span className="inline-flex items-center gap-0.5 bg-green-700 text-white text-[11px] font-bold rounded px-1.5 py-0.5">
              {item.rating_avg.toFixed(1)} ★
            </span>
            <span className="text-[11px] text-[#666] underline">
              {item.review_count} {item.review_count === 1 ? L('review', 'సమీక్ష') : L('reviews', 'సమీక్షలు')}
            </span>
          </button>
        )}

        {/* Price */}
        <div className="mt-1.5">
          <span className="font-extrabold text-[18px] text-[#1a5c2a]">
            {item.price_tier_1_price ? `₹${item.price_tier_1_price}` : '—'}
            <span className="text-[12px] font-medium text-[#666]">/{unit}</span>
          </span>
        </div>

        {/* Stock badge */}
        {liveStock != null && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {liveStock != null && (
              <span
                className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                  liveStock === 0 ? 'bg-red-50 text-red-600' : 'bg-[#f5f5f5] text-[#666]'
                }`}
              >
                {liveStock === 0 ? 'Out of stock' : `${liveStock} ${unit} left`}
              </span>
            )}
          </div>
        )}

        {/* Stock warning */}
        {stockMsg && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 leading-snug text-center mt-1.5">
            {stockMsg}
          </p>
        )}

        {/* CTA — pinned to bottom of card, fixed 40px height */}
        <div className="mt-auto pt-2.5">
          {!canAdd ? (
            <Link
              href={farmerHref}
              className="flex items-center justify-center w-full h-10 bg-[#1a5c2a] text-white font-bold rounded-xl text-sm"
            >
              {L('View', 'చూడండి')}
            </Link>
          ) : isOutOfStock ? (
            <button
              disabled
              className="w-full h-10 bg-gray-200 text-gray-500 font-bold rounded-xl text-sm cursor-not-allowed"
            >
              {L('Out of stock', 'అయిపోయింది')}
            </button>
          ) : !inCart ? (
            <button
              onClick={handleAdd}
              disabled={adding}
              className="w-full h-10 bg-[#1a5c2a] active:opacity-90 text-white font-bold rounded-xl text-sm disabled:opacity-60 whitespace-nowrap"
            >
              {adding ? L('Checking...', 'తనిఖీ') : L('+ Add', 'చేర్చు')}
            </button>
          ) : (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl h-10 px-2">
              <button
                onClick={() => { setQty(cartKey, inCart.qty - 1); setStockMsg('') }}
                className="w-7 h-7 rounded-lg bg-white border border-green-300 text-green-800 text-lg font-bold leading-none"
                aria-label="Decrease"
              >
                −
              </button>
              <span className="font-extrabold text-green-900 text-sm">
                {inCart.qty} {unit}
              </span>
              <button
                onClick={handleInc}
                disabled={atMax}
                className={`w-7 h-7 rounded-lg text-lg font-bold leading-none transition-colors ${
                  atMax
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-green-700 text-white'
                }`}
                aria-label="Increase"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>

      {showReviews && (
        <ProduceReviewsModal
          listingId={item.id}
          produceName={localizeName(item.name, lang)}
          onClose={() => setShowReviews(false)}
        />
      )}
    </div>
  )
}

/* ─── Coming soon card ──────────────────────────────────── */
function ComingSoonCard({ item }: { item: ProduceListing }) {
  const { lang, L }  = useLang()
  const emoji     = item.emoji ?? '🌱'
  const produceBg = PRODUCE_BG[emoji] ?? DEFAULT_PRODUCE_BG
  const farmer    = item.farmer
  const farmerHref = farmer ? `/farmer/${farmer.slug}` : '#'

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-dashed border-amber-200 flex flex-col h-full">
      <Link href={farmerHref} className="relative block h-40 w-full flex-shrink-0">
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ backgroundColor: produceBg }}
        >
          <span className="text-5xl">{emoji}</span>
        </div>
        <span className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 shadow-sm">
          Soon
        </span>
      </Link>

      <div className="p-3 flex flex-col flex-1 min-w-0">
        <h3 className="font-bold text-[15px] leading-[1.2] text-gray-700 truncate">{localizeName(item.name, lang)}</h3>
        {item.variety && (
          <p className="text-[12px] text-[#666] truncate mt-0.5">{localizeName(item.variety, lang)}</p>
        )}
        {farmer && (
          <p className="text-[11px] text-[#666] truncate mt-1">👨‍🌾 {farmer.name} · {farmer.village}</p>
        )}
        {item.available_to && (
          <p className="text-[11px] text-amber-600 font-semibold truncate mt-1">
            {L('Ready', 'సిద్ధం')}: {new Date(item.available_to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </p>
        )}
        {farmer && (
          <div className="mt-auto pt-2.5">
            <Link
              href={farmerHref}
              className="flex items-center justify-center w-full h-10 border-2 border-[#1a5c2a] text-[#1a5c2a] font-bold rounded-xl text-sm"
            >
              {L('View', 'చూడండి')}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Loading skeleton ──────────────────────────────────── */
function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 auto-rows-fr">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.08)] animate-pulse">
          <div className="h-40 bg-gray-100" />
          <div className="p-3 space-y-2">
            <div className="h-4 bg-gray-100 rounded w-3/4" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
            <div className="h-3 bg-gray-100 rounded w-2/3" />
            <div className="h-10 bg-gray-100 rounded-xl mt-3" />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Distance empty state ──────────────────────────────── */
function DistanceEmptyState({ km, onClear }: { km: number; onClear: () => void }) {
  const { L } = useLang()
  return (
    <div className="text-center py-14">
      <div className="text-6xl mb-4">📍</div>
      <p className="text-gray-800 font-bold text-lg">{L(`No farmers within ${km} km`, `${km} కి.మీ లోపల రైతులు లేరు`)}</p>
      <p className="text-gray-400 text-xs mt-2 leading-snug px-8">
        {L('Farmers nearby may not have set their location yet.', 'దగ్గరలోని రైతులు ఇంకా లొకేషన్ పెట్టలేదు.')}
      </p>
      <button
        onClick={onClear}
        className="mt-5 bg-green-700 text-white font-bold px-6 py-3 rounded-xl text-sm"
      >
        {L('Show all harvests', 'అన్ని కోతలు చూపించు')}
      </button>
    </div>
  )
}

/* ─── Empty state ───────────────────────────────────────── */
function EmptyState() {
  const { L } = useLang()
  return (
    <div className="text-center py-14">
      <div className="text-6xl mb-4">🔍</div>
      <p className="text-gray-800 font-bold text-lg">{L('No harvests found', 'కోతలు కనుగొనబడలేదు')}</p>
      <p className="text-gray-400 text-sm mt-2">
        {L('Try a different search or category', 'వేరే వెతకండి లేదా వేరే వర్గాన్ని ఎంచుకోండి')}
      </p>
    </div>
  )
}

/* ─── Location bottom sheet ─────────────────────────────────── */
function LocationBottomSheet({
  onSet,
  onClose,
}: {
  onSet: (lat: number, lng: number, name: string) => void
  onClose: () => void
}) {
  const { L } = useLang()
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [gpsError, setGpsError]   = useState('')

  const handleGPS = () => {
    if (!navigator.geolocation) {
      setGpsError(L('GPS not supported on this device', 'GPS అందుబాటులో లేదు'))
      return
    }
    setGpsStatus('loading')
    setGpsError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const name = nearestTown(latitude, longitude)
        onSet(latitude, longitude, name)
      },
      (err) => {
        setGpsStatus('error')
        setGpsError(
          err.code === 1
            ? L('Location access denied. Search your town below.', 'లొకేషన్ అనుమతి లేదు. పట్టణం వెతకండి.')
            : L('Could not get GPS. Search your town below.', 'GPS రాలేదు. పట్టణం వెతకండి.')
        )
      },
      { timeout: 12000, enableHighAccuracy: true },
    )
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end justify-center">
      <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-extrabold text-gray-900 text-lg leading-tight">
              {L('Where are you?', 'మీరు ఎక్కడ ఉన్నారు?')}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {L('See harvests from farmers near you', 'దగ్గరలోని రైతుల కోతలు చూడండి')}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-3xl leading-none p-1">×</button>
        </div>

        {/* GPS button */}
        <button
          onClick={handleGPS}
          disabled={gpsStatus === 'loading'}
          className="w-full flex items-center justify-center gap-2 bg-green-700 text-white font-bold py-4 rounded-xl text-base active:bg-green-800 disabled:opacity-60"
        >
          {gpsStatus === 'loading' ? (
            <>
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              {L('Detecting...', 'వెతుకుతోంది')}
            </>
          ) : (
            <>{L('📍 Use my current location', 'నా లొకేషన్ వాడండి')}</>
          )}
        </button>

        {gpsError && (
          <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 leading-snug">{gpsError}</p>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200" />
          <span className="text-xs text-gray-400 font-semibold">{L('OR', 'లేదా')}</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* Search input */}
        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-2">
            {L('Search your location', 'లొకేషన్ వెతకండి')}
          </label>
          <p className="text-[11px] text-gray-500 mb-2">
            {L('Type any city, town or village in AP / Telangana', 'ఆంధ్రప్రదేశ్ / తెలంగాణలో ఏ పట్టణమైనా టైప్ చేయండి')}
          </p>
          <LocationSearch
            placeholder="e.g. Visakhapatnam, Hyderabad, Eluru..."
            onSelect={(lat, lng, name) => onSet(lat, lng, name)}
          />
        </div>

        <button
          onClick={onClose}
          className="w-full text-sm text-gray-500 py-2"
        >
          {L('Skip for now', 'తర్వాత చేస్తాను')}
        </button>
      </div>
    </div>
  )
}

/* ─── Demand intent banner ──────────────────────────────────── */
function DemandIntentBanner() {
  const { L } = useLang()
  const { consumer, openAuth } = useConsumerAuth()
  const [open, setOpen] = useState(false)
  const [crop, setCrop] = useState('')
  const [qty, setQty] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  // Pre-fill name/phone from the logged-in consumer once known, so their raised
  // intent is tied to (and appears under) their account on the My Intents page.
  useEffect(() => {
    if (consumer) {
      setName((n) => n || consumer.name || '')
      setPhone((p) => p || consumer.phone || '')
    }
  }, [consumer])

  const handleSubmit = async () => {
    // Raising an intent requires a logged-in consumer so it's tied to their
    // account (and appears on My Intents). Prompt login instead of inserting.
    if (!consumer) {
      openAuth()
      return
    }
    if (!crop.trim() || !name.trim() || !phone.trim()) {
      setError(L('Please fill crop name, your name, and phone number.', 'పంట పేరు, మీ పేరు, ఫోన్ నంబర్ నింపండి.'))
      return
    }
    // The min= on the input only guards the picker; a typed date can still be past.
    if (isPastDate(date)) {
      setError(L('Needed-by date cannot be in the past.', 'కావలసిన తేదీ గతంలో ఉండకూడదు.'))
      return
    }
    setLoading(true)
    setError('')
    const { supabase: sb } = await import('@/lib/supabase')
    const { error: err } = await sb.from('demand_intents').insert({
      crop_name: crop.trim(),
      quantity_kg: qty ? Number(qty) : null,
      needed_by_date: date || null,
      delivery_location: location.trim() || null,
      requester_name: name.trim(),
      requester_phone: phone.trim(),
      consumer_id: consumer?.id ?? null,
      region_slug: intentRegionSlug(),
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSubmitted(true)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 mt-10 mb-4">
      <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">📣</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-amber-900 text-base leading-tight">
              {L('Raise a Demand Intent', 'డిమాండ్ నమోదు')}
            </h3>
            <p className="text-amber-700 text-sm mt-1 leading-snug">
              {L("Let local farmers know what you need — they'll reach out when available.", 'స్థానిక రైతులకు మీకు ఏమి కావాలో తెలియజేయండి')}
            </p>
          </div>
        </div>

        {!open && !submitted && (
          <div className="mt-4 space-y-2">
            <button
              onClick={() => setOpen(true)}
              className="w-full bg-amber-600 text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2"
            >
              <span className="text-lg leading-none">+</span>
              {L('Raise Intent', 'డిమాండ్ నమోదు')}
            </button>
            {consumer && (
              <Link
                href="/consumer/intents"
                className="w-full block text-center text-amber-800 font-semibold text-sm py-2.5 rounded-xl border-2 border-amber-300 active:bg-amber-100"
              >
                📋 {L('My raised intents', 'నా డిమాండ్‌లు')}
              </Link>
            )}
          </div>
        )}

        {submitted && (
          <div className="mt-4 text-center py-3">
            <p className="text-green-700 font-bold text-base">{L('✓ Intent raised!', 'నమోదైంది!')}</p>
            <p className="text-green-600 text-sm mt-1">
              {L('Farmers in your area will be notified.', 'మీ ప్రాంతంలోని రైతులకు తెలియజేస్తాము.')}
            </p>
            <Link href="/consumer/intents" className="inline-block mt-2 text-amber-800 font-semibold text-sm underline">
              {L('View my intents →', 'నా డిమాండ్‌లు చూడండి →')}
            </Link>
          </div>
        )}

        {open && !submitted && (
          <div className="mt-4 space-y-3">
            <input
              type="text"
              placeholder={L('Crop name * (e.g. Tomato', 'టమాటా)')}
              value={crop}
              onChange={(e) => setCrop(e.target.value)}
              className="w-full border border-amber-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-amber-500 focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-amber-800 mb-1 ml-1">
                  {L('Quantity (kg)', 'పరిమాణం')}
                </label>
                <input
                  type="number"
                  placeholder={L('e.g. 5', 'ఉదా. 5')}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="w-full min-w-0 border border-amber-200 rounded-xl px-3 py-3 text-sm text-gray-800 bg-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-amber-800 mb-1 ml-1">
                  {L('Needed by', 'కావలసిన తేదీ')}
                </label>
                <input
                  type="date"
                  value={date}
                  min={todayInIndia()}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full min-w-0 border border-amber-200 rounded-xl px-3 py-3 text-sm text-gray-800 bg-white focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
            <input
              type="text"
              placeholder={L('Delivery location', 'డెలివరీ స్థలం')}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full border border-amber-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-amber-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder={L('Your name *', 'మీ పేరు')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-amber-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-amber-500 focus:outline-none"
            />
            <input
              type="tel"
              placeholder={L('Your WhatsApp number *', 'మీ వాట్సాప్ నంబర్')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-amber-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-amber-500 focus:outline-none"
            />

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setOpen(false); setError('') }}
                className="flex-1 border-2 border-gray-300 text-gray-600 font-semibold py-3 rounded-xl text-sm"
              >
                {L('Cancel', 'రద్దు')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-amber-600 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50"
              >
                {loading ? L('Submitting...', 'నమోదు అవుతోంది') : L('Submit', 'నమోదు')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


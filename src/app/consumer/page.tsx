'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import GlobalNav from '@/components/consumer/GlobalNav'
import { CartFab, useCart } from '@/components/consumer/Cart'
import MyOrdersChip from '@/components/consumer/MyOrdersChip'
import RoleGateModal from '@/components/consumer/RoleGateModal'
import { supabase } from '@/lib/supabase'
import { FreshnessBadge } from '@/components/FreshnessBadge'
import { haversineKm, nearestTown, formatDistance, farmerCoords } from '@/lib/location'
import LocationSearch from '@/components/LocationSearch'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { useLang } from '@/lib/LanguageContext'

type Farmer = {
  id: string
  name: string
  village: string
  slug: string
  phone: string
  method: string
  pickup_locations?: string[] | null
  lat?: number | null
  lng?: number | null
}

type ProduceListing = {
  id: string
  name: string
  variety?: string
  emoji?: string
  image_url?: string
  method?: string
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
  harvest_date?: string | null
  farmer_id: string
  farmer?: Farmer
}

const CATEGORIES = [
  { key: 'all',        en: 'All',             te: 'అన్నీ' },
  { key: 'vegetables', en: 'Vegetables',      te: 'కూరగాయలు' },
  { key: 'fruits',     en: 'Fruits',          te: 'పళ్ళు' },
  { key: 'grains',     en: 'Grains & Pulses', te: 'ధాన్యాలు' },
  { key: 'leafy',      en: 'Leafy Greens',    te: 'ఆకు కూరలు' },
]

// Short, single-word method label for the small pill on the image corner.
const METHOD_SHORT: Record<string, string> = {
  natural:      'Natural',
  organic:      'Organic',
  low_chemical: 'Low-chem',
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
  const [available, setAvailable]     = useState<ProduceListing[]>([])
  const [comingSoon, setComingSoon]   = useState<ProduceListing[]>([])
  const [filtered, setFiltered]       = useState<ProduceListing[]>([])
  const [search, setSearch]           = useState('')
  const [method, setMethod]           = useState('all')
  const [category, setCategory]       = useState('all')
  const [loading, setLoading]         = useState(true)
  const [farmerCount, setFarmerCount] = useState(0)
  const searchAbortRef = useRef<AbortController | null>(null)

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
      setFiltered(avArr)
      setComingSoon(csArr)
      setFarmerCount(new Set(avArr.map((p) => p.farmer_id)).size)
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

  const doSearch = useCallback(async () => {
    if (!search && method === 'all' && category === 'all') {
      setFiltered(available)
      return
    }
    searchAbortRef.current?.abort()
    searchAbortRef.current = new AbortController()
    try {
      const p = new URLSearchParams()
      if (search)              p.set('q', search)
      if (method !== 'all')    p.set('method', method)
      if (category !== 'all')  p.set('category', category)
      const res = await fetch(`/api/produce/search?${p}`, { cache: 'no-store', signal: searchAbortRef.current.signal })
      const data = await res.json().catch(() => [])
      setFiltered(Array.isArray(data) ? data : [])
    } catch (e) {
      if ((e as Error).name !== 'AbortError') { /* silent */ }
    }
  }, [search, method, category, available])

  useEffect(() => {
    const t = setTimeout(doSearch, 300)
    return () => clearTimeout(t)
  }, [doSearch])

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

  // Sort + distance-filter produce
  const displayItems = useMemo(() => {
    type WithDist = ProduceListing & { distKm: number | null; distApprox: boolean }
    const withDist: WithDist[] = filtered.map((item) => {
      let distKm: number | null = null
      let distApprox = false
      if (consumerLat && consumerLng && item.farmer) {
        const coords = farmerCoords(item.farmer)
        if (coords) {
          distKm = haversineKm(consumerLat, consumerLng, coords.lat, coords.lng)
          distApprox = coords.approximate
        }
      }
      return { ...item, distKm, distApprox }
    })
    if (!consumerLat || !consumerLng) return withDist
    let result = withDist
    if (distanceFilter) {
      result = result.filter((i) => i.distKm !== null && i.distKm <= distanceFilter)
    }
    return result.sort((a, b) => {
      if (a.distKm === null && b.distKm === null) return 0
      if (a.distKm === null) return 1
      if (b.distKm === null) return -1
      return a.distKm - b.distKm
    })
  }, [filtered, consumerLat, consumerLng, distanceFilter])

  return (
    <main className="min-h-screen bg-[#f8f8f8] pb-12">
      <RoleGateModal />
      <GlobalNav activeTab="consumer" />

      {/* ── Hero ─────────────────────────────── */}
      <div className="bg-green-900">
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-14">
          <h1 className="text-2xl sm:text-4xl font-extrabold text-white leading-snug">
            Fresh from your<br />local farmer
          </h1>
          <p className="text-green-300 text-base sm:text-lg mt-1 font-medium">
            మీ స్థానిక రైతు నుండి తాజా ఆహారం
          </p>
          <p className="text-green-400 text-sm mt-1">
            Straight from farm · No middlemen / నేరుగా పొలం నుండి · మధ్యవర్తులు లేరు
          </p>

          {/* Stats */}
          <div className="flex gap-8 mt-6">
            {[
              { val: farmerCount,       en: 'Farmers',    te: 'రైతులు' },
              { val: available.length,  en: 'Products',   te: 'పంటలు' },
              { val: 0,                 en: 'Middlemen',  te: 'మధ్యవర్తులు' },
            ].map((s) => (
              <div key={s.en}>
                <div className="text-4xl font-black text-white">{s.val}</div>
                <div className="text-xs text-green-300 mt-0.5 leading-snug">
                  {s.en}<br />{s.te}
                </div>
              </div>
            ))}
          </div>

          {/* My Orders quick link (only when logged in) */}
          <div className="mt-5">
            <MyOrdersChip />
          </div>

          {/* Location pill */}
          <div className="flex flex-wrap items-center gap-2 mt-5">
            <button
              onClick={() => setShowLocationSheet(true)}
              className="inline-flex items-center gap-1.5 bg-green-800 border border-green-700 text-green-200 text-sm font-semibold px-4 py-2.5 rounded-full active:bg-green-700"
            >
              📍 {consumerLocationName || 'Set location / లొకేషన్ పెట్టండి'}
              <span className="text-green-400 text-xs ml-0.5">✎</span>
            </button>
            <Link
              href="/consumer/orders"
              className="inline-flex items-center gap-2 bg-green-800 border border-green-700 text-green-200 text-xs font-semibold px-4 py-2.5 rounded-full"
            >
              📦 My Orders / నా ఆర్డర్లు →
            </Link>
            <Link
              href="/consumer/complaints"
              className="inline-flex items-center gap-2 bg-amber-400 text-green-950 text-sm font-bold px-4 py-2.5 rounded-full shadow-md active:bg-amber-500"
            >
              🛟 Log a Complaint / ఫిర్యాదు →
            </Link>
          </div>
        </div>
      </div>

      {/* ── Search card (floats over hero) ────── */}
      <div className="max-w-3xl mx-auto px-4 -mt-7">
        <div className="bg-white rounded-2xl shadow-xl p-4 space-y-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/>
            </svg>
            <input
              type="search"
              placeholder="Search produce... / పంట వెతకండి..."
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
            <option value="all">🌿 All methods / అన్ని పద్ధతులు</option>
            <option value="natural">🌱 Natural / సహజం</option>
            <option value="organic">🍃 Organic / సేంద్రీయ</option>
            <option value="low_chemical">⚡ Low chemical / తక్కువ రసాయన</option>
          </select>
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
              {chip.en} / {chip.te}
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
                {d === null ? 'All / అన్నీ' : `< ${d} km`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Available now ────────────────────── */}
      <div className="max-w-3xl mx-auto px-3 mt-6">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">Available now / ఇప్పుడు అందుబాటులో</h2>
            <p className="text-green-700 font-semibold text-sm leading-tight">
              Fresh produce from farms nearby / తాజా పంట
            </p>
          </div>
          {!loading && (
            <span className="text-sm font-bold text-gray-400">
              {displayItems.length} items / వస్తువులు
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
            {displayItems.map((item) => (
              <ProduceCard
                key={item.id}
                item={item}
                distanceKm={'distKm' in item ? (item as ProduceListing & { distKm: number | null }).distKm : null}
                distanceApprox={'distApprox' in item ? (item as ProduceListing & { distApprox: boolean }).distApprox : false}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Coming soon ──────────────────────── */}
      {!loading && comingSoon.length > 0 && (
        <div className="max-w-3xl mx-auto px-3 mt-10">
          <div className="mb-4">
            <h2 className="text-xl font-extrabold text-gray-900">Coming soon / త్వరలో వస్తుంది</h2>
            <p className="text-amber-600 font-semibold text-sm">
              Reserve early / ముందుగానే రిజర్వ్
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
function ProduceCard({ item, distanceKm, distanceApprox }: { item: ProduceListing; distanceKm?: number | null; distanceApprox?: boolean }) {
  const emoji       = item.emoji ?? '🌿'
  const produceBg   = PRODUCE_BG[emoji] ?? DEFAULT_PRODUCE_BG
  const method      = item.method?.toLowerCase() ?? 'natural'
  const methodPill  = METHOD_PILL[method]  ?? 'bg-green-600 text-white'
  const methodShort = METHOD_SHORT[method] ?? 'Natural'
  const farmer      = item.farmer
  const farmerHref  = farmer ? `/farmer/${farmer.slug}` : '#'
  const unit        = item.unit || 'kg'

  const { tx } = useLang()
  const { cart, addItem, setQty } = useCart()
  const { requireAuth } = useConsumerAuth()
  const inCart = cart[item.id]

  const canAdd = !!farmer && !!farmer.phone

  const [liveStock, setLiveStock] = useState<number | null>(item.stock_qty ?? null)
  const [stockMsg, setStockMsg]   = useState('')
  const [adding, setAdding]       = useState(false)

  useEffect(() => { setLiveStock(item.stock_qty ?? null) }, [item.stock_qty])

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

    const { data } = await supabase
      .from('produce_listings')
      .select('stock_qty')
      .eq('id', item.id)
      .single()

    const fresh = data?.stock_qty ?? null
    if (fresh !== null) setLiveStock(fresh)
    setAdding(false)

    if (fresh !== null) {
      if (fresh <= 0) {
        setStockMsg('Out of stock / అయిపోయింది')
        return
      }
      const curQty = inCart?.qty ?? 0
      if (curQty >= fresh) {
        setStockMsg(`Maximum available / గరిష్ట పరిమాణం: ${fresh} ${unit}`)
        return
      }
      if (curQty + 1 > fresh) {
        setStockMsg(`Stock updated / స్టాక్ మారింది, only ${fresh} ${unit} available`)
        return
      }
    }

    addItem({
      listingId: item.id,
      name: item.name,
      variety: item.variety,
      emoji: item.emoji,
      unit,
      stockQty: fresh != null ? fresh : (item.stock_qty ?? undefined),
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
    }, 1)
  }

  const handleInc = () => {
    if (liveStock !== null && inCart.qty >= liveStock) {
      setStockMsg(`Maximum available / గరిష్ట పరిమాణం: ${liveStock} ${unit}`)
      return
    }
    setStockMsg('')
    setQty(item.id, inCart.qty + 1)
  }

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.08)] flex flex-col h-full">
      {/* Image (or emoji fallback) — fixed 160px, method pill top-right */}
      <Link href={farmerHref} className="relative block h-40 w-full flex-shrink-0">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.name}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: produceBg }}
          >
            <span className="text-5xl">{emoji}</span>
          </div>
        )}
        <span
          className={`absolute top-2 right-2 ${methodPill} text-[10px] font-bold rounded-full px-1.5 py-0.5 shadow-sm`}
        >
          {methodShort}
        </span>
      </Link>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1 min-w-0">
        {/* Name + variety — single line each, ellipsis on overflow */}
        <Link href={farmerHref} className="block min-w-0">
          <h3 className="font-bold text-[15px] leading-[1.2] text-gray-900 truncate">
            {item.name}
          </h3>
          {item.variety && (
            <p className="text-[12px] text-[#666] truncate mt-0.5">{item.variety}</p>
          )}
        </Link>

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

        {/* Price */}
        <div className="mt-1.5">
          <span className="font-extrabold text-[18px] text-[#1a5c2a]">
            {item.price_tier_1_price ? `₹${item.price_tier_1_price}` : '—'}
            <span className="text-[12px] font-medium text-[#666]">/{unit}</span>
          </span>
        </div>

        {/* Harvest + stock badges */}
        {(item.harvest_date || liveStock != null) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {item.harvest_date && <FreshnessBadge harvestDate={item.harvest_date} dot />}
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
              View / చూడండి
            </Link>
          ) : isOutOfStock ? (
            <button
              disabled
              className="w-full h-10 bg-gray-200 text-gray-500 font-bold rounded-xl text-sm cursor-not-allowed"
            >
              Out of stock / అయిపోయింది
            </button>
          ) : !inCart ? (
            <button
              onClick={handleAdd}
              disabled={adding}
              className="w-full h-10 bg-[#1a5c2a] active:opacity-90 text-white font-bold rounded-xl text-sm disabled:opacity-60 whitespace-nowrap"
            >
              {adding ? 'Checking... / తనిఖీ' : '+ Add / చేర్చు'}
            </button>
          ) : (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl h-10 px-2">
              <button
                onClick={() => { setQty(item.id, inCart.qty - 1); setStockMsg('') }}
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
    </div>
  )
}

/* ─── Coming soon card ──────────────────────────────────── */
function ComingSoonCard({ item }: { item: ProduceListing }) {
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
        <h3 className="font-bold text-[15px] leading-[1.2] text-gray-700 truncate">{item.name}</h3>
        {item.variety && (
          <p className="text-[12px] text-[#666] truncate mt-0.5">{item.variety}</p>
        )}
        {farmer && (
          <p className="text-[11px] text-[#666] truncate mt-1">👨‍🌾 {farmer.name} · {farmer.village}</p>
        )}
        {item.available_to && (
          <p className="text-[11px] text-amber-600 font-semibold truncate mt-1">
            Ready / సిద్ధం: {new Date(item.available_to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </p>
        )}
        {farmer && (
          <div className="mt-auto pt-2.5">
            <Link
              href={farmerHref}
              className="flex items-center justify-center w-full h-10 border-2 border-[#1a5c2a] text-[#1a5c2a] font-bold rounded-xl text-sm"
            >
              View / చూడండి
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
  return (
    <div className="text-center py-14">
      <div className="text-6xl mb-4">📍</div>
      <p className="text-gray-800 font-bold text-lg">No farmers within {km} km</p>
      <p className="text-gray-500 text-sm mt-1">
        {km} కి.మీ లోపల రైతులు లేరు
      </p>
      <p className="text-gray-400 text-xs mt-2 leading-snug px-8">
        Farmers nearby may not have set their location yet.<br />
        దగ్గరలోని రైతులు ఇంకా లొకేషన్ పెట్టలేదు.
      </p>
      <button
        onClick={onClear}
        className="mt-5 bg-green-700 text-white font-bold px-6 py-3 rounded-xl text-sm"
      >
        Show all produce / అన్ని పంటలు చూపించు
      </button>
    </div>
  )
}

/* ─── Empty state ───────────────────────────────────────── */
function EmptyState() {
  return (
    <div className="text-center py-14">
      <div className="text-6xl mb-4">🔍</div>
      <p className="text-gray-800 font-bold text-lg">No produce found / పంట కనుగొనబడలేదు</p>
      <p className="text-gray-400 text-sm mt-2">
        Try a different search or category<br />
        వేరే వెతకండి లేదా వేరే వర్గాన్ని ఎంచుకోండి
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
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [gpsError, setGpsError]   = useState('')

  const handleGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('GPS not supported on this device / GPS అందుబాటులో లేదు')
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
            ? 'Location access denied. Search your town below. / లొకేషన్ అనుమతి లేదు. పట్టణం వెతకండి.'
            : 'Could not get GPS. Search your town below. / GPS రాలేదు. పట్టణం వెతకండి.'
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
              Where are you? / మీరు ఎక్కడ ఉన్నారు?
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              See produce from farmers near you / దగ్గరలోని రైతుల పంట చూడండి
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
              Detecting... / వెతుకుతోంది
            </>
          ) : (
            <>📍 Use my current location / నా లొకేషన్ వాడండి</>
          )}
        </button>

        {gpsError && (
          <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 leading-snug">{gpsError}</p>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200" />
          <span className="text-xs text-gray-400 font-semibold">OR / లేదా</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* Search input */}
        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-2">
            Search your location / లొకేషన్ వెతకండి
          </label>
          <p className="text-[11px] text-gray-500 mb-2">
            Type any city, town or village in AP / Telangana<br />
            ఆంధ్రప్రదేశ్ / తెలంగాణలో ఏ పట్టణమైనా టైప్ చేయండి
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
          Skip for now / తర్వాత చేస్తాను
        </button>
      </div>
    </div>
  )
}

/* ─── Demand intent banner ──────────────────────────────────── */
function DemandIntentBanner() {
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

  const handleSubmit = async () => {
    if (!crop.trim() || !name.trim() || !phone.trim()) {
      setError('Please fill crop name, your name, and phone number. / పంట పేరు, మీ పేరు, ఫోన్ నంబర్ నింపండి.')
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
      region_slug: localStorage.getItem('yff_consumer_location_name')?.toLowerCase().replace(/\s+/g, '') || 'tadepalligudem',
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
              Raise a Demand Intent / డిమాండ్ నమోదు
            </h3>
            <p className="text-amber-700 text-sm mt-1 leading-snug">
              Let local farmers know what you need — they&apos;ll reach out when available.
            </p>
            <p className="text-amber-600 text-xs mt-0.5">
              స్థానిక రైతులకు మీకు ఏమి కావాలో తెలియజేయండి
            </p>
          </div>
        </div>

        {!open && !submitted && (
          <button
            onClick={() => setOpen(true)}
            className="mt-4 w-full bg-amber-600 text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2"
          >
            <span className="text-lg leading-none">+</span>
            Raise Intent / డిమాండ్ నమోదు
          </button>
        )}

        {submitted && (
          <div className="mt-4 text-center py-3">
            <p className="text-green-700 font-bold text-base">✓ Intent raised! / నమోదైంది!</p>
            <p className="text-green-600 text-sm mt-1">
              Farmers in your area will be notified.<br />
              మీ ప్రాంతంలోని రైతులకు తెలియజేస్తాము.
            </p>
          </div>
        )}

        {open && !submitted && (
          <div className="mt-4 space-y-3">
            <input
              type="text"
              placeholder="Crop name * (e.g. Tomato / టమాటా)"
              value={crop}
              onChange={(e) => setCrop(e.target.value)}
              className="w-full border border-amber-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-amber-500 focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Quantity (kg) / పరిమాణం"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="border border-amber-200 rounded-xl px-3 py-3 text-sm bg-white focus:border-amber-500 focus:outline-none"
              />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border border-amber-200 rounded-xl px-3 py-3 text-sm bg-white focus:border-amber-500 focus:outline-none"
              />
            </div>
            <input
              type="text"
              placeholder="Delivery location / డెలివరీ స్థలం"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full border border-amber-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-amber-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Your name * / మీ పేరు"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-amber-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-amber-500 focus:outline-none"
            />
            <input
              type="tel"
              placeholder="Your WhatsApp number * / మీ వాట్సాప్ నంబర్"
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
                Cancel / రద్దు
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-amber-600 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50"
              >
                {loading ? 'Submitting... / నమోదు అవుతోంది' : 'Submit / నమోదు'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


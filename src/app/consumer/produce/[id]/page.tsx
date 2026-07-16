'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useLang } from '@/lib/LanguageContext'
import LanguageToggle from '@/components/LanguageToggle'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { useCart, CartFab, EditableQty } from '@/components/consumer/Cart'
import { supabase } from '@/lib/supabase'
import { normalizePickupSchedule } from '@/lib/pickup-slots'
import { localizeName } from '@/lib/localizeName'
import { harvestClock, freshnessLabel } from '@/lib/harvest'
import ProduceReviewsModal from '@/components/consumer/ProduceReviewsModal'
import ShareButton from '@/components/consumer/ShareButton'

type Farmer = {
  id: string
  name: string
  village: string
  slug: string
  phone: string
  method: string
  pickup_locations?: string[] | null
  pickup_slots?: unknown
}

type Listing = {
  id: string
  name: string
  variety?: string | null
  emoji?: string | null
  method?: string | null
  category?: string | null
  status: string
  description?: string | null
  unit?: string | null
  stock_qty?: number | null
  image_url?: string | null
  image_urls?: string[] | null
  brix?: number | null
  soil_ph?: number | null
  pesticide_result?: string | null
  how_we_grow?: string | null
  availability_from?: string | null
  availability_to?: string | null
  harvest_frequency?: string | null
  harvest_frequency_count?: number | null
  shelf_life_days?: number | null
  harvest_date?: string | null
  rating_avg?: number | null
  review_count?: number | null
  price_tier_1_qty?: number | null
  price_tier_1_price?: number | null
  price_tier_2_qty?: number | null
  price_tier_2_price?: number | null
  price_tier_3_price?: number | null
  farmer_id: string
}

const METHOD_SHORT: Record<string, string> = {
  natural: 'Natural', organic: 'Organic', low_chemical: 'Semi-org', chemical: 'Chemical',
}
const CATEGORY_LABEL: Record<string, string> = {
  vegetables: 'Vegetables', fruits: 'Fruits', grains: 'Grains & Pulses', leafy: 'Leafy Greens',
  spices: 'Spices', other: 'Other',
}

// A Postgres `date` (or full timestamp) → short readable date, e.g. "5 Jul 2026".
function fmtDate(d?: string | null): string {
  if (!d) return ''
  const dt = new Date(d.slice(0, 10) + 'T00:00:00')
  if (isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Harvesting cadence + count → "Twice a week", "3 times a day", etc.
function fmtFrequency(freq?: string | null, count?: number | null, L?: (en: string, te: string) => string): string {
  if (!freq) return ''
  const tr = L ?? ((en: string) => en)
  const period = freq === 'daily' ? tr('day', 'రోజు') : tr('week', 'వారం')
  const n = count && count > 0 ? count : null
  if (!n) return freq === 'daily' ? tr('Daily', 'రోజువారీ') : tr('Weekly', 'వారానికి')
  if (n === 1) return tr('Once a', 'ఒకసారి') + ' ' + period
  if (n === 2) return tr('Twice a', 'రెండుసార్లు') + ' ' + period
  return `${n} ${tr('times a', 'సార్లు')} ${period}`
}

export default function ProduceDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const { lang, L } = useLang()
  const { requireAuth } = useConsumerAuth()
  const { cart, addItem, setQty } = useCart()

  const [item, setItem] = useState<Listing | null>(null)
  const [farmer, setFarmer] = useState<Farmer | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [liveStock, setLiveStock] = useState<number | null>(null)
  const [stockMsg, setStockMsg] = useState('')
  const [adding, setAdding] = useState(false)
  const [showReviews, setShowReviews] = useState(false)
  // Latest harvest for this produce — powers the "Harvested 2 hours ago" clock.
  const [latestHarvest, setLatestHarvest] = useState<{ at: string; shelf: number | null } | null>(null)

  // Swipe gallery
  const [activeImg, setActiveImg] = useState(0)
  const galleryRef = useRef<HTMLDivElement>(null)
  const onGalleryScroll = () => {
    const el = galleryRef.current
    if (!el) return
    setActiveImg(Math.round(el.scrollLeft / el.clientWidth))
  }

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const { data: l } = await supabase.from('produce_listings').select('*').eq('id', id).maybeSingle()
    if (!l) { setNotFound(true); setLoading(false); return }
    setItem(l as Listing)
    setLiveStock((l as Listing).stock_qty ?? null)
    const { data: f } = await supabase.from('farmers').select('*').eq('id', (l as Listing).farmer_id).maybeSingle()
    setFarmer((f as Farmer) ?? null)
    // Latest harvest for the clock. Best-effort — silent if the table is absent.
    try {
      const { data: h } = await supabase
        .from('harvests')
        .select('harvested_at, shelf_life_days')
        .eq('produce_listing_id', id)
        .order('harvested_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      // Clock source, in order of preference: a logged `harvests` row, else the
      // harvest date/time set on the listing's Edit form. Shelf life falls back
      // to the listing's own value the same way.
      const listingShelf = (l as Listing).shelf_life_days ?? null
      const listingHarvestDate = (l as Listing).harvest_date ?? null
      if (h) {
        setLatestHarvest({ at: h.harvested_at as string, shelf: (h.shelf_life_days as number | null) ?? listingShelf })
      } else if (listingHarvestDate) {
        setLatestHarvest({ at: listingHarvestDate, shelf: listingShelf })
      } else {
        setLatestHarvest(null)
      }
    } catch { setLatestHarvest(null) }
    setLoading(false)
  }, [id])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-9 h-9 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }
  if (notFound || !item) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-4xl">🌱</div>
        <p className="text-gray-600 font-semibold">{L('This harvest is no longer available.', 'ఈ కోత ఇప్పుడు అందుబాటులో లేదు.')}</p>
        <Link href="/consumer" className="text-green-700 font-bold underline">{L('Back to browse', 'తిరిగి వెళ్ళండి')} →</Link>
      </main>
    )
  }

  const unit = item.unit || 'kg'
  const emoji = item.emoji ?? '🌿'
  const method = item.method?.toLowerCase() ?? 'natural'
  const methodShort = METHOD_SHORT[method] ?? 'Natural'
  const gallery = (item.image_urls && item.image_urls.length ? item.image_urls : (item.image_url ? [item.image_url] : []))
    .filter(Boolean) as string[]
  const farmerHref = farmer ? `/farmer/${farmer.slug}` : '#'
  const canAdd = !!farmer && !!farmer.phone
  const inCart = cart[item.id]
  const isOutOfStock = liveStock !== null && liveStock <= 0
  const atMax = liveStock !== null && inCart != null && inCart.qty >= liveStock

  const doAdd = async () => {
    if (!farmer) return
    setAdding(true); setStockMsg('')
    const { data } = await supabase.from('produce_listings').select('stock_qty').eq('id', item.id).single()
    const fresh = data?.stock_qty ?? null
    if (fresh !== null) setLiveStock(fresh)
    setAdding(false)
    if (fresh !== null) {
      if (fresh <= 0) { setStockMsg(L('Out of stock', 'అయిపోయింది')); return }
      const curQty = inCart?.qty ?? 0
      if (curQty >= fresh) { setStockMsg(`${L('Maximum available', 'గరిష్ట పరిమాణం')}: ${fresh} ${unit}`); return }
    }
    addItem({
      listingId: item.id,
      name: item.name,
      variety: item.variety ?? undefined,
      emoji: item.emoji ?? undefined,
      unit,
      stockQty: fresh != null ? fresh : (item.stock_qty ?? undefined),
      pricePerKg: item.price_tier_1_price ?? undefined,
      priceTier1Qty: item.price_tier_1_qty ?? undefined,
      priceTier1Price: item.price_tier_1_price ?? undefined,
      priceTier2Qty: item.price_tier_2_qty ?? undefined,
      priceTier2Price: item.price_tier_2_price ?? undefined,
      priceTier3Price: item.price_tier_3_price ?? undefined,
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
      setStockMsg(`${L('Maximum available', 'గరిష్ట పరిమాణం')}: ${liveStock} ${unit}`); return
    }
    setStockMsg('')
    setQty(item.id, inCart.qty + 1)
  }

  // Price tiers shown as a small "buy more, save more" table.
  const tiers: { label: string; price: number }[] = []
  if (item.price_tier_1_price != null) {
    tiers.push({ label: `${L('Up to', 'వరకు')} ${item.price_tier_1_qty ?? 1} ${unit}`, price: item.price_tier_1_price })
  }
  if (item.price_tier_2_qty != null && item.price_tier_2_price != null) {
    tiers.push({ label: `${item.price_tier_2_qty}+ ${unit}`, price: item.price_tier_2_price })
  }
  if (item.price_tier_3_price != null) {
    tiers.push({ label: `${L('Bulk', 'బల్క్')}`, price: item.price_tier_3_price })
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-28">
      {/* Header bar */}
      <div className="sticky top-0 z-40 bg-green-900">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/consumer" className="text-green-200 text-sm font-semibold flex items-center gap-1">
            {L('← Back', '← తిరిగి')}
          </Link>
          <div className="flex items-center gap-4">
            <ShareButton
              variant="pill"
              info={{
                id: item.id,
                name: item.name,
                variety: item.variety,
                emoji: item.emoji,
                method: item.method,
                pricePerUnit: item.price_tier_1_price,
                unit: item.unit,
                farmerName: farmer?.name,
                farmerVillage: farmer?.village,
              }}
            />
            <LanguageToggle />
          </div>
        </div>
      </div>

      {/* Centered column so the page stays structured on desktop, not full-bleed */}
      <div className="max-w-lg mx-auto">
      {/* Gallery */}
      <div className="relative bg-white">
        {gallery.length ? (
          <>
            <div
              ref={galleryRef}
              onScroll={onGalleryScroll}
              className="flex w-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
            >
              {gallery.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt={item.name} className="snap-center shrink-0 w-full h-72 object-cover" />
              ))}
            </div>
            {gallery.length > 1 && (
              <div className="absolute bottom-7 left-0 right-0 flex justify-center gap-1.5 pointer-events-none drop-shadow">
                {gallery.map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-all ${i === activeImg ? 'w-4 bg-white' : 'w-1.5 bg-white/70'}`} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-72 bg-green-50 flex items-center justify-center text-7xl">{emoji}</div>
        )}
        <span className="absolute top-3 right-3 bg-green-700 text-white text-[11px] font-bold rounded-full px-2 py-1 shadow">
          {methodShort}
        </span>
      </div>

      <div className="px-4 -mt-4 relative space-y-3">
        {/* Name + price card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <h1 className="text-xl font-extrabold text-gray-900 leading-tight">{localizeName(item.name, lang)}</h1>
          {item.variety && <p className="text-sm text-gray-500 mt-0.5">{localizeName(item.variety, lang)}</p>}

          {/* Harvest clock — "Harvested 2 hours ago", from the latest harvest. */}
          {latestHarvest && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 rounded-full px-2.5 py-1">
                ⏱ {harvestClock(latestHarvest.at, L)}
              </span>
              {(() => {
                const fresh = freshnessLabel(latestHarvest.at, latestHarvest.shelf, L)
                return fresh ? <span className="text-xs font-semibold text-amber-700">{fresh}</span> : null
              })()}
            </div>
          )}

          {(item.review_count ?? 0) > 0 && item.rating_avg != null && (
            <button onClick={() => setShowReviews(true)} className="flex items-center gap-1.5 mt-2 active:opacity-70">
              <span className="inline-flex items-center gap-0.5 bg-green-700 text-white text-xs font-bold rounded px-1.5 py-0.5">
                {item.rating_avg.toFixed(1)} ★
              </span>
              <span className="text-xs text-gray-500 underline">
                {item.review_count} {item.review_count === 1 ? L('review', 'సమీక్ష') : L('reviews', 'సమీక్షలు')}
              </span>
            </button>
          )}

          {/* Farmer Price — the price the farmer receives (USP: a major share
              goes to the farmer). The platform fee is shown separately at checkout. */}
          <div className="mt-3">
            <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide">
              🧑‍🌾 {L('Farmer Price', 'రైతు ధర')}
            </p>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-green-800">
                {item.price_tier_1_price ? `₹${item.price_tier_1_price}` : '—'}
              </span>
              <span className="text-sm text-gray-500">/{unit}</span>
            </div>
          </div>

          {liveStock != null && (
            <p className={`text-xs font-semibold mt-1 ${liveStock === 0 ? 'text-red-600' : 'text-gray-500'}`}>
              {liveStock === 0 ? L('Out of stock', 'అయిపోయింది') : `${liveStock} ${unit} ${L('left', 'మిగిలి ఉంది')}`}
            </p>
          )}

          {tiers.length > 1 && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide mb-1.5">{L('Buy more, save more', 'ఎక్కువ కొంటే తక్కువ ధర')}</p>
              <div className="flex flex-wrap gap-2">
                {tiers.map((t) => (
                  <div key={t.label} className="bg-green-50 rounded-lg px-2.5 py-1.5">
                    <p className="text-xs font-bold text-green-900">₹{t.price}<span className="font-medium text-gray-500">/{unit}</span></p>
                    <p className="text-[10px] text-gray-500">{t.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Farmer card */}
        {farmer && (
          <Link href={farmerHref} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center justify-between active:bg-gray-50">
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">👨‍🌾 {farmer.name}</p>
              <p className="text-xs text-gray-500 truncate">{farmer.village}</p>
            </div>
            <span className="text-green-700 text-sm font-semibold whitespace-nowrap">{L('View profile', 'ప్రొఫైల్ చూడండి')} ›</span>
          </Link>
        )}

        {/* Quality / details */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
          <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide">{L('Details', 'వివరాలు')}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="bg-green-100 text-green-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">{methodShort}</span>
            {item.category && CATEGORY_LABEL[item.category] && (
              <span className="bg-gray-100 text-gray-700 text-[11px] font-semibold px-2 py-0.5 rounded-full">{CATEGORY_LABEL[item.category]}</span>
            )}
            {item.pesticide_result && (
              <span className="bg-blue-100 text-blue-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">{item.pesticide_result}</span>
            )}
            {item.soil_ph != null && (
              <span className="bg-purple-100 text-purple-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">pH {item.soil_ph}</span>
            )}
            {item.brix != null && (
              <span className="bg-amber-100 text-amber-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">BRIX {item.brix}</span>
            )}
          </div>

          {(item.availability_from || item.availability_to) && (
            <div>
              <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide">📅 {L('Available', 'అందుబాటు')}</p>
              <p className="text-sm text-gray-600 leading-snug mt-0.5">
                {[fmtDate(item.availability_from), fmtDate(item.availability_to)].filter(Boolean).join(' – ')}
              </p>
            </div>
          )}

          {/* Harvest freshness — the actual pick date/time, how fresh it still
              is, and its shelf life, so the buyer can judge freshness fully. */}
          {latestHarvest && (
            <div>
              <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide">🌾 {L('Harvest', 'కోత')}</p>
              <p className="text-sm font-bold text-green-800 leading-snug mt-0.5">⏱ {harvestClock(latestHarvest.at, L)}</p>
              <p className="text-sm text-gray-600 leading-snug mt-0.5">
                {L('Harvest Date Time', 'కోత తేదీ సమయం')}: {new Date(latestHarvest.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              {latestHarvest.shelf != null && (
                <p className="text-sm text-gray-600 leading-snug mt-0.5">
                  {L('Shelf life', 'తాజా')}: {latestHarvest.shelf} {L('days', 'రోజులు')}
                  {(() => {
                    const fresh = freshnessLabel(latestHarvest.at, latestHarvest.shelf, L)
                    return fresh ? <span className="text-amber-700 font-semibold"> · {fresh}</span> : null
                  })()}
                </p>
              )}
            </div>
          )}

          {item.harvest_frequency && (
            <div>
              <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide">🔁 {L('Harvesting', 'కోత')}</p>
              <p className="text-sm text-gray-600 leading-snug mt-0.5">{fmtFrequency(item.harvest_frequency, item.harvest_frequency_count, L)}</p>
            </div>
          )}

          {item.how_we_grow && (
            <div>
              <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide">🌱 {L('How we grow', 'మేము ఎలా పండిస్తాము')}</p>
              <p className="text-sm text-gray-600 leading-snug whitespace-pre-line mt-0.5">{item.how_we_grow}</p>
            </div>
          )}

          {item.description && (
            <div>
              <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide">{L('Description', 'వివరణ')}</p>
              <p className="text-sm text-gray-600 leading-snug whitespace-pre-line mt-0.5">{item.description}</p>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Sticky add-to-cart bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3 max-w-lg mx-auto">
        {stockMsg && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 text-center mb-2">{stockMsg}</p>
        )}
        {!canAdd ? (
          <Link href={farmerHref} className="flex items-center justify-center w-full h-12 bg-green-800 text-white font-bold rounded-xl">
            {L('View farmer', 'రైతును చూడండి')}
          </Link>
        ) : isOutOfStock ? (
          <button disabled className="w-full h-12 bg-gray-200 text-gray-500 font-bold rounded-xl cursor-not-allowed">
            {L('Out of stock', 'అయిపోయింది')}
          </button>
        ) : !inCart ? (
          <button
            onClick={() => requireAuth(() => { void doAdd() })}
            disabled={adding}
            className="w-full h-12 bg-green-800 active:opacity-90 text-white font-bold rounded-xl disabled:opacity-60"
          >
            {adding ? L('Checking…', 'తనిఖీ…') : L('+ Add to cart', '+ కార్ట్‌లో చేర్చు')}
          </button>
        ) : (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl h-12 px-3">
            <button onClick={() => { setQty(item.id, inCart.qty - 1); setStockMsg('') }} className="w-9 h-9 rounded-lg bg-white border border-green-300 text-green-800 text-xl font-bold" aria-label="Decrease">−</button>
            <EditableQty
              qty={inCart.qty}
              unit={unit}
              max={liveStock}
              onChange={(n) => { setQty(item.id, n); setStockMsg('') }}
              inputClassName="font-extrabold text-green-900 text-base"
              unitClassName="font-extrabold text-green-900"
            />
            <button onClick={handleInc} disabled={atMax} className={`w-9 h-9 rounded-lg text-xl font-bold ${atMax ? 'bg-gray-200 text-gray-400' : 'bg-green-700 text-white'}`} aria-label="Increase">+</button>
          </div>
        )}
      </div>

      <CartFab raised />

      {showReviews && (
        <ProduceReviewsModal listingId={item.id} produceName={item.name} onClose={() => setShowReviews(false)} />
      )}
    </main>
  )
}

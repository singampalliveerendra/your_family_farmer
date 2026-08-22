'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useLang } from '@/lib/LanguageContext'
import LanguageToggle from '@/components/LanguageToggle'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { useCart, CartFab, EditableQty } from '@/components/consumer/Cart'
import { supabase } from '@/lib/supabase'
import { normalizePickupSchedule, normalizePickupPhones } from '@/lib/pickup-slots'
import { CONSUMER_VISIBLE_STATUSES } from '@/lib/produceStatus'
import { localizeName, localizeUnit } from '@/lib/localizeName'
import { normalizeStep, stepUp, stepDown, formatQty } from '@/lib/saleStep'
import { harvestClock } from '@/lib/harvest'
import { normalizeUrl, linkHost } from '@/lib/links'
import ProduceReviewsModal from '@/components/consumer/ProduceReviewsModal'
import ShareButton from '@/components/consumer/ShareButton'

// Per-harvest product page. Unlike /consumer/produce/[id] (which is keyed on the
// produce template and shows the *latest* harvest), this page is keyed on ONE
// harvest — so two harvests of the same produce (fresh vs pre-book) are two
// separate, independently-orderable products. The harvest carries the pick
// date/time, shelf life and its own stock; everything else (price tiers, photos,
// description, quality, farmer) is inherited from the produce_listing template.

type Farmer = {
  id: string
  name: string
  village: string
  slug: string
  phone: string
  method: string
  pickup_locations?: string[] | null
  pickup_location_phones?: unknown
  pickup_slots?: unknown
  account_type?: string | null
}

// The farmer an aggregator's harvest came from. Contact record, not an account.
type SourceFarmer = {
  name: string
  village?: string | null
  address?: string | null
  phone?: string | null
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
  image_url?: string | null
  image_urls?: string[] | null
  brix?: number | null
  soil_ph?: number | null
  pesticide_result?: string | null
  how_we_grow?: string | null
  video_url?: string | null
  shelf_life_days?: number | null
  rating_avg?: number | null
  review_count?: number | null
  price_tier_1_qty?: number | null
  /** Smallest sellable quantity, in this listing's unit. Null/absent = 1. */
  sale_step?: number | null
  price_tier_1_price?: number | null
  price_tier_2_qty?: number | null
  price_tier_2_price?: number | null
  price_tier_3_price?: number | null
  farmer_id: string
}

type Harvest = {
  id: string
  produce_listing_id: string
  harvested_at: string
  shelf_life_days?: number | null
  stock_qty?: number | null
  unit?: string | null
  paused?: boolean | null
  source_farmer?: SourceFarmer | null
}

const METHOD_SHORT: Record<string, string> = {
  natural: 'Natural', organic: 'Organic', low_chemical: 'Semi-org', chemical: 'Chemical',
}
const CATEGORY_LABEL: Record<string, string> = {
  vegetables: 'Vegetables', fruits: 'Fruits', grains: 'Grains & Pulses', leafy: 'Leafy Greens',
  spices: 'Spices', other: 'Other',
}

export default function HarvestDetailPage() {
  const params = useParams<{ harvestId: string }>()
  const harvestId = params?.harvestId
  const { lang, L } = useLang()
  const { requireAuth } = useConsumerAuth()
  const { cart, addItem, setQty } = useCart()

  const [harvest, setHarvest] = useState<Harvest | null>(null)
  const [item, setItem] = useState<Listing | null>(null)
  const [farmer, setFarmer] = useState<Farmer | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [liveStock, setLiveStock] = useState<number | null>(null)
  const [stockMsg, setStockMsg] = useState('')
  const [adding, setAdding] = useState(false)
  const [showReviews, setShowReviews] = useState(false)

  // Swipe gallery
  const [activeImg, setActiveImg] = useState(0)
  const galleryRef = useRef<HTMLDivElement>(null)
  const onGalleryScroll = () => {
    const el = galleryRef.current
    if (!el) return
    setActiveImg(Math.round(el.scrollLeft / el.clientWidth))
  }

  const load = useCallback(async () => {
    if (!harvestId) return
    setLoading(true)
    const { data: h } = await supabase
      .from('harvests')
      .select('id, produce_listing_id, harvested_at, shelf_life_days, stock_qty, unit, paused, source_farmer:source_farmers(name, village, address, phone)')
      .eq('id', harvestId)
      .maybeSingle()
    // A paused harvest is off the market — treat a direct link to it (a shared
    // URL, a stale tab) exactly like a harvest that no longer exists.
    if (!h || (h as unknown as Harvest).paused) { setNotFound(true); setLoading(false); return }
    setHarvest(h as unknown as Harvest)
    setLiveStock((h as unknown as Harvest).stock_qty ?? null)

    const { data: l } = await supabase
      .from('produce_listings')
      .select('*')
      .eq('id', (h as unknown as Harvest).produce_listing_id)
      .maybeSingle()
    // The template must exist and not be taken down. 'sold_out' is allowed
    // through: it only describes the template's own loose stock, and this
    // harvest carries its own stock_qty — a farmer can be out of the former
    // while this pick still has kilos left. The CTA below reads liveStock, so
    // an actually-empty harvest still shows "Out of stock".
    if (!l || !CONSUMER_VISIBLE_STATUSES.includes((l as Listing).status as 'available')) {
      setNotFound(true); setLoading(false); return
    }
    setItem(l as Listing)

    // Explicit columns, never '*': `farmers` carries password_hash, the
    // activation code and the legacy bank columns, and this response is
    // world-readable.
    const { data: f } = await supabase
      .from('farmers')
      .select('id, name, village, slug, phone, method, pickup_locations, pickup_location_phones, pickup_slots, account_type')
      .eq('id', (l as Listing).farmer_id)
      .maybeSingle()
    setFarmer((f as Farmer) ?? null)
    setLoading(false)
  }, [harvestId])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-9 h-9 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }
  if (notFound || !item || !harvest) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-4xl">🌱</div>
        <p className="text-gray-600 font-semibold">{L('This harvest is no longer available.', 'ఈ కోత ఇప్పుడు అందుబాటులో లేదు.')}</p>
        <Link href="/consumer" className="text-green-700 font-bold underline">{L('Back to browse', 'తిరిగి వెళ్ళండి')} →</Link>
      </main>
    )
  }

  const unit = harvest.unit || item.unit || 'kg'
  // Smallest quantity this produce sells in (250 g mirchi, 1 kg rice).
  const saleStep = normalizeStep(item.sale_step, unit)
  // Display only. `unit` itself stays exactly as stored — it travels into the
  // cart and then the order row, so a Telugu string there would corrupt data.
  const unitLabel = localizeUnit(unit, lang)
  const emoji = item.emoji ?? '🌿'
  const method = item.method?.toLowerCase() ?? 'natural'
  const methodShort = METHOD_SHORT[method] ?? 'Natural'
  const gallery = (item.image_urls && item.image_urls.length ? item.image_urls : (item.image_url ? [item.image_url] : []))
    .filter(Boolean) as string[]
  const farmerHref = farmer ? `/farmer/${farmer.slug}` : '#'
  const isAggregator = farmer?.account_type === 'aggregator'
  const sourceFarmer = harvest.source_farmer ?? null
  const canAdd = !!farmer && !!farmer.phone
  const inCart = cart[harvest.id]
  const isOutOfStock = liveStock !== null && liveStock <= 0
  const atMax = liveStock !== null && inCart != null && inCart.qty >= liveStock

  // Freshness comes from THIS harvest, falling back to the template's shelf life.
  const harvestShelf = harvest.shelf_life_days ?? item.shelf_life_days ?? null

  const doAdd = async () => {
    if (!farmer) return
    setAdding(true); setStockMsg('')
    // Re-read this harvest's own stock so we never add past what's left.
    const { data } = await supabase.from('harvests').select('stock_qty').eq('id', harvest.id).single()
    const fresh = data?.stock_qty ?? null
    if (fresh !== null) setLiveStock(fresh)
    setAdding(false)
    if (fresh !== null) {
      if (fresh <= 0) { setStockMsg(L('Out of stock', 'అయిపోయింది')); return }
      const curQty = inCart?.qty ?? 0
      if (curQty >= fresh) { setStockMsg(`${L('Maximum available', 'గరిష్ట పరిమాణం')}: ${formatQty(fresh)} ${unitLabel}`); return }
    }
    addItem({
      listingId: item.id,
      harvestId: harvest.id,
      harvestedAt: harvest.harvested_at,
      shelfLifeDays: harvestShelf ?? undefined,
      name: item.name,
      variety: item.variety ?? undefined,
      emoji: item.emoji ?? undefined,
      unit,
      stockQty: fresh != null ? fresh : (harvest.stock_qty ?? undefined),
      pricePerKg: item.price_tier_1_price ?? undefined,
      saleStep: item.sale_step ?? undefined,
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
      farmerPickupPhones: normalizePickupPhones(farmer.pickup_location_phones, farmer.pickup_locations ?? []),
    })
  }

  const handleInc = () => {
    if (liveStock !== null && inCart.qty >= liveStock) {
      setStockMsg(`${L('Maximum available', 'గరిష్ట పరిమాణం')}: ${formatQty(liveStock)} ${unitLabel}`); return
    }
    setStockMsg('')
    setQty(harvest.id, stepUp(inCart.qty, saleStep, liveStock))
  }

  // Price tiers shown as a small "buy more, save more" table.
  const tiers: { label: string; price: number }[] = []
  if (item.price_tier_1_price != null) {
    tiers.push({ label: `${L('Up to', 'వరకు')} ${formatQty(item.price_tier_1_qty ?? 1)} ${unitLabel}`, price: item.price_tier_1_price })
  }
  if (item.price_tier_2_qty != null && item.price_tier_2_price != null) {
    tiers.push({ label: `${formatQty(item.price_tier_2_qty)}+ ${unitLabel}`, price: item.price_tier_2_price })
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
                <div key={url} className="relative snap-center shrink-0 w-full h-72">
                  <Image src={url} alt={item.name} fill sizes="(max-width: 640px) 100vw, 512px" className="object-cover" />
                </div>
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

          {/* This harvest's clock — "Harvested 2 hours ago" / "Harvest expected tomorrow". */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 rounded-full px-2.5 py-1">
              ⏱ {harvestClock(harvest.harvested_at, L)}
            </span>
          </div>

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

          {/* Farmer Price — the price the farmer receives. The platform fee is
              shown separately at checkout. */}
          <div className="mt-3">
            <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide">
              🧑‍🌾 {L('Farmer Price', 'రైతు ధర')}
            </p>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-green-800">
                {item.price_tier_1_price ? `₹${item.price_tier_1_price}` : '—'}
              </span>
              <span className="text-sm text-gray-500">/{unitLabel}</span>
            </div>
          </div>

          {liveStock != null && (
            <p className={`text-xs font-semibold mt-1 ${liveStock === 0 ? 'text-red-600' : 'text-gray-500'}`}>
              {liveStock === 0 ? L('Out of stock', 'అయిపోయింది') : `${formatQty(liveStock)} ${unitLabel} ${L('left', 'మిగిలి ఉంది')}`}
            </p>
          )}

          {tiers.length > 1 && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide mb-1.5">{L('Buy more, save more', 'ఎక్కువ కొంటే తక్కువ ధర')}</p>
              <div className="flex flex-wrap gap-2">
                {tiers.map((t) => (
                  <div key={t.label} className="bg-green-50 rounded-lg px-2.5 py-1.5">
                    <p className="text-xs font-bold text-green-900">₹{t.price}<span className="font-medium text-gray-500">/{unitLabel}</span></p>
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
              {isAggregator && (
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{L('Sold by', 'అమ్మేవారు')}</p>
              )}
              <p className="text-sm font-bold text-gray-900 truncate">{isAggregator ? '🤝' : '👨‍🌾'} {farmer.name}</p>
              <p className="text-xs text-gray-500 truncate">{farmer.village}</p>
            </div>
            <span className="text-green-700 text-sm font-semibold whitespace-nowrap">{L('View profile', 'ప్రొఫైల్ చూడండి')} ›</span>
          </Link>
        )}

        {/* Grown by — the aggregator's whole obligation, made visible. Sits
            immediately under "Sold by" so the two are read as a pair and the
            buyer cannot mistake the reseller for the grower. Deliberately not a
            link: a source farmer is a contact record, with no profile page. */}
        {isAggregator && sourceFarmer && (
          <div className="bg-white rounded-2xl border-2 border-green-200 p-4 shadow-sm space-y-1.5">
            <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">
              {L('Grown by', 'పండించినవారు')}
            </p>
            <p className="text-sm font-bold text-gray-900">👨‍🌾 {sourceFarmer.name}</p>
            {(sourceFarmer.address || sourceFarmer.village) && (
              <p className="text-xs text-gray-600 leading-snug">
                📍 {[sourceFarmer.address, sourceFarmer.village].filter(Boolean).join(', ')}
              </p>
            )}
            {sourceFarmer.phone && (
              <a href={`tel:${sourceFarmer.phone}`} className="inline-block text-xs font-bold text-green-700 underline">
                📞 {sourceFarmer.phone}
              </a>
            )}
            <p className="text-[11px] text-gray-500 leading-snug pt-0.5">
              {L(
                'This harvest was grown by this farmer and sold through the aggregator above.',
                'ఈ కోతను ఈ రైతు పండించారు, పైన ఉన్న సమీకరణదారు ద్వారా అమ్మబడుతోంది.',
              )}
            </p>
          </div>
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

          {/* This harvest's pick date/time and shelf life, so the buyer can
              judge for themselves. The "N days fresh left" / "Past best"
              countdown is deliberately not shown to buyers — it read as an
              expiry warning on produce that was still perfectly good. */}
          <div>
            <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide">🌾 {L('Harvest', 'కోత')}</p>
            <p className="text-sm font-bold text-green-800 leading-snug mt-0.5">⏱ {harvestClock(harvest.harvested_at, L)}</p>
            <p className="text-sm text-gray-600 leading-snug mt-0.5">
              {L('Harvest Date Time', 'కోత తేదీ సమయం')}: {new Date(harvest.harvested_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
            {harvestShelf != null && (
              <p className="text-sm text-gray-600 leading-snug mt-0.5">
                {L('Shelf life', 'తాజా')}: {harvestShelf} {L('days', 'రోజులు')}
              </p>
            )}
          </div>

          {item.how_we_grow && (
            <div>
              <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide">🌱 {L('How we grow', 'మేము ఎలా పండిస్తాము')}</p>
              <p className="text-sm text-gray-600 leading-snug whitespace-pre-line mt-0.5">{item.how_we_grow}</p>
            </div>
          )}

          {/* Farmer's video for this produce. normalizeUrl both adds the missing
              scheme and rejects anything that isn't http(s), so a pasted
              javascript: string can never become a live link on this page. */}
          {normalizeUrl(item.video_url) && (
            <div>
              <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide">🎥 {L('Video', 'వీడియో')}</p>
              <a
                href={normalizeUrl(item.video_url)!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-1 text-sm font-semibold text-green-700 underline active:opacity-70"
              >
                {L('Watch video', 'వీడియో చూడండి')}
                {linkHost(item.video_url) && (
                  <span className="text-xs text-gray-500 no-underline">({linkHost(item.video_url)})</span>
                )}
              </a>
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
            <button onClick={() => { setQty(harvest.id, stepDown(inCart.qty, saleStep)); setStockMsg('') }} className="w-9 h-9 rounded-lg bg-white border border-green-300 text-green-800 text-xl font-bold" aria-label={L('Decrease', 'తగ్గించు')}>−</button>
            <EditableQty
              qty={inCart.qty}
              step={saleStep}
              unit={unitLabel}
              max={liveStock}
              onChange={(n) => { setQty(harvest.id, n); setStockMsg('') }}
              inputClassName="font-extrabold text-green-900 text-base"
              unitClassName="font-extrabold text-green-900"
            />
            <button onClick={handleInc} disabled={atMax} className={`w-9 h-9 rounded-lg text-xl font-bold ${atMax ? 'bg-gray-200 text-gray-400' : 'bg-green-700 text-white'}`} aria-label={L('Increase', 'పెంచు')}>+</button>
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

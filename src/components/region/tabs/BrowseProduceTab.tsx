'use client'

import { reachFor } from '@/lib/retailReach'
import { useSavedBuyer } from '@/lib/savedBuyer'
import { farmerCoords } from '@/lib/location'
import { useState } from 'react'
import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'
import { localizeName } from '@/lib/localizeName'
import { matchesProduceQuery } from '@/lib/produceSearch'
import { useCart } from '@/components/consumer/Cart'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { normalizePickupSchedule } from '@/lib/pickup-slots'

type ProduceItem = {
  id: string
  name: string
  variety?: string
  emoji?: string
  farmer_id: string
  price_tier_1_price?: number
  price_tier_1_qty?: number
  price_tier_2_price?: number
  price_tier_2_qty?: number
  price_tier_3_price?: number
  unit?: string
  stock_qty?: number
  method?: string
  delivery_mode?: string | null
  delivery_charge?: number | null
  // Local only / Transportable across AP & TG (2026-11-05).
  retail_reach?: string | null
  retail_transport_rates?: unknown
  delivery_radius_km?: number | null
}

type Farmer = {
  id: string
  slug: string
  name: string
  village?: string
  phone?: string
  pickup_locations?: string[]
  pickup_slots?: unknown
  rating_avg?: number
  /** Rough farm point from the server (~5 km grid; never the exact farm). */
  area?: { lat: number; lng: number } | null
}

export default function BrowseProduceTab({
  produce,
  farmers,
}: {
  produce: Record<string, unknown>[]
  farmers: Record<string, unknown>[]
}) {
  const { tx, lang, L } = useLang()
  const { addItem, cart } = useCart()
  const { requireAuth } = useConsumerAuth()
  // The buyer's saved location → transportable produce shows its charge and
  // goes into the cart by the farmer's courier (same rule as the home grid).
  const buyer = useSavedBuyer()
  const reachOf = (item: ProduceItem, farmer: Farmer) => reachFor(item, farmer.area ?? farmerCoords(farmer), buyer)
  const [search, setSearch] = useState('')
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  const list = produce as ProduceItem[]
  const farmerList = farmers as Farmer[]

  const getFarmer = (farmerId: string) => farmerList.find((f) => f.id === farmerId)

  const filtered = list.filter((p) => {
    // Never surface a sold-out listing as orderable. stock_qty === 0 means it
    // ran out (a null/undefined stock means "unlimited", so keep those).
    if (p.stock_qty === 0) return false
    // Bilingual — matches whether the crop was stored in English or Telugu.
    return matchesProduceQuery(p, search)
  })

  const handleAddToCart = (item: ProduceItem) => {
    const farmer = getFarmer(item.farmer_id)
    // The farmer's phone is not public since the security fix (2026-11-04);
    // a real seller is enough to add to the cart.
    if (!farmer) return
    requireAuth(() => doAddToCart(item, farmer))
  }

  const doAddToCart = (item: ProduceItem, farmer: Farmer) => {
    addItem({
      listingId: item.id,
      name: item.name,
      variety: item.variety,
      emoji: item.emoji,
      pricePerKg: item.price_tier_1_price,
      priceTier1Qty: item.price_tier_1_qty,
      priceTier1Price: item.price_tier_1_price,
      priceTier2Qty: item.price_tier_2_qty,
      priceTier2Price: item.price_tier_2_price,
      priceTier3Price: item.price_tier_3_price,
      unit: item.unit,
      stockQty: item.stock_qty,
      farmerId: farmer.id,
      farmerName: farmer.name,
      farmerPhone: '',
      farmerVillage: farmer.village ?? '',
      farmerSlug: farmer.slug,
      farmerPickupLocations: farmer.pickup_locations,
      farmerPickupSlots: normalizePickupSchedule(farmer.pickup_slots, farmer.pickup_locations ?? []),
      ...(() => {
        const r = reachOf(item, farmer)
        return r.kind === 'transport' && buyer?.state ? { transportCharge: r.charge, transportState: buyer.state } : {}
      })(),
    })

    setAddedIds((prev) => new Set(prev).add(item.id))
    setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }, 2000)
  }

  if (list.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">{tx.noProduceFound}</div>
    )
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={tx.searchProducePlaceholder}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none bg-white"
      />

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">{tx.noProduceFound}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((item) => {
            const farmer = getFarmer(item.farmer_id)
            if (!farmer) return null
            const added = addedIds.has(item.id)
            const inCart = !!cart[item.id]
            const canCart = !!item.price_tier_1_price

            return (
              <div key={item.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <Link href={`/farmer/${farmer.slug}#produce`} className="block p-3">
                  <div className="text-3xl mb-2">{item.emoji ?? '🌿'}</div>
                  <h3 className="text-sm font-bold text-gray-900 leading-tight">{localizeName(item.name, lang)}</h3>
                  {item.variety && (
                    <p className="text-[10px] text-gray-500 mt-0.5 truncate">{localizeName(item.variety, lang)}</p>
                  )}
                  <p className="text-xs text-green-700 font-semibold mt-1 truncate">
                    {farmer.name}
                    {farmer.village ? ` · ${farmer.village}` : ''}
                  </p>
                  {farmer.rating_avg ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-yellow-400 text-xs">★</span>
                      <span className="text-xs text-gray-500">{farmer.rating_avg.toFixed(1)}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between mt-2">
                    {item.price_tier_1_price ? (
                      <span className="text-sm font-bold text-gray-900">
                        ₹{item.price_tier_1_price}
                        <span className="text-xs font-normal text-gray-400">/{item.unit ?? 'kg'}</span>
                      </span>
                    ) : (
                      <span />
                    )}
                    {item.method === 'natural' && (
                      <span className="bg-green-100 text-green-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {L('Natural', 'సహజం')}
                      </span>
                    )}
                    {(item.delivery_mode === 'courier' || item.delivery_mode === 'both') && (
                      <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        🛵 {(item.delivery_charge ?? 0) > 0 ? `₹${item.delivery_charge}` : 'Free'}
                      </span>
                    )}
                  </div>
                  {(() => {
                    const r = reachOf(item, farmer)
                    if (r.kind === 'transport') {
                      return (
                        <p className="mt-1.5 inline-flex rounded-full bg-[#e5ecf3] px-1.5 py-0.5 text-[10px] font-bold text-[#27486a]">
                          🚚 {r.charge > 0 ? L(`₹${r.charge} transport to you`, `మీకు రవాణా ₹${r.charge}`) : L('Free transport to you', 'మీకు రవాణా ఉచితం')}
                        </p>
                      )
                    }
                    if (r.kind === 'out_of_range') {
                      return <p className="mt-1.5 text-[10px] font-semibold text-gray-500">📍 {L('Pickup only for you', 'మీకు పికప్ మాత్రమే')}</p>
                    }
                    return null
                  })()}
                  {item.stock_qty !== undefined && item.stock_qty > 0 && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      {item.stock_qty} {item.unit ?? 'kg'} left
                    </p>
                  )}
                </Link>

                {canCart && (
                  <div className="px-3 pb-3">
                    <button
                      onClick={() => handleAddToCart(item)}
                      className={`w-full py-2 rounded-lg text-xs font-bold transition-colors ${
                        added
                          ? 'bg-green-100 text-green-800'
                          : inCart
                          ? 'bg-green-50 text-green-700 border border-green-300'
                          : 'bg-green-700 text-white active:bg-green-800'
                      }`}
                    >
                      {added ? tx.addedToCart : inCart ? `In cart ✓` : tx.addToCart}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

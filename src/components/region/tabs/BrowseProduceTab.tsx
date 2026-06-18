'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'
import { localizeName } from '@/lib/localizeName'
import { useCart } from '@/components/consumer/Cart'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'

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
}

type Farmer = {
  id: string
  slug: string
  name: string
  village?: string
  phone?: string
  pickup_locations?: string[]
  rating_avg?: number
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
  const [search, setSearch] = useState('')
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  const list = produce as ProduceItem[]
  const farmerList = farmers as Farmer[]

  const getFarmer = (farmerId: string) => farmerList.find((f) => f.id === farmerId)

  const filtered = list.filter((p) => {
    // Never surface a sold-out listing as orderable. stock_qty === 0 means it
    // ran out (a null/undefined stock means "unlimited", so keep those).
    if (p.stock_qty === 0) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      p.name.toLowerCase().includes(q) ||
      (p.variety ?? '').toLowerCase().includes(q)
    )
  })

  const handleAddToCart = (item: ProduceItem) => {
    const farmer = getFarmer(item.farmer_id)
    if (!farmer?.phone) return
    const farmerWithPhone = farmer as Farmer & { phone: string }
    requireAuth(() => doAddToCart(item, farmerWithPhone))
  }

  const doAddToCart = (item: ProduceItem, farmer: Farmer & { phone: string }) => {
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
      farmerPhone: farmer.phone,
      farmerVillage: farmer.village ?? '',
      farmerSlug: farmer.slug,
      farmerPickupLocations: farmer.pickup_locations,
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
            const canCart = !!item.price_tier_1_price && !!farmer.phone

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
                        Natural
                      </span>
                    )}
                    {(item.delivery_mode === 'courier' || item.delivery_mode === 'both') && (
                      <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        🛵 {(item.delivery_charge ?? 0) > 0 ? `₹${item.delivery_charge}` : 'Free'}
                      </span>
                    )}
                  </div>
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

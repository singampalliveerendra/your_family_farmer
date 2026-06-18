'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'
import { localizeName } from '@/lib/localizeName'
import { FreshnessBadge } from '@/components/FreshnessBadge'
import { useCart } from '@/components/consumer/Cart'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'

type Produce = {
  id: string
  name: string
  variety?: string
  emoji?: string
  method?: string
  status: string
  price_tier_1_qty?: number
  price_tier_1_price?: number
  price_tier_2_qty?: number
  price_tier_2_price?: number
  price_tier_3_qty?: number
  price_tier_3_price?: number
  stock_qty?: number
  brix?: number
  pesticide_result?: string
  shelf_life_days?: number
  available_to?: string
  description?: string
  image_url?: string
  harvest_date?: string | null
  delivery_mode?: string | null
  delivery_charge?: number | null
  delivery_radius_km?: number | null
}

type Farmer = {
  id?: string
  name?: string
  phone?: string
  village?: string
  slug?: string
  pickup_locations?: string[] | null
  upi_id?: string | null
}

const EMOJI_OPTIONS = ['🍅', '🍌', '🥭', '🫑', '🥬', '🍆', '🥕', '🌽', '🧅', '🧄', '🥦', '🌿', '🍓', '🫒', '🌾']
const STATUS_OPTIONS = ['available', 'coming_soon']

export default function ProduceTab({
  farmer,
  produce,
  isEditMode = false,
}: {
  farmer: Record<string, unknown>
  produce: Record<string, unknown>[]
  isEditMode?: boolean
}) {
  const { tx, L } = useLang()
  const f = farmer as Farmer
  const { addItem } = useCart()
  const { requireAuth } = useConsumerAuth()
  const [listings, setListings] = useState<Produce[]>(produce as Produce[])
  const available = listings.filter((p) => p.status === 'available' && p.stock_qty !== 0)
  const comingSoon = listings.filter((p) => p.status === 'coming_soon')

  const handleProduceAdded = (newItem: Produce) => {
    setListings((prev) => [newItem, ...prev])
  }

  const handleDelete = async (id: string) => {
    if (!confirm(L('Are you sure?', 'మీరు నిశ్చితంగా ఉన్నారా?'))) return
    const { error } = await supabase.from('produce_listings').delete().eq('id', id)
    if (error) {
      alert(`Could not delete: ${error.message}`)
      return
    }
    setListings((prev) => prev.filter((p) => p.id !== id))
  }

  const farmerCartInfo = {
    farmerId: f.id ?? '',
    farmerName: f.name ?? '',
    farmerPhone: f.phone ?? '',
    farmerVillage: f.village ?? '',
    farmerSlug: f.slug ?? '',
    farmerPickupLocations: Array.isArray(f.pickup_locations) ? f.pickup_locations : [],
    farmerUpiId: f.upi_id ?? undefined,
  }

  return (
    <div className="space-y-6">
      {available.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-green-700 text-white text-xs font-bold px-3 py-1 rounded-full">
              {tx.availableNow}
            </span>
          </div>
          <div className="space-y-3">
            {available.map((item) => (
              <ProduceCard
                key={item.id}
                item={item}
                farmerInfo={farmerCartInfo}
                onAddToCart={(qty) => requireAuth(() => addItem({
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
                  unit: undefined,
                  stockQty: item.stock_qty,
                  ...farmerCartInfo,
                }, qty))}
                onDelete={isEditMode ? () => handleDelete(item.id) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {comingSoon.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full">
              {tx.comingSoon}
            </span>
          </div>
          <div className="space-y-3">
            {comingSoon.map((item) => (
              <ComingSoonCard
                key={item.id}
                item={item}
                farmerId={item.id}
                onDelete={isEditMode ? () => handleDelete(item.id) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {listings.length === 0 && (
        <div className="text-center py-6 text-gray-400 text-sm">{tx.noProduceListed}</div>
      )}

      {isEditMode && f.id && (
        <AddProduceForm farmerId={f.id} onAdded={handleProduceAdded} />
      )}
    </div>
  )
}

function AddProduceForm({ farmerId, onAdded }: { farmerId: string; onAdded: (item: Produce) => void }) {
  const { L } = useLang()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [variety, setVariety] = useState('')
  const [emoji, setEmoji] = useState('🌿')
  const [status, setStatus] = useState<'available' | 'coming_soon'>('available')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setName(''); setVariety(''); setEmoji('🌿'); setStatus('available')
    setPrice(''); setStock(''); setSuccess(false); setError('')
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    setLoading(true)
    setError('')

    const payload: Record<string, unknown> = {
      farmer_id: farmerId,
      name: name.trim(),
      emoji,
      status,
      method: 'Natural',
    }
    if (variety.trim()) payload.variety = variety.trim()
    if (price) payload.price_tier_1_price = Number(price)
    if (stock) payload.stock_qty = Number(stock)

    const { data, error: insertError } = await supabase.from('produce_listings').insert(payload).select().single()
    setLoading(false)
    if (!insertError && data) {
      onAdded(data as Produce)
      setSuccess(true)
      setTimeout(() => { reset(); setOpen(false) }, 1500)
    } else {
      setError(insertError?.message ?? 'Failed to add produce. Check Supabase RLS policies.')
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full border-2 border-dashed border-green-300 rounded-xl py-4 text-green-700 text-sm font-semibold flex items-center justify-center gap-2 hover:border-green-500 hover:bg-green-50 transition-colors"
      >
        <span className="text-lg">+</span> {L('Add your produce', 'మీ పంట చేర్చండి')}
      </button>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-800 text-sm">{L('Add produce', 'పంట చేర్చండి')}</h3>
        <button onClick={() => { reset(); setOpen(false) }} className="text-gray-400 text-lg leading-none">×</button>
      </div>

      {/* Emoji picker */}
      <div>
        <p className="text-xs text-gray-500 mb-2">{L('Pick an icon', 'ఐకాన్ ఎంచుకోండి')}</p>
        <div className="flex flex-wrap gap-2">
          {EMOJI_OPTIONS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={`w-9 h-9 rounded-lg text-xl flex items-center justify-center transition-all ${emoji === e ? 'bg-green-100 ring-2 ring-green-500' : 'bg-gray-50'}`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Name + variety */}
      <div className="space-y-2">
        <input
          type="text"
          placeholder={L('Produce name', 'పంట పేరు (e.g. Papaya)')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="text"
          placeholder={L('Variety (optional)', 'రకం')}
          value={variety}
          onChange={(e) => setVariety(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Price + stock */}
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          placeholder={L('Price / kg (₹)', 'ధర / కేజీ (₹)')}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="number"
          placeholder={L('Stock (kg)', 'నిల్వ')}
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Status */}
      <div className="flex gap-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s as 'available' | 'coming_soon')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              status === s
                ? s === 'available' ? 'bg-green-700 text-white' : 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {s === 'available' ? L('Available now', 'అందుబాటులో') : L('Coming soon', 'త్వరలో')}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-center text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      {success ? (
        <p className="text-center text-sm text-green-700 font-semibold py-1">
          {L('✓ Added successfully!', 'చేర్చబడింది!')}
        </p>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={loading || !name.trim()}
          className="w-full bg-green-700 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50"
        >
          {loading ? L('Adding...', 'చేరుస్తోంది') : L('Add produce', 'పంట చేర్చండి')}
        </button>
      )}
    </div>
  )
}

type FarmerCartInfo = {
  farmerId: string
  farmerName: string
  farmerPhone: string
  farmerVillage: string
  farmerSlug: string
  farmerPickupLocations: string[]
  farmerUpiId?: string
}

function ProduceCard({
  item,
  farmerInfo,
  onAddToCart,
  onDelete,
}: {
  item: Produce
  farmerInfo: FarmerCartInfo
  onAddToCart: (qty: number) => void
  onDelete?: () => void
}) {
  const { tx, lang, L } = useLang()
  const [added, setAdded] = useState(false)

  const bgColors: Record<string, string> = {
    '🍅': 'bg-red-100', '🥬': 'bg-green-100', '🥭': 'bg-orange-100',
    '🍆': 'bg-purple-100', '🥕': 'bg-orange-100', '🌽': 'bg-yellow-100',
    '🍌': 'bg-yellow-100', '🫑': 'bg-green-100',
  }
  const emoji = item.emoji ?? '🌿'
  const bg = bgColors[emoji] ?? 'bg-green-100'

  const handleAdd = () => {
    onAddToCart(1)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="flex gap-3 p-3">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            loading="lazy"
            className="rounded-xl w-14 h-14 object-cover flex-shrink-0 bg-gray-100"
          />
        ) : (
          <div className={`${bg} rounded-xl w-14 h-14 flex items-center justify-center text-3xl flex-shrink-0`}>
            {emoji}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-gray-900 text-sm">{localizeName(item.name, lang)}</h3>
              {item.variety && <p className="text-xs text-gray-500">{localizeName(item.variety, lang)}</p>}
            </div>
            {item.stock_qty !== undefined && (
              <span className="text-xs text-gray-500 flex-shrink-0">{item.stock_qty} {tx.stockLeft}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {item.method && (
              <span className="bg-green-100 text-green-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">{item.method}</span>
            )}
            {item.pesticide_result && (
              <span className="bg-blue-100 text-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">{item.pesticide_result}</span>
            )}
            {item.brix && (
              <span className="bg-amber-100 text-amber-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">BRIX {item.brix}</span>
            )}
            {item.harvest_date && <FreshnessBadge harvestDate={item.harvest_date} />}
            {(item.delivery_mode === 'courier' || item.delivery_mode === 'both') && (
              <span className="bg-blue-100 text-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                🛵 {(item.delivery_charge ?? 0) > 0 ? `Delivery ₹${item.delivery_charge}` : 'Free delivery'}
                {item.delivery_radius_km ? ` · ${item.delivery_radius_km}km` : ''}
              </span>
            )}
          </div>
          {item.description && (
            <p className="text-xs text-gray-600 mt-2 leading-snug whitespace-pre-line">
              {item.description}
            </p>
          )}
        </div>
      </div>

      {item.price_tier_1_price && (
        <div className="border-t border-gray-100 px-3 py-2 bg-gray-50">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-700">
            {item.price_tier_1_price && (
              <span>{item.price_tier_1_qty ? `1–${item.price_tier_2_qty ? item.price_tier_2_qty - 1 : item.price_tier_1_qty} kg` : 'Per kg'}: <strong>₹{item.price_tier_1_price}</strong></span>
            )}
            {item.price_tier_2_qty && item.price_tier_2_price && (
              <span>{item.price_tier_2_qty}–{item.price_tier_3_qty ? item.price_tier_3_qty - 1 : '+'} kg: <strong>₹{item.price_tier_2_price}</strong></span>
            )}
            {item.price_tier_3_qty && item.price_tier_3_price && (
              <span>{item.price_tier_3_qty}+ kg: <strong>₹{item.price_tier_3_price}</strong></span>
            )}
          </div>
        </div>
      )}

      <div className="px-3 pb-3 pt-2 space-y-2">
        <button
          onClick={handleAdd}
          className={`flex items-center justify-center gap-2 w-full font-bold py-3.5 rounded-xl text-base transition-colors ${
            added
              ? 'bg-green-100 text-green-800'
              : 'bg-green-700 text-white active:bg-green-800'
          }`}
        >
          {added ? (
            <>{L('✓ Added to cart', 'బుట్టకు చేర్చబడింది')}</>
          ) : (
            <>
              <span className="text-xl leading-none">+</span>
              {L('Add to cart', 'బుట్టకు చేర్చండి')}
            </>
          )}
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="w-full border border-red-200 text-red-600 font-semibold py-2.5 rounded-xl text-sm active:bg-red-50"
          >
            {L('🗑 Delete', 'తొలగించు')}
          </button>
        )}
      </div>
    </div>
  )
}

function ComingSoonCard({ item, farmerId, onDelete }: { item: Produce; farmerId: string; onDelete?: () => void }) {
  const { tx, lang, L } = useLang()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleNotify = async () => {
    if (!name || !phone) return
    setLoading(true)
    await supabase.from('notify_requests').insert({
      farmer_id: farmerId,
      produce_name: item.name,
      requester_name: name,
      requester_phone: phone,
    })
    setSubmitted(true)
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-bold text-gray-700 text-sm">{item.emoji ?? '🌱'} {localizeName(item.name, lang)}</h3>
          {item.available_to && (
            <p className="text-xs text-gray-500 mt-0.5">
              {tx.expected} {new Date(item.available_to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </p>
          )}
        </div>
        <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-full">
          {tx.comingSoon}
        </span>
      </div>

      {submitted ? (
        <p className="text-sm text-green-700 font-semibold text-center py-2">{tx.notifySuccess}</p>
      ) : (
        <div className="space-y-2 mt-3">
          <input type="text" placeholder={tx.yourName} value={name} onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <input type="tel" placeholder={tx.yourPhone} value={phone} onChange={(e) => setPhone(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <button onClick={handleNotify} disabled={loading}
            className="w-full bg-amber-600 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-60">
            {loading ? tx.saving : tx.notifyMe}
          </button>
        </div>
      )}

      {onDelete && (
        <button
          onClick={onDelete}
          className="mt-3 w-full border border-red-200 text-red-600 font-semibold py-2.5 rounded-lg text-sm active:bg-red-50"
        >
          {L('🗑 Delete', 'తొలగించు')}
        </button>
      )}
    </div>
  )
}

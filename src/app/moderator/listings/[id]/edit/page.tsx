'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import ModeratorShell, { useModeratorAuth } from '../../../ModeratorShell'
import ListingForm, { type ListingFormValues, EMPTY_LISTING_FORM } from '../../ListingForm'

// Prefill state pulled from the listing, passed straight into ListingForm.
type Loaded = {
  form: ListingFormValues
  emoji: string
  farmerId: string
  farmerName: string
  images: string[]
}

const numStr = (v: number | null | undefined) => (v == null ? '' : String(v))

// Stored UTC ISO timestamp → local "yyyy-MM-ddThh:mm" for a datetime-local input.
const toLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 16)
}

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>()
  const { zone, checked } = useModeratorAuth()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const r = await fetch(`/api/moderator/listings/${id}`, { credentials: 'same-origin' }).catch(() => null)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load harvest.'); return }
    const l = json.listing as Record<string, unknown>
    // Prefill the photo gallery from image_urls (falling back to the single
    // image_url cover) so the moderator can add/remove existing photos.
    const urls = Array.isArray(l.image_urls) ? (l.image_urls as unknown[]).filter((u): u is string => typeof u === 'string' && !!u) : []
    const cover = typeof l.image_url === 'string' ? l.image_url : ''
    const images = urls.length ? urls : (cover ? [cover] : [])
    setLoaded({
      form: {
        ...EMPTY_LISTING_FORM,
        name: (l.name as string) ?? '',
        variety: (l.variety as string) ?? '',
        method: (l.method as string) ?? 'natural',
        category: (l.category as string) ?? '',
        unit: (l.unit as string) ?? 'kg',
        stock_qty: numStr(l.stock_qty as number | null),
        description: (l.description as string) ?? '',
        brix: numStr(l.brix as number | null),
        harvest_date: toLocalInput(l.harvest_date as string | null),
        shelf_life_days: numStr(l.shelf_life_days as number | null),
        price_tier_1_qty: numStr(l.price_tier_1_qty as number | null) || '1',
        price_tier_1_price: numStr(l.price_tier_1_price as number | null),
        price_tier_2_qty: numStr(l.price_tier_2_qty as number | null),
        price_tier_2_price: numStr(l.price_tier_2_price as number | null),
        price_tier_3_price: numStr(l.price_tier_3_price as number | null),
        soil_organic_carbon: numStr(l.soil_organic_carbon as number | null),
        soil_ph: numStr(l.soil_ph as number | null),
        pesticide_result: (l.pesticide_result as string) ?? '',
        availability_from: (l.availability_from as string)?.slice(0, 10) ?? '',
        availability_to: (l.availability_to as string)?.slice(0, 10) ?? '',
        harvest_frequency: (l.harvest_frequency as string) ?? '',
        harvest_frequency_count: numStr(l.harvest_frequency_count as number | null),
        delivery_mode: (l.delivery_mode as string) || 'pickup',
        delivery_charge: numStr(l.delivery_charge as number | null),
        delivery_radius_km: numStr(l.delivery_radius_km as number | null),
      },
      emoji: (l.emoji as string) || '📦',
      farmerId: (l.farmer_id as string) ?? '',
      farmerName: (json.farmer_name as string) ?? '—',
      images,
    })
  }, [id])

  useEffect(() => { if (checked && zone) void load() }, [checked, zone, load])

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <ModeratorShell title="Edit harvest" subtitle="Update this listing on the farmer's behalf" zone={zone}>
      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold max-w-2xl">{error}</div>
      ) : !loaded ? (
        <p className="text-sm text-gray-400 py-10">Loading…</p>
      ) : (
        <ListingForm
          mode="edit"
          zone={zone}
          listingId={id}
          initialForm={loaded.form}
          initialEmoji={loaded.emoji}
          initialFarmerId={loaded.farmerId}
          initialImages={loaded.images}
          fixedFarmerName={loaded.farmerName}
        />
      )}
    </ModeratorShell>
  )
}

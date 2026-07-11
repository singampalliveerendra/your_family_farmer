'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import HarvestManager from '@/components/HarvestManager'

// Shared add/edit form for a farmer's harvest listing, used by both
//   /moderator/listings/new          (mode="create")
//   /moderator/listings/[id]/edit    (mode="edit")
// Create posts to /api/moderator/listings; edit PUTs to that listing's [id].
//
// Kept at full parity with the FARMER's Edit Harvest form (moderators register
// farmers and add/edit harvests on their behalf, so they get every field the
// farmer has): icon, name, variety, method, category, unit, stock, brix,
// shelf life, delivery method (pickup/courier/both + charge & radius), three
// price tiers, photos, soil quality (organic carbon, pH), pesticide result,
// and description.
//
// Harvest date/time differs by mode, exactly as it does for the farmer:
//   create — one "first harvest" date seeds the produce's initial harvest row.
//   edit   — the shared <HarvestManager> panel owns harvests, so the moderator
//            can log MANY picks per produce instead of editing a single date.

export type ListingFormValues = {
  name: string
  variety: string
  method: string
  category: string
  unit: string
  stock_qty: string
  description: string
  brix: string
  harvest_date: string
  shelf_life_days: string
  price_tier_1_qty: string
  price_tier_1_price: string
  price_tier_2_qty: string
  price_tier_2_price: string
  price_tier_3_price: string
  soil_organic_carbon: string
  soil_ph: string
  pesticide_result: string
  availability_from: string
  availability_to: string
  harvest_frequency: string
  harvest_frequency_count: string
  // How this produce is fulfilled: pickup only, farmer courier, or both. Mirrors
  // the farmer form's Delivery method — the cart uses it to constrain each line's
  // pickup/delivery choice, so it must be settable here too.
  delivery_mode: string
  delivery_charge: string
  delivery_radius_km: string
}

export const EMPTY_LISTING_FORM: ListingFormValues = {
  name: '', variety: '', method: 'natural', category: '', unit: 'kg',
  stock_qty: '', description: '', brix: '', harvest_date: '', shelf_life_days: '',
  price_tier_1_qty: '1', price_tier_1_price: '',
  price_tier_2_qty: '', price_tier_2_price: '',
  price_tier_3_price: '',
  soil_organic_carbon: '', soil_ph: '', pesticide_result: '',
  availability_from: '', availability_to: '',
  harvest_frequency: '', harvest_frequency_count: '',
  delivery_mode: 'pickup', delivery_charge: '', delivery_radius_km: '',
}

const DELIVERY_MODES = [
  { key: 'pickup', label: 'Pickup only', icon: '🧺' },
  { key: 'courier', label: 'Farmer courier', icon: '🛵' },
  { key: 'both', label: 'Both', icon: '🔁' },
] as const

const EMOJIS = ['📦', '🍅', '🥬', '🥕', '🧅', '🥔', '🍆', '🌶️', '🥭', '🍌', '🍋', '🥥', '🌽', '🫛']
const UNITS = ['kg', 'g', 'litre', 'dozen', 'piece', 'bunch']
// Mirrors the farmer form's category options (drives the consumer category filter).
const CATEGORIES = [
  { v: 'vegetables', label: 'Vegetables' },
  { v: 'fruits', label: 'Fruits' },
  { v: 'grains', label: 'Grains & Pulses' },
  { v: 'leafy', label: 'Leafy Greens' },
  { v: 'spices', label: 'Spices' },
  { v: 'other', label: 'Other' },
]

type FarmerOption = { id: string; name: string; village: string | null }

export default function ListingForm({
  mode,
  zone,
  listingId,
  initialForm = EMPTY_LISTING_FORM,
  initialEmoji = '📦',
  initialFarmerId = '',
  initialImages = [],
  fixedFarmerName,
}: {
  mode: 'create' | 'edit'
  zone: string
  listingId?: string
  initialForm?: ListingFormValues
  initialEmoji?: string
  initialFarmerId?: string
  initialImages?: string[]
  fixedFarmerName?: string
}) {
  const router = useRouter()

  const [farmers, setFarmers] = useState<FarmerOption[]>([])
  const [loadingFarmers, setLoadingFarmers] = useState(mode === 'create')

  const [farmerId, setFarmerId] = useState(initialFarmerId)
  const [emoji, setEmoji] = useState(initialEmoji)
  const [form, setForm] = useState<ListingFormValues>(initialForm)
  // Photos: already-saved image URLs + files newly picked this session (with
  // object-URL previews). Uploaded to Supabase storage on submit.
  const [existingImages, setExistingImages] = useState<string[]>(initialImages)
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [newPreviews, setNewPreviews] = useState<string[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const set = (k: keyof ListingFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  // Revoke object URLs on unmount so previews don't leak memory.
  useEffect(() => () => { newPreviews.forEach((u) => URL.revokeObjectURL(u)) }, [newPreviews])

  // Farmer list is only needed when creating (edit keeps the listing's farmer).
  useEffect(() => {
    if (mode !== 'create') return
    fetch('/api/moderator/farmers', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => setFarmers((j.farmers ?? []).map((f: { id: string; name: string; village: string | null }) => ({ id: f.id, name: f.name, village: f.village }))))
      .catch(() => setError('Could not load farmers.'))
      .finally(() => setLoadingFarmers(false))
  }, [mode])

  const onAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length) {
      setNewFiles((prev) => [...prev, ...files])
      setNewPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))])
    }
    e.target.value = ''
  }
  const removeExisting = (i: number) => setExistingImages((prev) => prev.filter((_, x) => x !== i))
  const removeNew = (i: number) => {
    setNewPreviews((prev) => { URL.revokeObjectURL(prev[i]); return prev.filter((_, x) => x !== i) })
    setNewFiles((prev) => prev.filter((_, x) => x !== i))
  }

  // Upload one image to the shared farm-images bucket (same bucket + anon-write
  // policy the farmer dashboard uses). Foldered by farmer so paths stay tidy.
  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${farmerId || 'moderator'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('farm-images')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (upErr) { setError(`Image upload failed: ${upErr.message}`); return null }
    const { data } = supabase.storage.from('farm-images').getPublicUrl(path)
    return data.publicUrl
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    if (mode === 'create' && !farmerId) { setError('Choose a farmer.'); return }
    if (!form.name.trim()) { setError('Harvest name is required.'); return }
    // Only the create flow carries a harvest date — it seeds the produce's first
    // harvest row. In edit mode HarvestManager owns the harvests.
    if (mode === 'create' && !form.harvest_date) { setError('Harvest date & time is required.'); return }
    const shelfNum = parseInt(form.shelf_life_days, 10)
    if (!form.shelf_life_days || !Number.isFinite(shelfNum) || shelfNum <= 0) {
      setError('Shelf life (days) is required.'); return
    }
    setError(''); setSubmitting(true)

    // Upload any newly-picked photos first; abort on failure (error is set by
    // uploadImage). The first image becomes the card cover (image_url).
    const uploaded: string[] = []
    for (const f of newFiles) {
      const u = await uploadImage(f)
      if (!u) { setSubmitting(false); return }
      uploaded.push(u)
    }
    const allImages = [...existingImages, ...uploaded]

    const url = mode === 'edit' ? `/api/moderator/listings/${listingId}` : '/api/moderator/listings'
    const method = mode === 'edit' ? 'PUT' : 'POST'
    // Edit mode deliberately omits harvest_date: sending it would make the API
    // rewrite the newest harvest row, silently undoing a pick the moderator just
    // logged in the panel below.
    const { harvest_date, ...editableFields } = form
    const payload = mode === 'edit'
      ? editableFields
      : { ...editableFields, harvest_date }

    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        ...payload,
        farmer_id: farmerId,
        emoji,
        image_url: allImages[0] ?? null,
      }),
    }).catch(() => null)
    if (!r) { setSubmitting(false); setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setSubmitting(false); setError(json?.error ?? (mode === 'edit' ? 'Could not save changes.' : 'Could not add harvest.')); return }

    // Quality fields (category, soil pH, pesticide result, photo gallery) are a
    // best-effort direct write — their columns may not exist until the quality
    // migration is applied, so they must never block the core save. Mirrors the
    // farmer dashboard's qualityPatch exactly.
    const savedId = mode === 'edit' ? listingId : (json?.id as string | undefined)
    if (savedId) {
      await supabase.from('produce_listings').update({
        category: form.category || null,
        soil_ph: form.soil_ph ? Number(form.soil_ph) : null,
        pesticide_result: form.pesticide_result.trim() || null,
        image_urls: allImages.length ? allImages : null,
      }).eq('id', savedId)
    }

    setSubmitting(false)
    if (mode === 'edit') { router.push('/moderator/listings'); return }
    setDone(true)
  }

  if (done) {
    const farmer = farmers.find((f) => f.id === farmerId)
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-md">
        <div className="text-4xl mb-2">✅</div>
        <h2 className="text-lg font-extrabold text-gray-900">{form.name} is live</h2>
        <p className="text-sm text-gray-500 mt-1">Added for {farmer?.name ?? 'the farmer'} and visible to buyers now.</p>
        <div className="flex flex-col gap-2 mt-5">
          <button
            onClick={() => { setDone(false); setFarmerId(''); setEmoji('📦'); setForm(EMPTY_LISTING_FORM); setExistingImages([]); setNewFiles([]); setNewPreviews([]) }}
            className="bg-green-800 text-white text-sm font-bold px-4 py-3 rounded-xl active:bg-green-900"
          >
            + Add another
          </button>
          <button onClick={() => router.push('/moderator/listings')} className="text-gray-500 text-sm underline">Back to listings</button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-5 max-w-2xl space-y-4">
      <Field label="Farmer *">
        {mode === 'edit' ? (
          <input value={fixedFarmerName ?? '—'} disabled className={`${inputCls} bg-gray-50 text-gray-500`} />
        ) : loadingFarmers ? (
          <p className="text-sm text-gray-400">Loading farmers…</p>
        ) : farmers.length === 0 ? (
          <p className="text-sm text-gray-500">No farmers in your zone yet. Onboard one first.</p>
        ) : (
          <select value={farmerId} onChange={(e) => setFarmerId(e.target.value)} required className={inputCls}>
            <option value="">Select a farmer…</option>
            {farmers.map((f) => (
              <option key={f.id} value={f.id}>{f.name}{f.village ? ` · ${f.village}` : ''}</option>
            ))}
          </select>
        )}
      </Field>

      <div>
        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Icon</span>
        <div className="flex flex-wrap gap-2">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center ${emoji === e ? 'bg-green-100 ring-2 ring-green-500' : 'bg-gray-50'}`}
            >
              {e}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-1">📦 = Other — use for any harvest without its own icon.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Harvest name *">
          <input value={form.name} onChange={set('name')} required className={inputCls} placeholder="Tomato" />
        </Field>
        <Field label="Variety">
          <input value={form.variety} onChange={set('variety')} className={inputCls} placeholder="Country / Hybrid" />
        </Field>
        <Field label="Method">
          <select value={form.method} onChange={set('method')} className={inputCls}>
            <option value="natural">Natural (no chemicals)</option>
            <option value="organic">Organic</option>
            <option value="low_chemical">Semi Organic</option>
            <option value="chemical">Chemical</option>
          </select>
        </Field>
        <Field label="Category">
          <select value={form.category} onChange={set('category')} className={inputCls}>
            <option value="">Select a category…</option>
            {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Unit">
          <select value={form.unit} onChange={set('unit')} className={inputCls}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Stock available">
          <input value={form.stock_qty} onChange={set('stock_qty')} type="number" min="0" step="0.1" className={inputCls} placeholder="e.g. 50" />
        </Field>
        <Field label="Brix (sweetness)">
          <input value={form.brix} onChange={set('brix')} type="number" min="0" step="0.1" className={inputCls} />
        </Field>
        {mode === 'create' && (
          <Field label="First harvest date & time *">
            <input value={form.harvest_date} onChange={set('harvest_date')} type="datetime-local" required className={inputCls} />
          </Field>
        )}
        <Field label="Shelf life (days) *">
          <input value={form.shelf_life_days} onChange={set('shelf_life_days')} type="number" min="1" step="1" required className={inputCls} placeholder="e.g. 5" />
        </Field>
      </div>

      {/* Harvest timings — the same panel the farmer gets inside their Edit
          Harvest form, so a moderator can log many picks against one produce.
          Edit only: a harvest needs a saved produce row to attach to. */}
      {mode === 'edit' && listingId && farmerId && (
        <div className="border-t border-gray-100 pt-4 max-w-md">
          <HarvestManager
            listingId={listingId}
            farmerId={farmerId}
            unit={form.unit}
            produceShelfLife={form.shelf_life_days ? parseInt(form.shelf_life_days, 10) : null}
          />
        </div>
      )}

      {/* Delivery method — pickup only, farmer courier, or both. Mirrors the
          farmer's Edit Harvest form so a moderator can set it on their behalf. */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-extrabold text-green-800 mb-3">Delivery method</p>
        <div className="grid grid-cols-3 gap-2">
          {DELIVERY_MODES.map((opt) => {
            const active = form.delivery_mode === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setForm((f) => ({ ...f, delivery_mode: opt.key }))}
                className={`rounded-xl px-2 py-3 text-center border-2 transition-colors ${active ? 'border-green-600 bg-green-50' : 'border-gray-200 bg-white'}`}
              >
                <span className="block text-lg leading-none">{opt.icon}</span>
                <span className={`block text-[11px] font-bold mt-1 leading-tight ${active ? 'text-green-800' : 'text-gray-600'}`}>{opt.label}</span>
              </button>
            )
          })}
        </div>
        {/* Courier details — only when the farmer offers delivery. */}
        {form.delivery_mode !== 'pickup' && (
          <div className="grid grid-cols-2 gap-4 mt-3">
            <Field label="Delivery charge ₹">
              <input value={form.delivery_charge} onChange={set('delivery_charge')} type="number" min="0" className={inputCls} placeholder="e.g. 30" />
            </Field>
            <Field label="Delivery radius (km)">
              <input value={form.delivery_radius_km} onChange={set('delivery_radius_km')} type="number" min="0" className={inputCls} placeholder="e.g. 10" />
            </Field>
          </div>
        )}
      </div>

      {/* Pricing */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-extrabold text-green-800 mb-3">Pricing (per {form.unit})</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tier 1 — min qty">
            <input value={form.price_tier_1_qty} onChange={set('price_tier_1_qty')} type="number" min="1" className={inputCls} />
          </Field>
          <Field label="Tier 1 — price ₹">
            <input value={form.price_tier_1_price} onChange={set('price_tier_1_price')} type="number" min="0" className={inputCls} />
          </Field>
          <Field label="Tier 2 — min qty (optional)">
            <input value={form.price_tier_2_qty} onChange={set('price_tier_2_qty')} type="number" min="1" className={inputCls} />
          </Field>
          <Field label="Tier 2 — price ₹ (optional)">
            <input value={form.price_tier_2_price} onChange={set('price_tier_2_price')} type="number" min="0" className={inputCls} />
          </Field>
          <Field label="Tier 3 — price ₹ (optional)">
            <input value={form.price_tier_3_price} onChange={set('price_tier_3_price')} type="number" min="0" className={inputCls} />
          </Field>
        </div>
      </div>

      {/* Quality & soil — mirrors the farmer's quality fields. */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-extrabold text-green-800 mb-3">Quality &amp; soil</p>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Soil Organic Carbon %">
            <input value={form.soil_organic_carbon} onChange={set('soil_organic_carbon')} type="number" min="0" step="0.1" className={inputCls} />
          </Field>
          <Field label="Soil pH">
            <input value={form.soil_ph} onChange={set('soil_ph')} type="number" min="0" step="0.1" className={inputCls} />
          </Field>
          <Field label="Chemicals / pesticide">
            <input value={form.pesticide_result} onChange={set('pesticide_result')} className={inputCls} placeholder="e.g. None detected" />
          </Field>
        </div>
      </div>

      {/* Photos */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-extrabold text-green-800 mb-3">Photos</p>
        <div className="flex flex-wrap gap-2">
          {existingImages.map((u, i) => (
            <div key={u} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => removeExisting(i)} className="absolute top-0 right-0 bg-black/60 text-white text-xs w-5 h-5 leading-5 text-center rounded-bl-lg">×</button>
            </div>
          ))}
          {newPreviews.map((u, i) => (
            <div key={u} className="relative w-20 h-20 rounded-xl overflow-hidden border border-green-300">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => removeNew(i)} className="absolute top-0 right-0 bg-black/60 text-white text-xs w-5 h-5 leading-5 text-center rounded-bl-lg">×</button>
            </div>
          ))}
          <label className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-2xl text-gray-400 cursor-pointer active:bg-gray-50">
            +
            <input type="file" accept="image/*" multiple className="hidden" onChange={onAddFiles} />
          </label>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">First photo is the cover buyers see.</p>
      </div>

      <Field label="Description">
        <textarea value={form.description} onChange={set('description')} rows={3} className={inputCls} />
      </Field>

      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 font-semibold">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={submitting} className="bg-green-800 text-white text-sm font-bold px-5 py-3 rounded-xl active:bg-green-900 disabled:opacity-50">
          {submitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add harvest'}
        </button>
        <button type="button" onClick={() => router.push('/moderator/listings')} className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-5 py-3 rounded-xl active:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  )
}

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">{label}</span>
      {children}
    </label>
  )
}

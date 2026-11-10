'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadFarmImage } from '@/lib/farmImageUpload'
import RetailReachFields, { EMPTY_REACH, reachPayload, type ReachForm } from '@/components/RetailReachFields'
import { clearDraft, draftHasContent, draftKey, draftPhotos, readDraft, writeDraft } from '@/lib/formDraft'
import HarvestManager from '@/components/HarvestManager'
import { useSourceFarmers, sourceFarmerLabel } from '@/components/SourceFarmerPicker'
import SellHowFields, { perUnitPriceRow, type RetailSellForm } from '@/components/SellHowFields'
import { resolveRetailPack, unitAllowsRetailPacks, type PackTierForm } from '@/lib/packPricing'
import { parseDeliveryMode } from '@/lib/fulfillment'
import { photosFromSaved, resolvePhotoUrls, type PhotoItem } from '@/lib/photoList'
import PhotoPicker from '@/components/PhotoPicker'
import WholesaleFields from '@/components/WholesaleFields'
import {
  EMPTY_WHOLESALE_FORM, resolveWholesaleForm, offersRetail, wholesaleRequestBody, bothPricesError, type WholesaleForm,
} from '@/lib/wholesale'

// The moderator area is English-only (staff screens), so the shared wholesale
// section is given an English-only translator here.
const EN = (en: string) => en

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
//   edit   — the shared <HarvestManager api="moderator"> panel owns harvests, so the moderator
//            can log MANY picks per produce instead of editing a single date.

export type ListingFormValues = {
  name: string
  variety: string
  method: string
  category: string
  unit: string
  sale_step: string
  stock_qty: string
  description: string
  video_url: string
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
  // Aggregator sellers only: which of their source farmers grows this produce.
  // Mirrors the farmer dashboard's produce form — the selection lives on the
  // produce, and every harvest logged against it inherits the farmer.
  source_farmer_id: string
}

export const EMPTY_LISTING_FORM: ListingFormValues = {
  name: '', variety: '', method: 'natural', category: '', unit: 'kg', sale_step: '1',
  stock_qty: '', description: '', video_url: '', brix: '', harvest_date: '', shelf_life_days: '',
  price_tier_1_qty: '1', price_tier_1_price: '',
  price_tier_2_qty: '', price_tier_2_price: '',
  price_tier_3_price: '',
  soil_organic_carbon: '', soil_ph: '', pesticide_result: '',
  availability_from: '', availability_to: '',
  harvest_frequency: '', harvest_frequency_count: '',
  // Empty on purpose: the moderator has to pick, same as the farmer form.
  delivery_mode: '', delivery_charge: '', delivery_radius_km: '',
  source_farmer_id: '',
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
  initialWholesale = EMPTY_WHOLESALE_FORM,
  wholesaleReady = false,
  lowStock = null,
  initialReach = EMPTY_REACH,
  initialRetailPack = { packSize: '', packPrice: '', tiers: [] },
  packReady = false,
}: {
  mode: 'create' | 'edit'
  zone: string
  listingId?: string
  initialForm?: ListingFormValues
  initialEmoji?: string
  initialFarmerId?: string
  initialImages?: string[]
  fixedFarmerName?: string
  /** Retail / Wholesale / Both and the wholesale details, for Edit. */
  initialWholesale?: WholesaleForm
  /** The loaded row has the wholesale columns (migration has run). */
  wholesaleReady?: boolean
  /** Wholesale hidden because stock is below the minimum (edit only). */
  lowStock?: { left: number; min: number } | null
  /** Local only / Transportable (2026-11-05), for Edit. */
  initialReach?: ReachForm
  /** Retail pack (2026-11-10), for Edit. */
  initialRetailPack?: { packSize: string; packPrice: string; tiers: PackTierForm[] }
  /** The loaded row has the pack columns (scripts/pack-pricing-migration.sql has run). */
  packReady?: boolean
}) {
  const router = useRouter()

  const [farmers, setFarmers] = useState<FarmerOption[]>([])
  const [loadingFarmers, setLoadingFarmers] = useState(mode === 'create')

  const [farmerId, setFarmerId] = useState(initialFarmerId)
  const [emoji, setEmoji] = useState(initialEmoji)
  const [form, setForm] = useState<ListingFormValues>(initialForm)
  // Photos: one ordered list, item 0 = cover. New picks are uploaded to
  // Supabase storage on submit.
  const [photos, setPhotos] = useState<PhotoItem[]>(() => photosFromSaved(null, initialImages))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [wholesale, setWholesale] = useState<WholesaleForm>(initialWholesale)
  const [reach, setReach] = useState<ReachForm>(initialReach)
  const [retailPack, setRetailPack] = useState<{ packSize: string; packPrice: string; packTiers: PackTierForm[] }>({
    packSize: initialRetailPack.packSize, packPrice: initialRetailPack.packPrice, packTiers: initialRetailPack.tiers,
  })

  // Only fires for an aggregator seller; a plain farmer gets no extra field.
  // Keyed on the chosen farmer, so switching sellers in create mode reloads
  // the right registry.
  const { isAggregator, sourceFarmers, noSourceFarmers } = useSourceFarmers(farmerId)

  // Switching the seller invalidates any farmer already chosen — it belongs to
  // the previous aggregator's list, and the DB refuses a cross-aggregator
  // attribution. Skipped on the first render so an edit keeps its saved value.
  const [lastFarmerId, setLastFarmerId] = useState(initialFarmerId)
  if (farmerId !== lastFarmerId) {
    setLastFarmerId(farmerId)
    if (form.source_farmer_id) setForm((f) => ({ ...f, source_farmer_id: '' }))
  }

  const set = (k: keyof ListingFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  // ── Draft: survives the page reloading (2026-11-05) — Android often closes
  // the browser tab while the camera app is open, and the form came back empty.
  // Same helper as the farmer form (src/lib/formDraft.ts). Cleared on save.
  const draftK = draftKey('moderator-produce', zone || 'zone', mode === 'edit' ? listingId ?? null : null)
  useEffect(() => {
    const d = readDraft<{ farmerId?: string; emoji?: string; form?: ListingFormValues; wholesale?: WholesaleForm; reach?: ReachForm; photos?: PhotoItem[]; retailPack?: typeof retailPack }>(draftK)
    if (!d) return
    if (mode === 'create' && typeof d.farmerId === 'string') { setFarmerId(d.farmerId); setLastFarmerId(d.farmerId) }
    if (typeof d.emoji === 'string') setEmoji(d.emoji)
    if (d.form && typeof d.form === 'object') setForm((f) => ({ ...f, ...d.form }))
    if (d.wholesale && typeof d.wholesale === 'object') setWholesale((w) => ({ ...w, ...d.wholesale }))
    if (d.reach && typeof d.reach === 'object') setReach(d.reach)
    if (d.retailPack && typeof d.retailPack === 'object') setRetailPack((r) => ({ ...r, ...d.retailPack }))
    if (Array.isArray(d.photos) && d.photos.length) setPhotos(d.photos)
    // Once, when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const draftJson = JSON.stringify({ farmerId, emoji, form, wholesale, reach, retailPack, photos: draftPhotos(photos) })
  useEffect(() => {
    const t = setTimeout(() => {
      const d = JSON.parse(draftJson) as { farmerId: string; form: Record<string, unknown>; photos: PhotoItem[] }
      if (mode === 'edit' || d.farmerId || d.photos.length || draftHasContent(d.form, ['price_tier_1_qty', 'unit', 'delivery_mode', 'shelf_life_days', 'method'])) writeDraft(draftK, JSON.parse(draftJson))
    }, 400)
    return () => clearTimeout(t)
  }, [draftJson, draftK, mode])

  // Both: wholesale must be cheaper than every retail price (same rule as the
  // farmer form; the API checks it again). Tier 2 counts only with its qty,
  // because the API saves it only then.
  // Packs are compared as ₹ per unit (perUnitPriceRow).
  const retailSell: RetailSellForm = {
    price: form.price_tier_1_price, tier1Qty: form.price_tier_1_qty,
    price2: form.price_tier_2_qty ? form.price_tier_2_price : '', price2Qty: form.price_tier_2_qty,
    price3: form.price_tier_3_price, saleStep: form.sale_step, ...retailPack,
  }
  const onRetailSell = (p: Partial<RetailSellForm>) => {
    setForm((f) => ({
      ...f,
      ...(p.price !== undefined ? { price_tier_1_price: p.price } : {}),
      ...(p.tier1Qty !== undefined ? { price_tier_1_qty: p.tier1Qty } : {}),
      ...(p.price2 !== undefined ? { price_tier_2_price: p.price2 } : {}),
      ...(p.price2Qty !== undefined ? { price_tier_2_qty: p.price2Qty } : {}),
      ...(p.price3 !== undefined ? { price_tier_3_price: p.price3 } : {}),
      ...(p.saleStep !== undefined ? { sale_step: p.saleStep } : {}),
    }))
    if (p.packSize !== undefined || p.packPrice !== undefined || p.packTiers !== undefined) {
      setRetailPack((r) => ({
        packSize: p.packSize ?? r.packSize, packPrice: p.packPrice ?? r.packPrice, packTiers: p.packTiers ?? r.packTiers,
      }))
    }
  }
  const retailPacked = offersRetail(wholesale.saleMode) && unitAllowsRetailPacks(form.unit) && retailPack.packSize !== ''
  const bothPriceErr = bothPricesError(perUnitPriceRow(wholesale, { ...retailSell, price2: form.price_tier_2_qty ? form.price_tier_2_price : '' }, form.unit))

  // Farmer list is only needed when creating (edit keeps the listing's farmer).
  useEffect(() => {
    if (mode !== 'create') return
    fetch('/api/moderator/farmers', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => setFarmers((j.farmers ?? []).map((f: { id: string; name: string; village: string | null }) => ({ id: f.id, name: f.name, village: f.village }))))
      .catch(() => setError('Could not load farmers.'))
      .finally(() => setLoadingFarmers(false))
  }, [mode])

  // Upload one image through a one-time signed link (security fix,
  // 2026-11-04): into the farmer's folder when they are in this moderator's
  // zone, else the moderator's onboarding folder.
  const uploadImage = async (file: File): Promise<string | null> => {
    const r = await uploadFarmImage(file, 'produce', farmerId || null)
    if (r.err) { setError(`Image ${r.err.charAt(0).toLowerCase()}${r.err.slice(1)}`); return null }
    return r.url
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
    // An aggregator's produce must name the farmer behind it (the DB trigger
    // refuses it otherwise). Same rule the farmer dashboard enforces.
    if (isAggregator && !form.source_farmer_id) {
      setError('Choose the farmer who grows this produce.'); return
    }
    if (!parseDeliveryMode(form.delivery_mode)) {
      setError('Choose a delivery method: Pickup only, Farmer courier, or Both.'); return
    }
    // Same wholesale rules as the farmer form; the API checks them again.
    const wholesaleResult = resolveWholesaleForm(wholesale, form.unit)
    if (!wholesaleResult.ok) { setError(wholesaleResult.error.en); return }
    if (bothPriceErr) { setError(bothPriceErr.en); return }
    // Retail packs: same rules as the farmer form; the API checks them again
    // and derives the per-unit columns from the pack.
    const packResult = resolveRetailPack({ unit: form.unit, packSize: retailPacked ? retailPack.packSize : '', packPrice: retailPack.packPrice, tiers: retailPack.packTiers })
    if (!packResult.ok) { setError(packResult.error.en); return }
    if (!retailPacked && offersRetail(wholesale.saleMode) && !(Number(form.price_tier_1_price) > 0)) { setError('Enter the retail price.'); return }
    const packBody = retailPacked || packReady ? packResult.columns : {}
    setError(''); setSubmitting(true)

    // Upload any newly-picked photos first; abort on failure (error is set by
    // uploadImage). The first image becomes the card cover (image_url).
    const allImages = await resolvePhotoUrls(photos, uploadImage)
    if (!allImages) { setSubmitting(false); return }

    const url = mode === 'edit' ? `/api/moderator/listings/${listingId}` : '/api/moderator/listings'
    const method = mode === 'edit' ? 'PUT' : 'POST'
    // Edit mode deliberately omits harvest_date: sending it would make the API
    // rewrite the newest harvest row, silently undoing a pick the moderator just
    // logged in the panel below.
    const { harvest_date, ...editableFields } = form
    const payload = mode === 'edit'
      ? editableFields
      : { ...editableFields, harvest_date }
    // Retail on a server without the wholesale columns sends nothing extra,
    // so an un-migrated environment saves exactly as before.
    const wholesaleBody = wholesaleRequestBody(wholesale, wholesaleReady)

    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        ...payload,
        ...wholesaleBody,
        ...packBody,
        ...reachPayload(form.delivery_mode && form.delivery_mode !== 'pickup' ? reach : { ...reach, reach: 'local' }, initialReach.reach === 'transport'),
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
      await fetch(`/api/moderator/listings/${savedId}/quality`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: form.category || null,
          soil_ph: form.soil_ph ? Number(form.soil_ph) : null,
          pesticide_result: form.pesticide_result.trim() || null,
          image_urls: allImages.length ? allImages : null,
        }),
      }).catch(() => null)
    }

    setSubmitting(false)
    clearDraft(draftK)
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
            onClick={() => { setDone(false); setFarmerId(''); setEmoji('📦'); setForm(EMPTY_LISTING_FORM); setPhotos([]); setWholesale(EMPTY_WHOLESALE_FORM); setRetailPack({ packSize: '', packPrice: '', packTiers: [] }) }}
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
      {/* The form in 4 steps, mirroring the farmer's (2026-11-05; regrouped
          2026-11-10): what you are selling — with shelf life, availability,
          photos and the Story and Quality details subsections — → how do you
          want to sell (retail/wholesale, unit, packs, prices) → how much &
          when → delivery. */}
      <ModStep n={1} title="What are you selling?">
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

      {/* Aggregator sellers only: who actually grows this produce. Sits right
          under the seller, since it only makes sense as a follow-up to it. */}
      {isAggregator && (
        noSourceFarmers ? (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 font-semibold leading-snug">
            This aggregator has no farmers in their list yet. Add them on the aggregator&apos;s
            edit page first — every produce they list has to name one.
          </p>
        ) : (
          <Field label="Farmer who grows this *">
            <select value={form.source_farmer_id} onChange={set('source_farmer_id')} className={inputCls}>
              <option value="">Select a farmer…</option>
              {sourceFarmers.map((r) => (
                <option key={r.id} value={r.id}>{sourceFarmerLabel(r)}</option>
              ))}
            </select>
          </Field>
        )
      )}

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
        <Field label="Category">
          <select value={form.category} onChange={set('category')} className={inputCls}>
            <option value="">Select a category…</option>
            {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Method">
          <select value={form.method} onChange={set('method')} className={inputCls}>
            <option value="natural">Natural (no chemicals)</option>
            <option value="organic">Organic</option>
            <option value="low_chemical">Semi Organic</option>
            <option value="chemical">Chemical</option>
          </select>
        </Field>
      </div>

      {/* Shelf life + availability — part of "what you are selling" since
          2026-11-10, mirroring the farmer's form. The shop reads availability
          to name the next harvest date when the current pick has run out, so
          a moderator-created listing must carry it too. */}
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Shelf life (days) *">
          <input value={form.shelf_life_days} onChange={set('shelf_life_days')} type="number" min="1" step="1" required className={inputCls} placeholder="e.g. 5" />
        </Field>
        <Field label="Available from">
          <input value={form.availability_from} onChange={set('availability_from')} type="date" className={inputCls} />
        </Field>
        <Field label="Available to">
          <input value={form.availability_to} onChange={set('availability_to')} type="date" min={form.availability_from || undefined} className={inputCls} />
        </Field>
        <Field label="Harvesting frequency">
          <select value={form.harvest_frequency} onChange={set('harvest_frequency')} className={inputCls}>
            <option value="">Not set</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </Field>
        {form.harvest_frequency && (
          <Field label="Times per cycle">
            <input value={form.harvest_frequency_count} onChange={set('harvest_frequency_count')} type="number" min="1" step="1" className={inputCls} placeholder="1" />
          </Field>
        )}
      </div>

      {/* Photos */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-extrabold text-green-800 mb-3">Photos</p>
        <PhotoPicker
          photos={photos}
          onChange={setPhotos}
          onError={setError}
          upload={(f) => uploadFarmImage(f, 'produce', farmerId || null).then((r) => r.url)}
        />
      </div>

      <ModSubsection title="Story">
        <Field label="Description">
          <textarea value={form.description} onChange={set('description')} rows={3} className={inputCls} />
        </Field>

        {/* Mirrors the farmer form's video link, so a moderator onboarding a
            farmer can capture it in the same pass. */}
        <Field label="Video link (optional)">
          <input type="url" inputMode="url" placeholder="https://youtube.com/..." value={form.video_url} onChange={set('video_url')} className={inputCls} />
        </Field>
      </ModSubsection>

      {/* Quality details — optional, closed until tapped. Mirrors the farmer's quality fields. */}
      <ModSubsection title="Quality details (optional)" collapsible>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Brix (sweetness)">
            <input value={form.brix} onChange={set('brix')} type="number" min="0" step="0.1" className={inputCls} />
          </Field>
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
      </ModSubsection>
      </ModStep>

      {/* How do you want to sell? (client card 2026-11-10) — the same block as
          the farmer's form (src/components/SellHowFields.tsx). */}
      <ModStep n={2} title="How do you want to sell?">
      {lowStock && (
          <p role="alert" className="text-xs text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl px-3 py-2 font-semibold leading-snug">
            🚚 Wholesale is hidden: only {lowStock.left} {form.unit} left, below the minimum of {lowStock.min} {form.unit}.
            Lower the minimum below, switch to Retail, or add stock under Harvest timings. The farmer sees the same alert.
          </p>
        )}
      <SellHowFields
        wholesale={wholesale}
        onWholesale={setWholesale}
        unit={form.unit}
        onUnit={(u) => setForm((f) => ({ ...f, unit: u }))}
        unitOptions={UNITS.map((u) => ({ value: u, label: u }))}
        retail={retailSell}
        onRetail={onRetailSell}
        L={EN}
        priceError={bothPriceErr?.en ?? null}
      />
      </ModStep>

      <ModStep n={3} title="How much, and when?">
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Stock available">
          <input value={form.stock_qty} onChange={set('stock_qty')} type="number" min="0" step="0.1" className={inputCls} placeholder="e.g. 50" />
        </Field>
        {mode === 'create' && (
          <Field label="First harvest date & time *">
            <input value={form.harvest_date} onChange={set('harvest_date')} type="datetime-local" required className={inputCls} />
          </Field>
        )}
      </div>
      {/* Harvest timings — the same panel the farmer gets inside their Edit
          Harvest form, so a moderator can log many picks against one produce.
          Edit only: a harvest needs a saved produce row to attach to. */}
      {mode === 'edit' && listingId && farmerId && (
        <div className="border-t border-gray-100 pt-4 max-w-md">
          <HarvestManager api="moderator"
            listingId={listingId}
            farmerId={farmerId}
            unit={form.unit}
            produceShelfLife={form.shelf_life_days ? parseInt(form.shelf_life_days, 10) : null}
            sourceFarmerId={initialForm.source_farmer_id || null}
          />
        </div>
      )}

      </ModStep>

      <ModStep n={4} title="Delivery">
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
        {form.delivery_mode && form.delivery_mode !== 'pickup' && (
          <div className="grid grid-cols-2 gap-4 mt-3">
            <Field label="Delivery charge ₹">
              <input value={form.delivery_charge} onChange={set('delivery_charge')} type="number" min="0" className={inputCls} placeholder="e.g. 30" />
            </Field>
            <Field label="Delivery radius (km)">
              <input value={form.delivery_radius_km} onChange={set('delivery_radius_km')} type="number" min="0" className={inputCls} placeholder="e.g. 10" />
            </Field>
          </div>
        )}
        {form.delivery_mode && form.delivery_mode !== 'pickup' && offersRetail(wholesale.saleMode) && (
          <div className="mt-3 max-w-md">
            <RetailReachFields value={reach} onChange={setReach} radiusKm={form.delivery_radius_km} L={EN} />
          </div>
        )}
      </div>

      {/* Wholesale transport — part of Delivery, not of the price (2026-11-05). */}
      <WholesaleFields
        part="transport"
        value={wholesale}
        onChange={setWholesale}
        unit={form.unit}
        L={EN}
        retailPrice={{ value: form.price_tier_1_price, onChange: (v) => setForm((f) => ({ ...f, price_tier_1_price: v })) }}
      />
      </ModStep>

      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 font-semibold">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={submitting} className="bg-green-800 text-white text-sm font-bold px-5 py-3 rounded-xl active:bg-green-900 disabled:opacity-50">
          {submitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add harvest'}
        </button>
        <button type="button" onClick={() => { clearDraft(draftK); router.push('/moderator/listings') }} className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-5 py-3 rounded-xl active:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  )
}

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none'

/** A titled part inside a step (2026-11-10), like the farmer's FormSubsection. */
function ModSubsection({ title, collapsible = false, children }: { title: string; collapsible?: boolean; children: React.ReactNode }) {
  if (collapsible) {
    return (
      <details className="group rounded-xl border border-gray-200 bg-gray-50/60 p-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-green-800">
          {title}
          <span className="ml-auto text-base text-gray-400 transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="mt-4 space-y-4">{children}</div>
      </details>
    )
  }
  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <h4 className="text-xs font-extrabold uppercase tracking-wide text-green-800">{title}</h4>
      {children}
    </div>
  )
}

/** One numbered step of the form (2026-11-05), like the farmer's. */
function ModStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 p-4">
      <h3 className="flex items-center gap-2 text-sm font-extrabold text-gray-900">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-700 text-xs font-bold text-white">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">{label}</span>
      {children}
    </label>
  )
}

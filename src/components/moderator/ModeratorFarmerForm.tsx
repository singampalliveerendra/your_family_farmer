'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import LocationSearch from '@/components/LocationSearch'

export type Created = {
  id: string
  slug: string
  name: string
  phone: string | null
  activation_code: string | null
}

// The full set of editable fields. On create everything starts blank; on edit
// the page passes the farmer's current values.
export type FarmerInitial = {
  name: string
  phone: string
  village: string
  district: string
  method: string
  farm_size_acres: string
  farming_since_year: string
  story_quote: string
  farm_address: string
  upi_id: string
  soil_organic_carbon: string
  bank_account_number: string
  bank_ifsc: string
  pickup_locations: string[]
  cod_enabled: boolean
  lat: number | null
  lng: number | null
  location_name: string
  cover_photo_url: string | null
  photo_url: string | null
  pesticide_cert_url: string | null
  upi_qr_code_url: string | null
}

// Shrink large camera photos before upload so they stay quick on a 4G connection.
async function compressImage(file: File, maxPx = 800, quality = 0.7): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const blobUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(blobUrl)
      const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(file); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          const name = file.name.replace(/\.[^.]+$/, '.jpg')
          resolve(new File([blob], name, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(file) }
    img.src = blobUrl
  })
}

// `file` is a freshly picked image (preview is a blob URL we must revoke);
// `existingUrl` is a photo already saved on the farmer (edit mode). Display
// prefers the new file's preview, falling back to the existing URL.
type PhotoState = { file: File | null; preview: string; existingUrl: string | null }
const emptyPhoto = (url: string | null = null): PhotoState => ({ file: null, preview: '', existingUrl: url })
const photoDisplay = (p: PhotoState) => (p.file ? p.preview : p.existingUrl ?? '')

export function emptyFarmerInitial(): FarmerInitial {
  return {
    name: '', phone: '', village: '', district: '',
    method: 'natural', farm_size_acres: '', farming_since_year: '', story_quote: '',
    farm_address: '', upi_id: '', soil_organic_carbon: '',
    bank_account_number: '', bank_ifsc: '',
    pickup_locations: [], cod_enabled: false,
    lat: null, lng: null, location_name: '',
    cover_photo_url: null, photo_url: null, pesticide_cert_url: null, upi_qr_code_url: null,
  }
}

export default function ModeratorFarmerForm({
  mode,
  farmerId,
  initial,
  onCreated,
  onSaved,
  onCancel,
}: {
  mode: 'create' | 'edit'
  farmerId?: string
  initial: FarmerInitial
  onCreated?: (created: Created) => void
  onSaved?: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    name: initial.name, phone: initial.phone, village: initial.village, district: initial.district,
    method: initial.method, farm_size_acres: initial.farm_size_acres,
    farming_since_year: initial.farming_since_year, story_quote: initial.story_quote,
    farm_address: initial.farm_address, upi_id: initial.upi_id, soil_organic_carbon: initial.soil_organic_carbon,
    bank_account_number: initial.bank_account_number, bank_ifsc: initial.bank_ifsc,
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [pickupLocations, setPickupLocations] = useState<string[]>(initial.pickup_locations)
  const [newPickup, setNewPickup] = useState('')
  const [codEnabled, setCodEnabled] = useState(initial.cod_enabled)

  const [lat, setLat] = useState<number | null>(initial.lat)
  const [lng, setLng] = useState<number | null>(initial.lng)
  const [locationName, setLocationName] = useState(initial.location_name)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')

  const [cover, setCover] = useState<PhotoState>(emptyPhoto(initial.cover_photo_url))
  const [avatar, setAvatar] = useState<PhotoState>(emptyPhoto(initial.photo_url))
  const [cert, setCert] = useState<PhotoState>(emptyPhoto(initial.pesticide_cert_url))
  const [qr, setQr] = useState<PhotoState>(emptyPhoto(initial.upi_qr_code_url))

  const pickPhoto = (set: (p: PhotoState) => void, current: PhotoState) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Please pick an image file.'); return }
    if (file.size > 8 * 1024 * 1024) { setError('Image is too large (max 8 MB).'); return }
    setError('')
    if (current.file && current.preview) URL.revokeObjectURL(current.preview)
    const compressed = await compressImage(file)
    // Picking a new image drops the previously saved URL (it'll be replaced).
    set({ file: compressed, preview: URL.createObjectURL(compressed), existingUrl: null })
  }
  const clearPhoto = (set: (p: PhotoState) => void, current: PhotoState) => () => {
    if (current.file && current.preview) URL.revokeObjectURL(current.preview)
    set(emptyPhoto(null))
  }

  const handleGPS = () => {
    if (!navigator.geolocation) { setLocError('Geolocation not supported on this device.'); return }
    setLocating(true); setLocError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude); setLng(pos.coords.longitude)
        setLocationName(form.village || 'Farm'); setLocating(false)
      },
      (err) => {
        setLocError(err.code === 1
          ? 'Location permission denied. Allow location in browser settings.'
          : 'Could not get location. Please try again.')
        setLocating(false)
      },
      { timeout: 15000, enableHighAccuracy: true },
    )
  }

  const uploadPhoto = async (file: File, folder: string, suffix: string): Promise<string | null> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${folder}/${suffix}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('farm-images')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (upErr) { setError(`Upload failed: ${upErr.message}`); return null }
    return supabase.storage.from('farm-images').getPublicUrl(path).data.publicUrl
  }

  const addPickup = () => {
    const v = newPickup.trim()
    if (!v || pickupLocations.includes(v)) { setNewPickup(''); return }
    setPickupLocations((prev) => [...prev, v]); setNewPickup('')
  }
  const removePickup = (loc: string) => setPickupLocations((prev) => prev.filter((l) => l !== loc))

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)

    // Upload any freshly picked photos; existing photos keep their URL, cleared
    // ones resolve to null. Abort the whole save if an upload fails.
    const folder = mode === 'edit' && farmerId
      ? `farmer-${farmerId}`
      : `onboarding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const resolve = async (p: PhotoState, suffix: string): Promise<{ url: string | null; failed: boolean }> => {
      if (!p.file) return { url: p.existingUrl, failed: false }
      const url = await uploadPhoto(p.file, folder, suffix)
      return { url, failed: url === null }
    }
    const [coverR, avatarR, certR, qrR] = await Promise.all([
      resolve(cover, 'cover'),
      resolve(avatar, 'avatar'),
      resolve(cert, 'pesticide-cert'),
      resolve(qr, 'upi-qr'),
    ])
    if (coverR.failed || avatarR.failed || certR.failed || qrR.failed) {
      setSubmitting(false)
      return // error already set by uploadPhoto
    }

    const payload = {
      ...form,
      pickup_locations: pickupLocations,
      cod_enabled: codEnabled,
      cover_photo_url: coverR.url,
      photo_url: avatarR.url,
      pesticide_cert_url: certR.url,
      upi_qr_code_url: qrR.url,
      lat, lng,
      location_name: lat != null && lng != null ? (locationName || form.village) : null,
    }

    const url = mode === 'edit' && farmerId ? `/api/moderator/farmers/${farmerId}` : '/api/moderator/farmers'
    const method = mode === 'edit' ? 'PATCH' : 'POST'
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    }).catch(() => null)
    setSubmitting(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok || !json?.farmer) { setError(json?.error ?? 'Could not save farmer.'); return }

    if (mode === 'edit') onSaved?.()
    else onCreated?.(json.farmer as Created)
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-5 max-w-2xl space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Full name *">
          <input value={form.name} onChange={set('name')} required className={inputCls} autoFocus />
        </Field>
        <Field label="Phone (WhatsApp)">
          <input value={form.phone} onChange={set('phone')} placeholder="+91 94400 12345" className={inputCls} />
        </Field>
        <Field label="Village">
          <input value={form.village} onChange={set('village')} className={inputCls} />
        </Field>
        <Field label="District">
          <input value={form.district} onChange={set('district')} className={inputCls} />
        </Field>
        <Field label="Farming method">
          <select value={form.method} onChange={set('method')} className={inputCls}>
            <option value="natural">Natural (no chemicals)</option>
            <option value="organic">Organic (certified)</option>
            <option value="low_chemical">Low chemical</option>
            <option value="chemical">Chemical</option>
          </select>
        </Field>
        <Field label="Farm size (acres)">
          <input value={form.farm_size_acres} onChange={set('farm_size_acres')} type="number" step="0.1" className={inputCls} />
        </Field>
        <Field label="Farming since (year)">
          <input value={form.farming_since_year} onChange={set('farming_since_year')} type="number" placeholder="2015" className={inputCls} />
        </Field>
        <Field label="Soil organic carbon (%)">
          <input value={form.soil_organic_carbon} onChange={set('soil_organic_carbon')} type="number" step="0.01" placeholder="e.g. 0.85" className={inputCls} />
        </Field>
      </div>
      <Field label="Story / quote">
        <textarea value={form.story_quote} onChange={set('story_quote')} rows={3} className={inputCls} />
      </Field>

      {/* ── Farm location & photos — mirrors the farmer's own profile ── */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-extrabold text-green-800 mb-3">Farm location &amp; photos</p>

        <div>
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Farm location (GPS)</span>
          <p className="text-[11px] text-gray-500 mb-2">Set the farm location so nearby buyers discover their produce first.</p>
          {lat != null && lng != null ? (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <span className="text-sm font-semibold text-green-800">✓ 📍 {locationName || 'Location set'}</span>
              <button type="button" onClick={() => { setLat(null); setLng(null); setLocationName('') }} className="text-xs text-green-700 underline font-semibold">Change</button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleGPS}
                disabled={locating}
                className="w-full flex items-center justify-center gap-2 bg-green-700 text-white font-bold py-3 rounded-xl text-sm active:bg-green-800 disabled:opacity-50"
              >
                {locating ? 'Getting location…' : '📍 Use GPS (most accurate)'}
              </button>
              <div className="flex items-center gap-2">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-[10px] text-gray-400 font-semibold">OR</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>
              <LocationSearch
                placeholder="Search farm location"
                onSelect={(la, ln, nm) => { setLat(la); setLng(ln); setLocationName(nm) }}
              />
            </div>
          )}
          {locError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mt-2">{locError}</p>}
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div>
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Farm cover photo</span>
            <PhotoUpload preview={photoDisplay(cover)} onPick={pickPhoto(setCover, cover)} onClear={clearPhoto(setCover, cover)} aspectClass="aspect-[3/1]" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Farmer photo</span>
            <PhotoUpload preview={photoDisplay(avatar)} onPick={pickPhoto(setAvatar, avatar)} onClear={clearPhoto(setAvatar, avatar)} aspectClass="aspect-square max-w-[120px]" />
          </div>
        </div>

        <div className="mt-4">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Pesticide-free / certification photo (optional)</span>
          <PhotoUpload preview={photoDisplay(cert)} onPick={pickPhoto(setCert, cert)} onClear={clearPhoto(setCert, cert)} aspectClass="aspect-[3/2] max-w-[200px]" />
        </div>
      </div>

      {/* ── Pickup & payout — mirrors the farmer's own profile ── */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-extrabold text-green-800 mb-3">Pickup &amp; payment</p>

        <Field label="Farm address (for pickup)">
          <textarea value={form.farm_address} onChange={set('farm_address')} rows={2} className={inputCls} placeholder="House / street, landmark, village" />
        </Field>

        <div className="mt-4">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Pickup locations</span>
          <div className="flex gap-2">
            <input
              value={newPickup}
              onChange={(e) => setNewPickup(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPickup() } }}
              placeholder="e.g. Market road junction"
              className={inputCls}
            />
            <button type="button" onClick={addPickup} className="bg-green-700 text-white text-sm font-bold px-4 rounded-xl active:bg-green-800 whitespace-nowrap">Add</button>
          </div>
          {pickupLocations.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {pickupLocations.map((loc) => (
                <span key={loc} className="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-800 text-xs font-semibold px-2.5 py-1 rounded-full">
                  {loc}
                  <button type="button" onClick={() => removePickup(loc)} className="text-green-500 text-sm leading-none">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <Field label="UPI ID (for payouts)">
            <input value={form.upi_id} onChange={set('upi_id')} placeholder="name@ybl" className={inputCls} />
          </Field>
          <label className="flex items-center gap-2 mt-6">
            <input type="checkbox" checked={codEnabled} onChange={(e) => setCodEnabled(e.target.checked)} className="w-4 h-4 accent-green-700" />
            <span className="text-sm font-semibold text-gray-700">Accepts Cash on Delivery</span>
          </label>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <Field label="Bank account number">
            <input value={form.bank_account_number} onChange={set('bank_account_number')} inputMode="numeric" placeholder="Account number" className={inputCls} />
          </Field>
          <Field label="IFSC code">
            <input value={form.bank_ifsc} onChange={set('bank_ifsc')} placeholder="SBIN0001234" className={`${inputCls} uppercase`} />
          </Field>
        </div>

        <div className="mt-4">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">UPI QR code</span>
          <p className="text-[11px] text-gray-500 mb-2">Buyers scan this to pay. Upload a screenshot of their UPI QR.</p>
          <PhotoUpload preview={photoDisplay(qr)} onPick={pickPhoto(setQr, qr)} onClear={clearPhoto(setQr, qr)} aspectClass="aspect-square max-w-[160px]" />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 font-semibold">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting}
          className="bg-green-800 text-white text-sm font-bold px-5 py-3 rounded-xl active:bg-green-900 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Register farmer'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-5 py-3 rounded-xl active:bg-gray-50"
        >
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

function PhotoUpload({
  preview,
  onPick,
  onClear,
  aspectClass,
}: {
  preview: string
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClear: () => void
  aspectClass: string
}) {
  if (preview) {
    return (
      <div className={`relative ${aspectClass} rounded-xl overflow-hidden border border-gray-200 bg-gray-50`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="" className="w-full h-full object-cover" />
        <button
          type="button"
          onClick={onClear}
          className="absolute top-2 right-2 bg-white/90 text-gray-700 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold shadow"
        >
          ×
        </button>
      </div>
    )
  }
  return (
    <label className="flex items-center justify-center gap-2 border-2 border-dashed border-green-300 rounded-xl py-4 px-2 text-green-700 text-xs font-bold cursor-pointer active:bg-green-50">
      <span>📷</span> Add photo
      <input type="file" accept="image/*" onChange={onPick} className="hidden" />
    </label>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LocationSearch from '@/components/LocationSearch'
import ModeratorShell, { useModeratorAuth } from '../../ModeratorShell'

type Created = { id: string; slug: string; name: string; phone: string | null }

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

type PhotoState = { file: File | null; preview: string }
const EMPTY_PHOTO: PhotoState = { file: null, preview: '' }

export default function NewFarmerPage() {
  const router = useRouter()
  const { zone, checked } = useModeratorAuth()

  const EMPTY_FORM = {
    name: '', phone: '', village: '', district: '',
    method: 'natural', farm_size_acres: '', farming_since_year: '', story_quote: '',
    farm_address: '', upi_id: '',
  }
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)

  // Pickup & payout details (same shape as the farmer's own profile editor).
  const [pickupLocations, setPickupLocations] = useState<string[]>([])
  const [newPickup, setNewPickup] = useState('')
  const [codEnabled, setCodEnabled] = useState(false)

  // Farm GPS location (same as the farmer's own profile editor).
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [locationName, setLocationName] = useState('')
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')

  // Photos: cover, avatar, pesticide cert, UPI QR.
  const [cover, setCover] = useState<PhotoState>(EMPTY_PHOTO)
  const [avatar, setAvatar] = useState<PhotoState>(EMPTY_PHOTO)
  const [cert, setCert] = useState<PhotoState>(EMPTY_PHOTO)
  const [qr, setQr] = useState<PhotoState>(EMPTY_PHOTO)

  const resetAll = () => {
    setForm(EMPTY_FORM)
    setPickupLocations([]); setNewPickup('')
    setCodEnabled(false)
    setLat(null); setLng(null); setLocationName(''); setLocError('')
    for (const p of [cover, avatar, cert, qr]) if (p.preview) URL.revokeObjectURL(p.preview)
    setCover(EMPTY_PHOTO); setAvatar(EMPTY_PHOTO); setCert(EMPTY_PHOTO); setQr(EMPTY_PHOTO)
  }

  const pickPhoto = (set: (p: PhotoState) => void, current: PhotoState) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Please pick an image file.'); return }
    if (file.size > 8 * 1024 * 1024) { setError('Image is too large (max 8 MB).'); return }
    setError('')
    if (current.preview) URL.revokeObjectURL(current.preview)
    const compressed = await compressImage(file)
    set({ file: compressed, preview: URL.createObjectURL(compressed) })
  }
  const clearPhoto = (set: (p: PhotoState) => void, current: PhotoState) => () => {
    if (current.preview) URL.revokeObjectURL(current.preview)
    set(EMPTY_PHOTO)
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

  // Upload one photo to the shared farm-images bucket. The farmer row doesn't
  // exist yet, so namespace under a temp folder generated for this onboarding.
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

    // Upload any chosen photos first; abort the whole save if an upload fails.
    const folder = `onboarding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [coverUrl, avatarUrl, certUrl, qrUrl] = await Promise.all([
      cover.file ? uploadPhoto(cover.file, folder, 'cover') : Promise.resolve(null),
      avatar.file ? uploadPhoto(avatar.file, folder, 'avatar') : Promise.resolve(null),
      cert.file ? uploadPhoto(cert.file, folder, 'pesticide-cert') : Promise.resolve(null),
      qr.file ? uploadPhoto(qr.file, folder, 'upi-qr') : Promise.resolve(null),
    ])
    if ((cover.file && !coverUrl) || (avatar.file && !avatarUrl) || (cert.file && !certUrl) || (qr.file && !qrUrl)) {
      setSubmitting(false)
      return // error already set by uploadPhoto
    }

    const r = await fetch('/api/moderator/farmers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        ...form,
        pickup_locations: pickupLocations,
        cod_enabled: codEnabled,
        cover_photo_url: coverUrl,
        photo_url: avatarUrl,
        pesticide_cert_url: certUrl,
        upi_qr_code_url: qrUrl,
        lat, lng,
        location_name: lat != null && lng != null ? (locationName || form.village) : null,
      }),
    }).catch(() => null)
    setSubmitting(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok || !json?.farmer) { setError(json?.error ?? 'Could not save farmer.'); return }
    setCreated(json.farmer as Created)
  }

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  // Success screen with profile link + WhatsApp share.
  if (created) {
    const profileUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/farmer/${created.slug}`
    const digits = (created.phone ?? '').replace(/\D/g, '')
    const waPhone = digits.length === 10 ? `91${digits}` : digits
    const waText = encodeURIComponent(`Your farm page is live: ${profileUrl}`)
    const waLink = `https://wa.me/${waPhone}?text=${waText}`

    return (
      <ModeratorShell title="Farmer added" zone={zone}>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-md">
          <div className="text-4xl mb-2">✅</div>
          <h2 className="text-lg font-extrabold text-gray-900">{created.name} is registered</h2>
          <p className="text-sm text-gray-500 mt-1">Their profile page is live:</p>
          <a href={`/farmer/${created.slug}`} target="_blank" className="block text-green-700 underline text-sm mt-1 break-all">{profileUrl}</a>

          <div className="flex flex-col gap-2 mt-5">
            {waPhone && (
              <a
                href={waLink}
                target="_blank"
                className="bg-green-600 text-white text-sm font-bold px-4 py-3 rounded-xl text-center active:bg-green-700"
              >
                Share via WhatsApp
              </a>
            )}
            <button
              onClick={() => { setCreated(null); resetAll() }}
              className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-3 rounded-xl active:bg-gray-50"
            >
              + Add another farmer
            </button>
            <button
              onClick={() => router.push('/moderator/farmers')}
              className="text-gray-500 text-sm underline"
            >
              Back to farmer list
            </button>
          </div>
        </div>
      </ModeratorShell>
    )
  }

  return (
    <ModeratorShell title="Register new farmer" subtitle="Onboard a farmer on their behalf" zone={zone}>
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
              <PhotoUpload preview={cover.preview} onPick={pickPhoto(setCover, cover)} onClear={clearPhoto(setCover, cover)} aspectClass="aspect-[3/1]" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Farmer photo</span>
              <PhotoUpload preview={avatar.preview} onPick={pickPhoto(setAvatar, avatar)} onClear={clearPhoto(setAvatar, avatar)} aspectClass="aspect-square max-w-[120px]" />
            </div>
          </div>

          <div className="mt-4">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Pesticide-free / certification photo</span>
            <PhotoUpload preview={cert.preview} onPick={pickPhoto(setCert, cert)} onClear={clearPhoto(setCert, cert)} aspectClass="aspect-[3/2] max-w-[200px]" />
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

          <div className="mt-4">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">UPI QR code</span>
            <p className="text-[11px] text-gray-500 mb-2">Buyers scan this to pay. Upload a screenshot of their UPI QR.</p>
            <PhotoUpload preview={qr.preview} onPick={pickPhoto(setQr, qr)} onClear={clearPhoto(setQr, qr)} aspectClass="aspect-square max-w-[160px]" />
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
            {submitting ? 'Saving…' : 'Save & share profile link'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/moderator/farmers')}
            className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-5 py-3 rounded-xl active:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </ModeratorShell>
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

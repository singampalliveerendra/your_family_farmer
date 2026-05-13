'use client'

import { useState } from 'react'
import Link from 'next/link'
import { compressImage } from '@/lib/imageCompress'

const VEHICLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'bike', label: 'Motorbike / బైక్' },
  { value: 'scooter', label: 'Scooter / స్కూటర్' },
  { value: 'cycle', label: 'Bicycle / సైకిల్' },
  { value: 'auto', label: 'Auto / ఆటో' },
  { value: 'other', label: 'Other / ఇతరం' },
]

export default function RiderSignupPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [altPhone, setAltPhone] = useState('')
  const [password, setPassword] = useState('')
  const [vehicleType, setVehicleType] = useState('bike')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [serviceAreas, setServiceAreas] = useState('')
  const [servicePincodes, setServicePincodes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0]
    e.target.value = ''
    if (!raw) return
    if (!raw.type.startsWith('image/')) {
      setError('Please pick an image (JPG/PNG/WEBP).')
      return
    }
    if (raw.size > 12 * 1024 * 1024) {
      setError('Image too large (max 12MB before compression).')
      return
    }
    setError('')
    if (preview) URL.revokeObjectURL(preview)
    const compressed = await compressImage(raw, 1400, 0.75)
    setFile(compressed)
    setPreview(URL.createObjectURL(compressed))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    if (!file) { setError('Attach a photo of your ID proof.'); return }
    setError('')
    setSubmitting(true)
    const fd = new FormData()
    fd.append('name', name)
    fd.append('phone', phone)
    fd.append('alt_phone', altPhone)
    fd.append('password', password)
    fd.append('vehicle_type', vehicleType)
    fd.append('vehicle_number', vehicleNumber)
    fd.append('service_areas', serviceAreas)
    fd.append('service_pincodes', servicePincodes)
    fd.append('file', file)
    const r = await fetch('/api/rider/register', {
      method: 'POST',
      body: fd,
      credentials: 'same-origin',
    }).catch(() => null)
    setSubmitting(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok || !json?.ok) { setError(json?.error ?? 'Sign-up failed.'); return }
    setDone(true)
  }

  if (done) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-green-900 px-4 pt-8 pb-12">
          <h1 className="text-white text-2xl font-extrabold">Account created</h1>
          <p className="text-green-300 text-sm mt-1">ఖాతా సృష్టించబడింది</p>
        </div>
        <div className="bg-white rounded-2xl shadow-md mx-4 -mt-6 p-6 space-y-3 max-w-md w-full mx-auto text-center">
          <div className="text-5xl">✅</div>
          <p className="font-extrabold text-gray-900">You&apos;re all set!</p>
          <p className="text-sm text-gray-600 leading-snug">
            Log in with your phone and password to start picking deliveries.
          </p>
          <p className="text-xs text-gray-500 leading-snug">
            మీ ఫోన్ మరియు పాస్‌వర్డ్‌తో లాగిన్ అవ్వండి.
          </p>
          <div className="pt-4">
            <Link
              href="/rider/login"
              className="block w-full bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm active:bg-green-800"
            >
              Log in / లాగిన్
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      <div className="bg-green-900 px-4 pt-8 pb-12">
        <h1 className="text-white text-2xl font-extrabold">Become a delivery partner</h1>
        <p className="text-green-300 text-sm mt-1">డెలివరీ పార్ట్నర్ కావాలంటే</p>
      </div>

      <form
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-md mx-4 -mt-6 p-5 space-y-4 max-w-md w-full mx-auto"
      >
        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            Your full name / మీ పూర్తి పేరు
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            Phone (primary) / ఫోన్ నంబర్
          </label>
          <div className="flex gap-2">
            <span className="flex items-center px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium">
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
              placeholder="9876543210"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
              required
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            Alternate phone (optional) / ప్రత్యామ్నాయ నంబర్
          </label>
          <div className="flex gap-2">
            <span className="flex items-center px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium">
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              value={altPhone}
              onChange={(e) => setAltPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            Set a password / పాస్‌వర్డ్
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
            required
          />
          <p className="text-[11px] text-gray-500 mt-1">At least 6 characters.</p>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            Vehicle type / వాహనం రకం
          </label>
          <select
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-white focus:border-green-500 focus:outline-none"
          >
            {VEHICLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            Vehicle number / వాహన నంబర్
          </label>
          <input
            type="text"
            value={vehicleNumber}
            onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
            placeholder="AP09 AB 1234"
            maxLength={20}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none uppercase"
            required
          />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            Areas you can deliver to / డెలివరీ చేసే ప్రాంతాలు
          </label>
          <textarea
            value={serviceAreas}
            onChange={(e) => setServiceAreas(e.target.value)}
            placeholder="Anand Nagar, Gandhi Street, Market Road"
            rows={3}
            maxLength={400}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none resize-none"
            required
          />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            Pincodes you cover / మీరు కవర్ చేసే పిన్‌కోడ్‌లు
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={servicePincodes}
            onChange={(e) => setServicePincodes(e.target.value)}
            placeholder="522001, 522002, 522003"
            maxLength={200}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
            required
          />
          <p className="text-[11px] text-gray-500 mt-1 leading-snug">
            6-digit pincodes separated by commas. You&apos;ll only see deliveries to these areas.<br />
            కామాతో వేరు చేసిన 6-అంకెల పిన్‌కోడ్‌లు. ఈ ప్రాంతాల డెలివరీలు మాత్రమే మీకు చూపుతాము.
          </p>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
            ID proof photo (Aadhaar / DL) / గుర్తింపు కార్డు
          </label>
          {preview ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="ID proof" className="w-full max-h-56 object-contain rounded-xl border border-gray-200 bg-gray-50" />
              <label className="text-xs font-bold text-blue-700 underline cursor-pointer">
                Change photo
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePickFile} />
              </label>
            </div>
          ) : (
            <label className="w-full bg-white border-2 border-dashed border-gray-300 text-gray-700 font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer active:bg-gray-50">
              📎 Attach ID photo / గుర్తింపు పత్రం
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePickFile} />
            </label>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 font-semibold">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-green-700 text-white font-bold py-4 rounded-xl text-base active:bg-green-800 disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit application / దరఖాస్తు చేయండి'}
        </button>

        <div className="text-xs text-gray-600 text-center pt-2">
          Already have an account?{' '}
          <Link href="/rider/login" className="text-green-700 font-bold underline">Log in</Link>
        </div>
      </form>
    </main>
  )
}

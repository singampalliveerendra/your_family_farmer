'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ModeratorShell, { useModeratorAuth } from '../../ModeratorShell'

type Created = { id: string; slug: string; name: string; phone: string | null }

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
  const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const [pickupLocations, setPickupLocations] = useState<string[]>([])
  const [newPickup, setNewPickup] = useState('')
  const [slotDays, setSlotDays] = useState<string[]>([])
  const [slotFrom, setSlotFrom] = useState('08:00')
  const [slotTo, setSlotTo] = useState('12:00')
  const [codEnabled, setCodEnabled] = useState(false)

  const resetAll = () => {
    setForm(EMPTY_FORM)
    setPickupLocations([]); setNewPickup('')
    setSlotDays([]); setSlotFrom('08:00'); setSlotTo('12:00')
    setCodEnabled(false)
  }

  const addPickup = () => {
    const v = newPickup.trim()
    if (!v || pickupLocations.includes(v)) { setNewPickup(''); return }
    setPickupLocations((prev) => [...prev, v]); setNewPickup('')
  }
  const removePickup = (loc: string) => setPickupLocations((prev) => prev.filter((l) => l !== loc))
  const toggleDay = (d: string) =>
    setSlotDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    const r = await fetch('/api/moderator/farmers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        ...form,
        pickup_locations: pickupLocations,
        pickup_slots: slotDays.length > 0 ? { days: slotDays, time_from: slotFrom, time_to: slotTo } : null,
        cod_enabled: codEnabled,
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

          <div className="mt-4">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Pickup days</span>
            <div className="flex flex-wrap gap-2">
              {ALL_DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
                    slotDays.includes(d) ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
            {slotDays.length > 0 && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="From">
                  <input type="time" value={slotFrom} onChange={(e) => setSlotFrom(e.target.value)} className={inputCls} />
                </Field>
                <Field label="To">
                  <input type="time" value={slotTo} onChange={(e) => setSlotTo(e.target.value)} className={inputCls} />
                </Field>
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

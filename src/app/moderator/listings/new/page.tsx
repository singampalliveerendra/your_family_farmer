'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ModeratorShell, { useModeratorAuth } from '../../ModeratorShell'

type FarmerOption = { id: string; name: string; village: string | null }

const EMOJIS = ['📦', '🍅', '🥬', '🥕', '🧅', '🥔', '🍆', '🌶️', '🥭', '🍌', '🍋', '🥥', '🌽', '🫛']
const UNITS = ['kg', 'g', 'litre', 'dozen', 'piece', 'bunch']

export default function NewListingPage() {
  const router = useRouter()
  const { zone, checked } = useModeratorAuth()

  const [farmers, setFarmers] = useState<FarmerOption[]>([])
  const [loadingFarmers, setLoadingFarmers] = useState(true)

  const [farmerId, setFarmerId] = useState('')
  const [emoji, setEmoji] = useState('📦')
  const [form, setForm] = useState({
    name: '', variety: '', method: 'natural', unit: 'kg',
    stock_qty: '', description: '', brix: '',
    price_tier_1_qty: '1', price_tier_1_price: '',
    price_tier_2_qty: '', price_tier_2_price: '',
    harvest_date: '', availability_period: '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    if (!checked) return
    fetch('/api/moderator/farmers', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => setFarmers((j.farmers ?? []).map((f: { id: string; name: string; village: string | null }) => ({ id: f.id, name: f.name, village: f.village }))))
      .catch(() => setError('Could not load farmers.'))
      .finally(() => setLoadingFarmers(false))
  }, [checked])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    if (!farmerId) { setError('Choose a farmer.'); return }
    if (!form.name.trim()) { setError('Produce name is required.'); return }
    setError(''); setSubmitting(true)
    const r = await fetch('/api/moderator/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ ...form, farmer_id: farmerId, emoji }),
    }).catch(() => null)
    setSubmitting(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not add produce.'); return }
    setDone(true)
  }

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  if (done) {
    const farmer = farmers.find((f) => f.id === farmerId)
    return (
      <ModeratorShell title="Produce added" zone={zone}>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-md">
          <div className="text-4xl mb-2">✅</div>
          <h2 className="text-lg font-extrabold text-gray-900">{form.name} is live</h2>
          <p className="text-sm text-gray-500 mt-1">Added for {farmer?.name ?? 'the farmer'} and visible to buyers now.</p>
          <div className="flex flex-col gap-2 mt-5">
            <button
              onClick={() => {
                setDone(false); setFarmerId(''); setEmoji('📦')
                setForm({ name: '', variety: '', method: 'natural', unit: 'kg', stock_qty: '', description: '', brix: '', price_tier_1_qty: '1', price_tier_1_price: '', price_tier_2_qty: '', price_tier_2_price: '', harvest_date: '', availability_period: '' })
              }}
              className="bg-green-800 text-white text-sm font-bold px-4 py-3 rounded-xl active:bg-green-900"
            >
              + Add another
            </button>
            <button onClick={() => router.push('/moderator/listings')} className="text-gray-500 text-sm underline">Back to listings</button>
          </div>
        </div>
      </ModeratorShell>
    )
  }

  return (
    <ModeratorShell title="Add produce" subtitle="List a product on a farmer's behalf" zone={zone}>
      <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-5 max-w-2xl space-y-4">
        <Field label="Farmer *">
          {loadingFarmers ? (
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
          <p className="text-[11px] text-gray-400 mt-1">📦 = Other — use for any produce without its own icon.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Produce name *">
            <input value={form.name} onChange={set('name')} required className={inputCls} placeholder="Tomato" />
          </Field>
          <Field label="Variety">
            <input value={form.variety} onChange={set('variety')} className={inputCls} placeholder="Country / Hybrid" />
          </Field>
          <Field label="Method">
            <select value={form.method} onChange={set('method')} className={inputCls}>
              <option value="natural">Natural (no chemicals)</option>
              <option value="low_chemical">Semi Organic</option>
              <option value="chemical">Chemical</option>
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
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Availability period">
            <input value={form.availability_period} onChange={set('availability_period')} className={inputCls} placeholder="e.g. Next 2 weeks" />
          </Field>
        </div>

        <Field label="Description">
          <textarea value={form.description} onChange={set('description')} rows={3} className={inputCls} />
        </Field>

        {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 font-semibold">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={submitting} className="bg-green-800 text-white text-sm font-bold px-5 py-3 rounded-xl active:bg-green-900 disabled:opacity-50">
            {submitting ? 'Saving…' : 'Add produce'}
          </button>
          <button type="button" onClick={() => router.push('/moderator/listings')} className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-5 py-3 rounded-xl active:bg-gray-50">
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

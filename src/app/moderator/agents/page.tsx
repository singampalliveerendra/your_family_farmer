'use client'

import { useCallback, useEffect, useState } from 'react'
import ModeratorShell, { useModeratorAuth } from '../ModeratorShell'

type Agent = {
  id: string
  name: string
  phone: string
  vehicle_type: string | null
  delivery_area: string | null
  availability: string[] | null
  active: boolean
  has_id: boolean
  created_at: string
}

const VEHICLE_OPTIONS = [
  { value: 'bike', label: 'Bike' },
  { value: 'scooter', label: 'Scooter' },
  { value: 'cycle', label: 'Cycle' },
  { value: 'auto', label: 'Auto' },
  { value: 'other', label: 'Other' },
]
const VEHICLE_LABEL: Record<string, string> = Object.fromEntries(VEHICLE_OPTIONS.map((v) => [v.value, v.label]))

const AVAILABILITY_OPTIONS = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'weekends', label: 'Weekends' },
]
const AVAIL_LABEL: Record<string, string> = Object.fromEntries(AVAILABILITY_OPTIONS.map((a) => [a.value, a.label]))

export default function ModeratorAgentsPage() {
  const { zone, checked } = useModeratorAuth()
  const [items, setItems] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/moderator/agents', { credentials: 'same-origin' }).catch(() => null)
    setLoading(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load agents.'); return }
    setItems((json.agents ?? []) as Agent[])
  }, [])

  useEffect(() => { if (checked) void load() }, [checked, load])

  const toggleActive = async (a: Agent) => {
    if (busyId) return
    setBusyId(a.id)
    const r = await fetch(`/api/moderator/agents/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ active: !a.active }),
    }).catch(() => null)
    setBusyId(null)
    if (!r || !r.ok) {
      const j = r ? await r.json().catch(() => ({})) : {}
      setError(j?.error ?? 'Update failed.'); return
    }
    setItems((list) => list.map((it) => (it.id === a.id ? { ...it, active: !a.active } : it)))
  }

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  const activeCount = items.filter((a) => a.active).length

  return (
    <ModeratorShell title="Delivery agents" subtitle="Local agents who deliver farm harvests in your zone" zone={zone}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
          {activeCount} active · {items.length} total
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-green-800 text-white text-sm font-bold px-4 py-2 rounded-xl active:bg-green-900"
        >
          + Add agent
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold mb-4">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
          <div className="text-5xl mb-3">🛵</div>
          <p className="font-semibold text-gray-500 text-sm">No delivery agents yet</p>
          <p className="text-xs text-gray-400 mt-1">Recruit a bike owner or anyone who wants to earn by delivering harvests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className={`bg-white rounded-2xl border p-4 shadow-sm ${a.active ? 'border-gray-100' : 'border-gray-200 opacity-70'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900 text-sm">{a.name}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${a.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {a.active ? 'Active' : 'Inactive'}
                    </span>
                    {a.has_id && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">ID on file ✓</span>
                    )}
                  </div>
                  <a href={`tel:+91${a.phone}`} className="text-xs text-green-700 mt-0.5 inline-block">+91 {a.phone}</a>
                  <div className="flex items-center gap-2 flex-wrap mt-1.5 text-[11px] text-gray-500">
                    {a.vehicle_type && <span className="bg-gray-100 px-2 py-0.5 rounded-full">{VEHICLE_LABEL[a.vehicle_type] ?? a.vehicle_type}</span>}
                    {(a.availability ?? []).map((slot) => (
                      <span key={slot} className="bg-gray-100 px-2 py-0.5 rounded-full">{AVAIL_LABEL[slot] ?? slot}</span>
                    ))}
                  </div>
                  {a.delivery_area && <p className="text-[11px] text-gray-400 mt-1">Covers: {a.delivery_area}</p>}
                </div>
                <button
                  onClick={() => toggleActive(a)}
                  disabled={busyId === a.id}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap disabled:opacity-50 ${
                    a.active
                      ? 'bg-white border border-gray-200 text-gray-600 active:bg-gray-50'
                      : 'bg-green-700 text-white active:bg-green-800'
                  }`}
                >
                  {a.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddAgentModal
          onClose={() => setShowAdd(false)}
          onAdded={(agent) => { setItems((list) => [agent, ...list]); setShowAdd(false) }}
        />
      )}
    </ModeratorShell>
  )
}

function AddAgentModal({ onClose, onAdded }: { onClose: () => void; onAdded: (a: Agent) => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [aadhaar, setAadhaar] = useState('')
  const [vehicleType, setVehicleType] = useState('bike')
  const [deliveryArea, setDeliveryArea] = useState('')
  const [availability, setAvailability] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const toggleSlot = (slot: string) =>
    setAvailability((cur) => (cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot]))

  const submit = async () => {
    if (!name.trim()) { setErr('Enter the agent name.'); return }
    if (phone.replace(/\D/g, '').length < 10) { setErr('Enter a valid 10-digit phone.'); return }
    const aadhaarDigits = aadhaar.replace(/\D/g, '')
    if (aadhaarDigits && aadhaarDigits.length !== 12) { setErr('Aadhaar must be 12 digits (or leave it blank).'); return }
    setSaving(true); setErr('')
    const r = await fetch('/api/moderator/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim(),
        aadhaar: aadhaarDigits,
        vehicle_type: vehicleType,
        delivery_area: deliveryArea.trim(),
        availability,
      }),
    }).catch(() => null)
    setSaving(false)
    if (!r || !r.ok) { const j = r ? await r.json().catch(() => ({})) : {}; setErr(j?.error ?? 'Could not save.'); return }
    const j = await r.json()
    onAdded(j.agent as Agent)
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold text-gray-900 mb-1">Add a delivery agent</p>
        <p className="text-xs text-gray-500 mb-3">Aadhaar is optional and stored only as a one-way hash — never the plain number.</p>
        {err && <p className="text-xs text-red-600 mb-2">{err}</p>}

        <label className="block text-xs font-semibold text-gray-500 mb-1">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ramesh K" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:border-green-500" />

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" placeholder="9876543210" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Aadhaar <span className="text-gray-300">(optional)</span></label>
            <input value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} inputMode="numeric" placeholder="12 digits" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>

        <label className="block text-xs font-semibold text-gray-500 mb-1">Vehicle</label>
        <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-3">
          {VEHICLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label className="block text-xs font-semibold text-gray-500 mb-1">Delivery area <span className="text-gray-300">(optional)</span></label>
        <input value={deliveryArea} onChange={(e) => setDeliveryArea(e.target.value)} placeholder="e.g. Tadepalligudem town, Nidadavole road" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-3" />

        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Availability</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {AVAILABILITY_OPTIONS.map((slot) => {
            const on = availability.includes(slot.value)
            return (
              <button
                key={slot.value}
                type="button"
                onClick={() => toggleSlot(slot.value)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${on ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                {slot.label}
              </button>
            )
          })}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm text-gray-500 px-3 py-2">Cancel</button>
          <button onClick={submit} disabled={saving} className="bg-green-800 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? 'Saving…' : 'Add agent'}
          </button>
        </div>
      </div>
    </div>
  )
}

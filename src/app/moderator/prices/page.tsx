'use client'

import { useCallback, useEffect, useState } from 'react'
import ModeratorShell, { useModeratorAuth } from '../ModeratorShell'

type Price = {
  id: string
  crop_name: string
  region_slug: string
  min_price: number | null
  max_price: number | null
  unit: string
  updated_at: string | null
}

export default function ModeratorPricesPage() {
  const { zone, checked } = useModeratorAuth()
  const [items, setItems] = useState<Price[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  // ids that just saved, for the transient "Saved ✓" tick
  const [savedIds, setSavedIds] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/moderator/prices', { credentials: 'same-origin' }).catch(() => null)
    setLoading(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load prices.'); return }
    setItems((json.prices ?? []) as Price[])
  }, [])

  useEffect(() => { if (checked) void load() }, [checked, load])

  const flashSaved = (id: string) => {
    const stamp = Date.now()
    setSavedIds((s) => ({ ...s, [id]: stamp }))
    setTimeout(() => {
      setSavedIds((s) => (s[id] === stamp ? (() => { const n = { ...s }; delete n[id]; return n })() : s))
    }, 2000)
  }

  // Save one field on blur, only if it actually changed.
  const saveField = async (row: Price, field: 'min_price' | 'max_price', raw: string) => {
    const trimmed = raw.trim()
    const next = trimmed === '' ? null : Number(trimmed)
    const current = row[field]
    if (next === current) return
    if (next != null && (!Number.isFinite(next) || next < 0)) {
      setError('Prices must be non-negative numbers.')
      return
    }
    setError('')
    const r = await fetch(`/api/moderator/prices/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ [field]: trimmed === '' ? null : trimmed }),
    }).catch(() => null)
    if (!r || !r.ok) {
      const j = r ? await r.json().catch(() => ({})) : {}
      setError(j?.error ?? 'Save failed.')
      void load() // revert optimistic edit to the server's truth
      return
    }
    const j = await r.json()
    setItems((list) => list.map((it) => (it.id === row.id ? (j.price as Price) : it)))
    flashSaved(row.id)
  }

  const remove = async (row: Price) => {
    if (!confirm(`Remove the price guideline for ${row.crop_name}?`)) return
    const r = await fetch(`/api/moderator/prices/${row.id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    }).catch(() => null)
    if (!r || !r.ok) {
      const j = r ? await r.json().catch(() => ({})) : {}
      setError(j?.error ?? 'Could not remove.')
      return
    }
    setItems((list) => list.filter((it) => it.id !== row.id))
  }

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <ModeratorShell
      title="Price management"
      subtitle="Suggested price ranges shown as a hint on the farmer listing form"
      zone={zone}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
          {items.length} {items.length === 1 ? 'crop' : 'crops'}
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-green-800 text-white text-sm font-bold px-4 py-2 rounded-xl active:bg-green-900"
        >
          + Add crop
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold mb-4">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
          <div className="text-5xl mb-3">🏷️</div>
          <p className="font-semibold text-gray-500 text-sm">No price guidelines yet</p>
          <p className="text-xs text-gray-400 mt-1">Add a crop to suggest a price range to farmers in your zone.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
          {/* header row (hidden on small screens) */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 text-[11px] font-bold text-gray-400 uppercase tracking-wide">
            <span>Crop</span>
            <span className="w-28 text-center">Min ₹</span>
            <span className="w-28 text-center">Max ₹</span>
            <span className="w-8" />
          </div>
          {items.map((row) => (
            <PriceRow
              key={row.id}
              row={row}
              saved={!!savedIds[row.id]}
              onBlurField={saveField}
              onRemove={remove}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">
        These ranges are guidance only — they appear under the price field when a farmer lists a
        matching crop, but never block them from pricing as they wish.
      </p>

      {showAdd && (
        <AddCropModal
          onClose={() => setShowAdd(false)}
          onAdded={(p) => { setItems((list) => [...list, p].sort((a, b) => a.crop_name.localeCompare(b.crop_name))); setShowAdd(false) }}
        />
      )}
    </ModeratorShell>
  )
}

function PriceRow({
  row,
  saved,
  onBlurField,
  onRemove,
}: {
  row: Price
  saved: boolean
  onBlurField: (row: Price, field: 'min_price' | 'max_price', raw: string) => void
  onRemove: (row: Price) => void
}) {
  const [min, setMin] = useState(row.min_price != null ? String(row.min_price) : '')
  const [max, setMax] = useState(row.max_price != null ? String(row.max_price) : '')

  // Keep local inputs in sync if the server reshapes the row (e.g. after save).
  useEffect(() => { setMin(row.min_price != null ? String(row.min_price) : '') }, [row.min_price])
  useEffect(() => { setMax(row.max_price != null ? String(row.max_price) : '') }, [row.max_price])

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 items-center">
      <div className="min-w-0">
        <p className="font-bold text-gray-900 text-sm truncate">{row.crop_name}</p>
        <p className="text-[11px] text-green-700 h-3.5">{saved ? 'Saved ✓' : ''}</p>
      </div>
      <PriceInput value={min} onChange={setMin} onBlur={() => onBlurField(row, 'min_price', min)} unit={row.unit} />
      <PriceInput value={max} onChange={setMax} onBlur={() => onBlurField(row, 'max_price', max)} unit={row.unit} />
      <button
        onClick={() => onRemove(row)}
        aria-label={`Remove ${row.crop_name}`}
        className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-red-500 rounded-lg"
      >
        ✕
      </button>
    </div>
  )
}

function PriceInput({
  value,
  onChange,
  onBlur,
  unit,
}: {
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  unit: string
}) {
  return (
    <div className="relative w-28">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
      <input
        type="number"
        min="0"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="—"
        className="w-full border border-gray-200 rounded-lg pl-6 pr-2 py-2 text-sm focus:outline-none focus:border-green-500"
      />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-300">/{unit}</span>
    </div>
  )
}

function AddCropModal({ onClose, onAdded }: { onClose: () => void; onAdded: (p: Price) => void }) {
  const [cropName, setCropName] = useState('')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!cropName.trim()) { setErr('Crop name is required.'); return }
    setSaving(true); setErr('')
    const r = await fetch('/api/moderator/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ crop_name: cropName.trim(), min_price: min.trim(), max_price: max.trim() }),
    }).catch(() => null)
    setSaving(false)
    if (!r || !r.ok) { const j = r ? await r.json().catch(() => ({})) : {}; setErr(j?.error ?? 'Could not add.'); return }
    const j = await r.json()
    onAdded(j.price as Price)
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold text-gray-900 mb-1">Add a crop</p>
        <p className="text-xs text-gray-500 mb-3">Set a suggested ₹/kg range. You can edit the numbers any time.</p>
        {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
        <label className="block text-xs font-semibold text-gray-500 mb-1">Crop name</label>
        <input
          value={cropName} onChange={(e) => setCropName(e.target.value)} autoFocus
          placeholder="e.g. Tomato"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:border-green-500"
        />
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Min ₹/kg</label>
            <input type="number" min="0" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="40" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Max ₹/kg</label>
            <input type="number" min="0" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="60" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm text-gray-500 px-3 py-2">Cancel</button>
          <button onClick={submit} disabled={saving} className="bg-green-800 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? 'Adding…' : 'Add crop'}
          </button>
        </div>
      </div>
    </div>
  )
}

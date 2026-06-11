'use client'

import { useState } from 'react'

// Bilingual labels for the complaint categories (matches the moderator side).
const TYPE_OPTIONS = [
  { value: 'quality_complaint', label: 'Quality problem / నాణ్యత సమస్య' },
  { value: 'delivery_delay', label: 'Delivery delay / డెలివరీ ఆలస్యం' },
  { value: 'payment_issue', label: 'Payment / refund issue / చెల్లింపు సమస్య' },
  { value: 'other', label: 'Something else / ఇతర' },
]

/**
 * Shared complaint form for consumers. Pass `presetOrderCode` to pin a complaint
 * to a specific order (the field is then locked); leave it out for a general
 * complaint. "Raised by" is filled server-side from the logged-in account.
 */
export default function ComplaintModal({
  presetOrderCode,
  onClose,
  onCreated,
}: {
  presetOrderCode?: string | null
  onClose: () => void
  onCreated: () => void
}) {
  const [type, setType] = useState('quality_complaint')
  const [description, setDescription] = useState('')
  const [orderCode, setOrderCode] = useState(presetOrderCode ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const locked = Boolean(presetOrderCode)

  const submit = async () => {
    if (!description.trim()) { setErr('Please describe the problem / సమస్యను వివరించండి'); return }
    setSaving(true); setErr('')
    const r = await fetch('/api/consumer/complaints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ type, description: description.trim(), order_code: orderCode.trim() }),
    }).catch(() => null)
    setSaving(false)
    if (!r || !r.ok) {
      const j = r ? await r.json().catch(() => ({})) : {}
      setErr(j?.error ?? 'Could not submit. Try again.')
      return
    }
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-extrabold text-gray-900">Log a complaint / ఫిర్యాదు</p>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none p-1">×</button>
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</p>}

        <label className="block text-xs font-bold text-gray-500 mb-1">Type / రకం</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-green-500"
        >
          {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label className="block text-xs font-bold text-gray-500 mb-1">What happened? / ఏం జరిగింది?</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          autoFocus
          placeholder="e.g. Tomatoes arrived spoiled / ఉదా: టమోటాలు పాడైపోయాయి"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-green-500"
        />

        <label className="block text-xs font-bold text-gray-500 mb-1">
          Order code / ఆర్డర్ కోడ్ <span className="font-normal text-gray-300">(optional)</span>
        </label>
        <input
          value={orderCode}
          onChange={(e) => setOrderCode(e.target.value)}
          readOnly={locked}
          placeholder="YFF-1042"
          className={`w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-4 font-mono focus:outline-none focus:border-green-500 ${locked ? 'bg-gray-50 text-gray-500' : ''}`}
        />

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 border-2 border-gray-200 text-gray-700 font-bold py-3 rounded-xl text-sm active:bg-gray-50"
          >
            Cancel / రద్దు
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 bg-green-700 text-white font-bold py-3 rounded-xl text-sm active:bg-green-800 disabled:opacity-50"
          >
            {saving ? 'Sending… / పంపుతోంది' : 'Submit / సమర్పించండి'}
          </button>
        </div>
      </div>
    </div>
  )
}

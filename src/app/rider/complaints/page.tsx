'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Complaint = {
  id: string
  order_id: string | null
  order_code: string | null
  type: string
  description: string
  status: 'open' | 'in_progress' | 'resolved'
  resolution_notes: string | null
  resolved_at: string | null
  created_at: string
  raised_by_phone: string | null
}

const TYPE_OPTIONS = [
  { value: 'payment_issue', label: 'Payment / payout / చెల్లింపు సమస్య' },
  { value: 'delivery_delay', label: 'Pickup / delivery / పికప్ ఆలస్యం' },
  { value: 'quality_complaint', label: 'Customer / farmer dispute / వివాదం' },
  { value: 'other', label: 'Something else / ఇతర' },
]
const TYPE_LABEL: Record<string, string> = {
  delivery_delay: 'Pickup / delivery',
  quality_complaint: 'Dispute',
  payment_issue: 'Payment issue',
  other: 'Other',
}

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
}
const STATUS_LABEL: Record<string, string> = {
  open: '⏳ Open / తెరిచి ఉంది',
  in_progress: '🛠 In progress / పరిష్కరిస్తున్నారు',
  resolved: '✓ Resolved / పరిష్కరించబడింది',
}

type TabKey = 'active' | 'resolved'

export default function RiderComplaintsPage() {
  const router = useRouter()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<TabKey>('active')
  const [showNew, setShowNew] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    const r = await fetch('/api/rider/complaints', { credentials: 'same-origin' }).catch(() => null)
    if (!r) { setError('Could not load. Check your connection.'); setLoading(false); return }
    if (r.status === 401) { router.replace('/rider/login'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load complaints.'); setLoading(false); return }
    setComplaints((json.complaints ?? []) as Complaint[])
    setLoading(false)
  }, [router])

  useEffect(() => { void refresh() }, [refresh])

  const active = complaints.filter((c) => c.status !== 'resolved')
  const resolved = complaints.filter((c) => c.status === 'resolved')
  const shown = tab === 'active' ? active : resolved

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      <div className="bg-green-900 px-4 pt-6 pb-10">
        <Link href="/rider/dashboard" className="text-green-300 text-sm flex items-center gap-1 mb-4">← Dashboard / డాష్‌బోర్డ్</Link>
        <h1 className="text-white text-xl font-extrabold leading-tight">My complaints / నా ఫిర్యాదులు</h1>
        <p className="text-green-400 text-sm mt-1">Raise an issue with the GoGrameen team / సమస్యను నమోదు చేయండి</p>
      </div>

      <div className="px-4 -mt-5 space-y-4 max-w-lg mx-auto">
        <button
          onClick={() => setShowNew(true)}
          className="w-full bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm active:bg-green-800"
        >
          + Log a new complaint / కొత్త ఫిర్యాదు
        </button>

        {error && <div className="bg-white rounded-2xl border border-red-100 p-4 text-sm text-red-600">{error}</div>}

        <div className="flex border-b border-gray-200">
          {(['active', 'resolved'] as TabKey[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-bold border-b-2 -mb-px ${
                tab === t ? 'border-green-700 text-green-800' : 'border-transparent text-gray-400'
              }`}
            >
              {t === 'active' ? `Active (${active.length})` : `Resolved (${resolved.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-500">Loading… / లోడ్ అవుతోంది</div>
        ) : shown.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-3">{tab === 'active' ? '✅' : '📭'}</div>
            <p className="font-semibold text-gray-500 text-sm">
              {tab === 'active' ? 'No active complaints / ప్రస్తుత ఫిర్యాదులు లేవు' : 'No resolved complaints yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((c) => (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{TYPE_LABEL[c.type] ?? c.type}</span>
                  </div>
                  <span className="text-[11px] text-gray-400 whitespace-nowrap">
                    {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                {c.order_code && <p className="text-[11px] font-mono font-semibold text-gray-400 mt-1.5">Order {c.order_code}</p>}
                <p className="text-sm text-gray-900 mt-1 leading-snug">{c.description}</p>
                {c.raised_by_phone && (
                  <p className="text-[11px] text-gray-400 mt-1.5">📞 Callback number: +91 {c.raised_by_phone}</p>
                )}
                {c.status === 'resolved' && c.resolution_notes && (
                  <div className="mt-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                    <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">Resolution / పరిష్కారం</p>
                    <p className="text-xs text-green-800 mt-0.5 leading-snug">{c.resolution_notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && <NewComplaint onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); void refresh() }} />}
    </main>
  )
}

function NewComplaint({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState('payment_issue')
  const [description, setDescription] = useState('')
  const [orderCode, setOrderCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!description.trim()) { setErr('Please describe the problem / సమస్యను వివరించండి'); return }
    setSaving(true); setErr('')
    const r = await fetch('/api/rider/complaints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ type, description: description.trim(), order_code: orderCode.trim() }),
    }).catch(() => null)
    setSaving(false)
    if (!r || !r.ok) { const j = r ? await r.json().catch(() => ({})) : {}; setErr(j?.error ?? 'Could not submit. Try again.'); return }
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
        <select value={type} onChange={(e) => setType(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-green-500">
          {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label className="block text-xs font-bold text-gray-500 mb-1">What happened? / ఏం జరిగింది?</label>
        <textarea
          value={description} onChange={(e) => setDescription(e.target.value)} rows={4} autoFocus
          placeholder="e.g. Payout for delivery not received / ఉదా: డెలివరీకి చెల్లింపు అందలేదు"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-green-500"
        />

        <label className="block text-xs font-bold text-gray-500 mb-1">Order code / ఆర్డర్ కోడ్ <span className="font-normal text-gray-300">(optional)</span></label>
        <input value={orderCode} onChange={(e) => setOrderCode(e.target.value)} placeholder="YFF-1042" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-4 font-mono focus:outline-none focus:border-green-500" />

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border-2 border-gray-200 text-gray-700 font-bold py-3 rounded-xl text-sm active:bg-gray-50">Cancel / రద్దు</button>
          <button onClick={submit} disabled={saving} className="flex-1 bg-green-700 text-white font-bold py-3 rounded-xl text-sm active:bg-green-800 disabled:opacity-50">
            {saving ? 'Sending… / పంపుతోంది' : 'Submit / సమర్పించండి'}
          </button>
        </div>
      </div>
    </div>
  )
}

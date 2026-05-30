'use client'

import { useCallback, useEffect, useState } from 'react'
import ModeratorShell, { useModeratorAuth } from '../ModeratorShell'

type Escalation = {
  id: string
  order_id: string | null
  order_code: string | null
  type: string
  description: string
  raised_by: string | null
  status: 'open' | 'in_progress' | 'resolved'
  resolution_notes: string | null
  resolved_at: string | null
  created_at: string
}

const TYPE_LABEL: Record<string, string> = {
  delivery_delay: 'Delivery delay',
  quality_complaint: 'Quality complaint',
  payment_issue: 'Payment issue',
  other: 'Other',
}

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-red-100 text-red-600',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function ModeratorEscalationsPage() {
  const { zone, checked } = useModeratorAuth()
  const [items, setItems] = useState<Escalation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [resolving, setResolving] = useState<Escalation | null>(null)
  const [notes, setNotes] = useState('')
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/moderator/escalations', { credentials: 'same-origin' }).catch(() => null)
    setLoading(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load escalations.'); return }
    setItems((json.escalations ?? []) as Escalation[])
  }, [])

  useEffect(() => { if (checked) void load() }, [checked, load])

  const setStatus = async (e: Escalation, status: Escalation['status'], resolution_notes?: string) => {
    if (busyId) return
    setBusyId(e.id)
    const r = await fetch(`/api/moderator/escalations/${e.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ status, resolution_notes }),
    }).catch(() => null)
    setBusyId(null)
    if (!r || !r.ok) {
      const json = r ? await r.json().catch(() => ({})) : {}
      setError(json?.error ?? 'Update failed.'); return
    }
    setResolving(null); setNotes('')
    void load()
  }

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  const open = items.filter((i) => i.status !== 'resolved')
  const resolved = items.filter((i) => i.status === 'resolved')

  return (
    <ModeratorShell title="Escalations" subtitle="Complaints and disputes in your zone" zone={zone}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
          {open.length} open · {resolved.length} resolved
        </p>
        <button
          onClick={() => setShowNew(true)}
          className="bg-green-800 text-white text-sm font-bold px-4 py-2 rounded-xl active:bg-green-900"
        >
          + Log a complaint
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold mb-4">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
          <div className="text-5xl mb-3">✅</div>
          <p className="font-semibold text-gray-500 text-sm">No escalations — all clear</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...open, ...resolved].map((e) => (
            <div key={e.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[e.status]}`}>
                    {e.status === 'in_progress' ? 'In progress' : e.status === 'open' ? 'Open' : 'Resolved'}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {TYPE_LABEL[e.type] ?? e.type}
                  </span>
                </div>
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{timeAgo(e.created_at)}</span>
              </div>

              <p className="font-bold text-gray-900 text-sm mt-2">
                {e.order_code ? `Order #${e.order_code} — ` : ''}{e.description}
              </p>
              {e.raised_by && <p className="text-xs text-gray-500 mt-0.5">Raised by {e.raised_by}</p>}

              {e.status === 'resolved' && e.resolution_notes && (
                <p className="mt-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                  Resolved: {e.resolution_notes}
                </p>
              )}

              {e.status !== 'resolved' && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {e.status === 'open' && (
                    <button
                      onClick={() => setStatus(e, 'in_progress')}
                      disabled={busyId === e.id}
                      className="bg-white border border-amber-200 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-lg active:bg-amber-50 disabled:opacity-50"
                    >
                      Mark in progress
                    </button>
                  )}
                  <button
                    onClick={() => { setResolving(e); setNotes('') }}
                    disabled={busyId === e.id}
                    className="bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg active:bg-green-800 disabled:opacity-50"
                  >
                    Mark resolved
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {resolving && (
        <ModalShell title={`Resolve: ${resolving.description.slice(0, 40)}`} onClose={() => setResolving(null)}>
          <p className="text-xs text-gray-500 mb-2">Note what was done. This is kept on the record.</p>
          <textarea
            value={notes} onChange={(ev) => setNotes(ev.target.value)} rows={3} autoFocus
            placeholder="e.g. Called farmer, re-delivered next morning, consumer satisfied"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-500"
          />
          <div className="flex gap-2 mt-3 justify-end">
            <button onClick={() => setResolving(null)} className="text-sm text-gray-500 px-3 py-2">Cancel</button>
            <button
              onClick={() => setStatus(resolving, 'resolved', notes.trim())}
              disabled={!notes.trim() || busyId === resolving.id}
              className="bg-green-700 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50"
            >
              Mark resolved
            </button>
          </div>
        </ModalShell>
      )}

      {showNew && <NewComplaintModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); void load() }} />}
    </ModeratorShell>
  )
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold text-gray-900 mb-1">{title}</p>
        {children}
      </div>
    </div>
  )
}

const TYPE_OPTIONS = [
  { value: 'delivery_delay', label: 'Delivery delay' },
  { value: 'quality_complaint', label: 'Quality complaint' },
  { value: 'payment_issue', label: 'Payment issue' },
  { value: 'other', label: 'Other' },
]

function NewComplaintModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState('quality_complaint')
  const [description, setDescription] = useState('')
  const [raisedBy, setRaisedBy] = useState('')
  const [orderCode, setOrderCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!description.trim()) { setErr('Describe the complaint.'); return }
    setSaving(true); setErr('')
    const r = await fetch('/api/moderator/escalations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ type, description: description.trim(), raised_by: raisedBy.trim(), order_code: orderCode.trim() }),
    }).catch(() => null)
    setSaving(false)
    if (!r || !r.ok) { const j = r ? await r.json().catch(() => ({})) : {}; setErr(j?.error ?? 'Could not save.'); return }
    onCreated()
  }

  return (
    <ModalShell title="Log a complaint" onClose={onClose}>
      {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
      <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
      <select value={type} onChange={(e) => setType(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-3">
        {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <label className="block text-xs font-semibold text-gray-500 mb-1">What happened?</label>
      <textarea
        value={description} onChange={(e) => setDescription(e.target.value)} rows={3} autoFocus
        placeholder="e.g. Paid ₹360 for tomatoes at 10 AM, nothing arrived by 6 PM"
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:border-green-500"
      />
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Raised by</label>
          <input value={raisedBy} onChange={(e) => setRaisedBy(e.target.value)} placeholder="Ravi Sharma" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Order code <span className="text-gray-300">(optional)</span></label>
          <input value={orderCode} onChange={(e) => setOrderCode(e.target.value)} placeholder="YFF-1042" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-sm text-gray-500 px-3 py-2">Cancel</button>
        <button onClick={submit} disabled={saving} className="bg-green-800 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50">
          {saving ? 'Saving…' : 'Save complaint'}
        </button>
      </div>
    </ModalShell>
  )
}

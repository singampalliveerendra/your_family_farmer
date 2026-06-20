'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ModeratorShell, { useModeratorAuth } from '../ModeratorShell'

type Listing = {
  id: string
  farmer_id: string
  farmer_name: string
  name: string
  variety: string | null
  method: string | null
  unit: string | null
  stock_qty: number | null
  brix: number | null
  price_tier_1_price: number | null
  status: string
  rejection_reason: string | null
  created_at: string
}

type Tab = 'pending' | 'active' | 'rejected'

const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'active', label: 'Active listings' },
  { key: 'rejected', label: 'Rejected / Suspended' },
]

const METHOD_LABEL: Record<string, string> = {
  natural: 'Natural', low_chemical: 'Low chem', chemical: 'Chemical',
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function ModeratorListingsPage() {
  const router = useRouter()
  const { zone, checked } = useModeratorAuth()
  const [tab, setTab] = useState<Tab>('pending')
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<Listing | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback(async (t: Tab) => {
    setLoading(true)
    setError('')
    const r = await fetch(`/api/moderator/listings?tab=${t}`, { credentials: 'same-origin' }).catch(() => null)
    setLoading(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load listings.'); return }
    setListings((json.listings ?? []) as Listing[])
  }, [])

  useEffect(() => { if (checked) void load(tab) }, [checked, tab, load])

  const act = async (l: Listing, action: 'approve' | 'reject' | 'suspend', rejectReason?: string) => {
    if (busyId) return
    setBusyId(l.id)
    const r = await fetch(`/api/moderator/listings/${l.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action, reason: rejectReason }),
    }).catch(() => null)
    setBusyId(null)
    if (!r || !r.ok) {
      const json = r ? await r.json().catch(() => ({})) : {}
      setError(json?.error ?? 'Action failed.')
      return
    }
    // Remove from the current tab — it moved to another status.
    setListings((list) => list.filter((x) => x.id !== l.id))
    setRejecting(null)
    setReason('')
  }

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <ModeratorShell title="Listing management" subtitle="Review, approve or reject farmer produce listings" zone={zone}>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => router.push('/moderator/listings/new')}
          className="bg-green-800 text-white text-sm font-bold px-4 py-2 rounded-xl active:bg-green-900"
        >
          + Add produce
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${
              tab === t.key ? 'border-green-700 text-green-800' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
            {t.key === 'pending' && listings.length > 0 && tab === 'pending' && (
              <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{listings.length}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold mb-4">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
      ) : listings.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
          <div className="text-5xl mb-3">🧺</div>
          <p className="font-semibold text-gray-500 text-sm">
            {tab === 'pending' ? 'No listings waiting for review' : tab === 'active' ? 'No active listings' : 'No rejected or suspended listings'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((l) => (
            <div key={l.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900">
                    {l.name}{l.variety ? ` — ${l.variety}` : ''}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {l.farmer_name} · Submitted {timeAgo(l.created_at)}
                  </p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  l.status === 'pending_review' ? 'bg-amber-100 text-amber-700'
                  : l.status === 'available' ? 'bg-green-100 text-green-700'
                  : l.status === 'rejected' ? 'bg-red-100 text-red-600'
                  : l.status === 'suspended' ? 'bg-orange-100 text-orange-700'
                  : 'bg-gray-100 text-gray-500'
                }`}>
                  {l.status === 'pending_review' ? 'Pending review' : l.status === 'available' ? 'Active' : l.status === 'rejected' ? 'Rejected' : l.status === 'suspended' ? 'Suspended' : l.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
                {l.price_tier_1_price != null && <span>Price: <b>₹{l.price_tier_1_price}/{l.unit || 'kg'}</b></span>}
                {l.stock_qty != null && <span>Stock: <b>{l.stock_qty} {l.unit || 'kg'}</b></span>}
                {l.method && <span>Method: <b>{METHOD_LABEL[l.method] ?? l.method}</b></span>}
                {l.brix != null && <span>BRIX: <b>{l.brix}</b></span>}
              </div>

              {l.status === 'rejected' && l.rejection_reason && (
                <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">Reason: {l.rejection_reason}</p>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 mt-3">
                {l.status === 'pending_review' && (
                  <>
                    <button
                      onClick={() => act(l, 'approve')}
                      disabled={busyId === l.id}
                      className="bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg active:bg-green-800 disabled:opacity-50"
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => { setRejecting(l); setReason('') }}
                      disabled={busyId === l.id}
                      className="bg-white border border-red-200 text-red-600 text-xs font-bold px-3 py-1.5 rounded-lg active:bg-red-50 disabled:opacity-50"
                    >
                      ✕ Reject
                    </button>
                  </>
                )}
                {l.status === 'available' && (
                  <button
                    onClick={() => act(l, 'suspend')}
                    disabled={busyId === l.id}
                    className="bg-red-600 border border-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg active:bg-red-700 disabled:opacity-50"
                  >
                    Suspend
                  </button>
                )}
                {(l.status === 'rejected' || l.status === 'suspended') && (
                  <button
                    onClick={() => act(l, 'approve')}
                    disabled={busyId === l.id}
                    className="bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg active:bg-green-800 disabled:opacity-50"
                  >
                    {l.status === 'suspended' ? 'Re-activate' : 'Approve anyway'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject modal */}
      {rejecting && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-4" onClick={() => setRejecting(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-gray-900">Reject “{rejecting.name}”</p>
            <p className="text-xs text-gray-500 mt-1">The farmer will see this reason. Be specific so they can fix it.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. Price is far above the suggested range for tomatoes"
              className="w-full mt-3 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-500"
            />
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={() => setRejecting(null)} className="text-sm text-gray-500 px-3 py-2">Cancel</button>
              <button
                onClick={() => act(rejecting, 'reject', reason.trim())}
                disabled={!reason.trim() || busyId === rejecting.id}
                className="bg-red-600 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50"
              >
                Reject listing
              </button>
            </div>
          </div>
        </div>
      )}
    </ModeratorShell>
  )
}

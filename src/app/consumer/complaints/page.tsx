'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import LanguageToggle from '@/components/LanguageToggle'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import ComplaintModal from '@/components/consumer/ComplaintModal'

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

const TYPE_LABEL: Record<string, string> = {
  delivery_delay: 'Delivery delay',
  quality_complaint: 'Quality problem',
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

export default function ConsumerComplaintsPage() {
  const { state, openAuth } = useConsumerAuth()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<TabKey>('active')
  const [showNew, setShowNew] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    const r = await fetch('/api/consumer/complaints', { credentials: 'same-origin' }).catch(() => null)
    if (!r) { setError('Could not load. Check your connection.'); setLoading(false); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load complaints.'); setLoading(false); return }
    setComplaints((json.complaints ?? []) as Complaint[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (state.status === 'authenticated') void refresh()
    else if (state.status === 'anonymous') setLoading(false)
  }, [state.status, refresh])

  const active = complaints.filter((c) => c.status !== 'resolved')
  const resolved = complaints.filter((c) => c.status === 'resolved')
  const shown = tab === 'active' ? active : resolved

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-green-900 px-4 pt-6 pb-10">
        <div className="flex items-center justify-between mb-4">
          <Link href="/consumer" className="text-green-300 text-sm flex items-center gap-1">← Back / వెనక్కు</Link>
          <LanguageToggle />
        </div>
        <h1 className="text-white text-xl font-extrabold leading-tight">My complaints / నా ఫిర్యాదులు</h1>
        <p className="text-green-400 text-sm mt-1">Raise an issue and track its status / సమస్యను నమోదు చేసి స్థితిని చూడండి</p>
      </div>

      <div className="px-4 -mt-5 space-y-4 max-w-lg mx-auto">
        {state.status === 'loading' || loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-500">Loading… / లోడ్ అవుతోంది</div>
        ) : state.status === 'anonymous' ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center space-y-4">
            <div className="text-5xl">🔒</div>
            <p className="font-bold text-gray-900">Log in to raise a complaint</p>
            <button onClick={openAuth} className="w-full bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm active:bg-green-800">Log in / లాగిన్</button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setShowNew(true)}
              className="w-full bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm active:bg-green-800"
            >
              + Log a new complaint / కొత్త ఫిర్యాదు
            </button>

            {error && (
              <div className="bg-white rounded-2xl border border-red-100 p-4 text-sm text-red-600">{error}</div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              {(['active', 'resolved'] as TabKey[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 text-sm font-bold border-b-2 -mb-px ${
                    tab === t ? 'border-green-700 text-green-800' : 'border-transparent text-gray-400'
                  }`}
                >
                  {t === 'active' ? `Active / ప్రస్తుత (${active.length})` : `Resolved / పరిష్కరించబడింది (${resolved.length})`}
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
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
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[c.status]}`}>
                          {STATUS_LABEL[c.status]}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {TYPE_LABEL[c.type] ?? c.type}
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-400 whitespace-nowrap">
                        {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>

                    {c.order_code && (
                      <p className="text-[11px] font-mono font-semibold text-gray-400 mt-1.5">Order {c.order_code}</p>
                    )}
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
          </>
        )}
      </div>

      {showNew && (
        <ComplaintModal
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); void refresh() }}
        />
      )}
    </main>
  )
}

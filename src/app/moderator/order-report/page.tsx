'use client'

import { useEffect, useMemo, useState } from 'react'
import ModeratorShell, { useModeratorAuth } from '../ModeratorShell'
import OrderReportSheet from '@/components/farmer/OrderReportSheet'
import type { FarmerOrder } from '@/components/farmer/OrderCard'

type ZoneFarmer = { id: string; name: string; village: string | null; account_type: string | null }

// The farmer's Order Report, for moderators: pick one farmer or all farmers in
// the zone, then the same report sheet the farmer sees opens — same filters,
// same figures — plus a farmer column and a per-farmer "net to pay" table for
// the payout run. ?farmer=<id> opens straight onto one farmer (linked from the
// farmer's edit page).
export default function ModeratorOrderReportPage() {
  const { zone, checked } = useModeratorAuth()
  const [farmers, setFarmers] = useState<ZoneFarmer[] | null>(null)
  const [selected, setSelected] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loadingReport, setLoadingReport] = useState(false)
  const [report, setReport] = useState<{ orders: FarmerOrder[]; title: string } | null>(null)

  useEffect(() => {
    if (!checked) return
    const want = new URLSearchParams(window.location.search).get('farmer')
    if (want) setSelected(want)
    fetch('/api/moderator/orders/report', { credentials: 'same-origin' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) { setError(j?.error ?? 'Could not load farmers.'); return }
        setFarmers(Array.isArray(j.farmers) ? j.farmers : [])
      })
      .catch(() => setError('Network error.'))
  }, [checked])

  const names = useMemo(
    () => Object.fromEntries((farmers ?? []).map((f) => [f.id, f.name])) as Record<string, string>,
    [farmers],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (farmers ?? []).filter((f) => !q || f.name.toLowerCase().includes(q) || f.village?.toLowerCase().includes(q))
  }, [farmers, query])

  const openReport = async () => {
    setLoadingReport(true); setError('')
    const r = await fetch(`/api/moderator/orders/report?farmer=${encodeURIComponent(selected)}`, { credentials: 'same-origin' }).catch(() => null)
    setLoadingReport(false)
    if (!r) { setError('Network error.'); return }
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j?.error ?? 'Could not load orders.'); return }
    const title = selected === 'all' ? `All farmers · ${zone}` : (names[selected] ?? 'Farmer')
    setReport({ orders: (j.orders ?? []) as FarmerOrder[], title })
  }

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <ModeratorShell title="Order reports" subtitle="Farmer order reports for payments" zone={zone}>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold mb-4">{error}</div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 max-w-xl">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Report for</p>

        <button
          onClick={() => setSelected('all')}
          className={`w-full text-left rounded-xl border-2 px-3 py-3 mb-3 ${selected === 'all' ? 'border-green-700 bg-green-50' : 'border-gray-200'}`}
        >
          <p className="font-extrabold text-gray-900 text-sm">🌾 All farmers</p>
          <p className="text-xs text-gray-500">Every farmer in {zone}, with a payment line per farmer</p>
        </button>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a farmer or village"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm mb-2 focus:border-green-600 focus:outline-none"
        />
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-xl">
          {farmers === null ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading farmers…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No farmers found.</p>
          ) : visible.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelected(f.id)}
              className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 ${selected === f.id ? 'bg-green-50' : 'active:bg-gray-50'}`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900 truncate">
                  {f.account_type === 'aggregator' ? '🤝' : '👨‍🌾'} {f.name}
                </span>
                {f.village && <span className="block text-xs text-gray-500 truncate">{f.village}</span>}
              </span>
              {selected === f.id && <span className="text-green-700 font-black">✓</span>}
            </button>
          ))}
        </div>

        <button
          onClick={openReport}
          disabled={loadingReport || farmers === null}
          className="mt-4 w-full bg-green-700 text-white font-bold py-3 rounded-xl text-sm active:bg-green-800 disabled:opacity-50"
        >
          {loadingReport
            ? 'Loading orders…'
            : `📊 Open report — ${selected === 'all' ? 'all farmers' : (names[selected] ?? 'farmer')}`}
        </button>
        <p className="text-[11px] text-gray-400 mt-2 leading-snug">
          Same report the farmer sees: date range, status filters, quantities and PDF download. Opens on the last 30 days of completed orders.
        </p>
      </div>

      {report && (
        <OrderReportSheet
          orders={report.orders}
          farmerName={report.title}
          farmers={names}
          onClose={() => setReport(null)}
        />
      )}
    </ModeratorShell>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import ModeratorShell, { useModeratorAuth } from '../ModeratorShell'

type Payout = {
  farmerId: string
  name: string
  earned: number
  rejectedOrders: number
  rejectedAmount: number
  deduction: number
  net: number
}

type Report = {
  orders: number
  gmv: number
  avgOrder: number
  escalationsResolved: number
  escalationsTotal: number
  topFarmer: { name: string; gmv: number } | null
  topCrop: { name: string; orders: number } | null
  commissionPercent: number
  payouts: Payout[]
}

type Period = 'week' | 'month' | 'lastmonth'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'lastmonth', label: 'Last month' },
]

export default function ModeratorReportsPage() {
  const { zone, checked } = useModeratorAuth()
  const [period, setPeriod] = useState<Period>('week')
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (p: Period) => {
    setLoading(true); setError('')
    const r = await fetch(`/api/moderator/reports?period=${p}`, { credentials: 'same-origin' }).catch(() => null)
    setLoading(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load report.'); return }
    setReport((json.report ?? null) as Report)
  }, [])

  useEffect(() => { if (checked) void load(period) }, [checked, period, load])

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? ''
  const resolutionRate = report && report.escalationsTotal > 0
    ? `${report.escalationsResolved} / ${report.escalationsTotal}` : '—'

  return (
    <ModeratorShell title="Reports" subtitle={`Zone performance — ${periodLabel}`} zone={zone}>
      {/* Period toggle — hidden when printing */}
      <div className="flex gap-1 mb-5 print:hidden">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
              period === p.key ? 'bg-green-700 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold mb-4">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
      ) : report ? (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <Kpi label="Total orders" value={report.orders} />
            <Kpi label="GMV" value={`₹${report.gmv.toLocaleString('en-IN')}`} />
            <Kpi label="Avg order value" value={`₹${report.avgOrder.toLocaleString('en-IN')}`} />
            <Kpi label="Escalations resolved" value={resolutionRate} />
          </div>

          {/* Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mt-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Top selling farmer</p>
              {report.topFarmer ? (
                <>
                  <p className="font-bold text-gray-900">{report.topFarmer.name}</p>
                  <p className="text-xs text-gray-500">₹{report.topFarmer.gmv.toLocaleString('en-IN')} GMV this period</p>
                </>
              ) : <p className="text-sm text-gray-400">No orders yet</p>}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Most popular crop</p>
              {report.topCrop ? (
                <>
                  <p className="font-bold text-gray-900">{report.topCrop.name}</p>
                  <p className="text-xs text-gray-500">{report.topCrop.orders} order{report.topCrop.orders !== 1 ? 's' : ''} this period</p>
                </>
              ) : <p className="text-sm text-gray-400">No orders yet</p>}
            </div>
          </div>

          {/* Farmer payouts — produce earnings minus rejection deductions (Case 4) */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm mt-4">
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Farmer payouts</p>
              <p className="text-[11px] font-semibold text-gray-400">Commission {report.commissionPercent}%</p>
            </div>
            <p className="text-[11px] text-gray-400 mb-3 leading-snug">
              Each rejected order is charged {report.commissionPercent}% of its amount, deducted from the farmer&apos;s payout.
            </p>
            {report.payouts.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No payouts this period</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                      <th className="py-2 pr-2 font-bold">Farmer</th>
                      <th className="py-2 px-2 font-bold text-right">Earned</th>
                      <th className="py-2 px-2 font-bold text-right">Rejected</th>
                      <th className="py-2 px-2 font-bold text-right">Deduction</th>
                      <th className="py-2 pl-2 font-bold text-right">Net payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.payouts.map((p) => (
                      <tr key={p.farmerId} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 pr-2 font-semibold text-gray-900">{p.name}</td>
                        <td className="py-2 px-2 text-right text-gray-700">₹{p.earned.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-2 text-right text-gray-500">
                          {p.rejectedOrders > 0 ? (
                            <>{p.rejectedOrders} · ₹{p.rejectedAmount.toLocaleString('en-IN')}</>
                          ) : '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-semibold text-red-600">
                          {p.deduction > 0 ? <>− ₹{p.deduction.toLocaleString('en-IN')}</> : '—'}
                        </td>
                        <td className="py-2 pl-2 text-right font-extrabold text-gray-900">₹{p.net.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-6 print:hidden">
            <button
              onClick={() => window.print()}
              className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-xl active:bg-gray-50"
            >
              ⬇ Download as PDF
            </button>
            <p className="text-[11px] text-gray-400 mt-1">Opens your browser print dialog — choose “Save as PDF”.</p>
          </div>
        </>
      ) : null}
    </ModeratorShell>
  )
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <p className="text-2xl md:text-3xl font-extrabold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
    </div>
  )
}

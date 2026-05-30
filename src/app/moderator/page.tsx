'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ModeratorShell, { useModeratorAuth } from './ModeratorShell'

type Stats = {
  activeFarmers: number
  consumers: number
  ordersThisWeek: number
  gmvThisWeek: number
  openEscalations: number
  pendingApprovals: number
}

export default function ModeratorDashboard() {
  const router = useRouter()
  const { zone, checked } = useModeratorAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!checked) return
    fetch('/api/moderator/stats', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((json) => {
        if (json?.stats) setStats(json.stats)
        else setError(json?.error ?? 'Could not load stats.')
      })
      .catch(() => setError('Network error.'))
  }, [checked])

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const hasAlerts = (stats?.openEscalations ?? 0) > 0 || (stats?.pendingApprovals ?? 0) > 0

  return (
    <ModeratorShell title="Dashboard" subtitle={today} zone={zone}>
      {/* Alert strip */}
      {stats && (
        hasAlerts ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm font-semibold mb-5">
            ⚠ {stats.pendingApprovals > 0 && `${stats.pendingApprovals} listing${stats.pendingApprovals > 1 ? 's' : ''} pending approval`}
            {stats.pendingApprovals > 0 && stats.openEscalations > 0 && ' · '}
            {stats.openEscalations > 0 && `${stats.openEscalations} open escalation${stats.openEscalations > 1 ? 's' : ''} need attention`}
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm font-semibold mb-5">
            ✓ All clear — no pending approvals or open escalations
          </div>
        )
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-semibold mb-5">{error}</div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <StatCard label="Active farmers" value={stats?.activeFarmers} />
        <StatCard label="Consumers" value={stats?.consumers} />
        <StatCard label="Orders this week" value={stats?.ordersThisWeek} />
        <StatCard label="GMV this week" value={stats ? `₹${stats.gmvThisWeek.toLocaleString('en-IN')}` : undefined} />
        <StatCard label="Open escalations" value={stats?.openEscalations} tone={(stats?.openEscalations ?? 0) > 0 ? 'red' : undefined} />
        <StatCard label="Pending approvals" value={stats?.pendingApprovals} tone={(stats?.pendingApprovals ?? 0) > 0 ? 'amber' : undefined} />
      </div>

      {/* Quick actions */}
      <div className="mt-7">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Quick actions</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => router.push('/moderator/farmers/new')}
            className="bg-green-800 text-white text-sm font-bold px-4 py-2.5 rounded-xl active:bg-green-900"
          >
            + Onboard a farmer
          </button>
          <button
            onClick={() => router.push('/moderator/listings')}
            className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-xl active:bg-gray-50"
          >
            Review listings
          </button>
          <button
            onClick={() => router.push('/moderator/escalations')}
            className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-xl active:bg-gray-50"
          >
            View escalations
          </button>
          <button
            onClick={() => router.push('/moderator/reports')}
            className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-xl active:bg-gray-50"
          >
            View reports
          </button>
        </div>
      </div>
    </ModeratorShell>
  )
}

function StatCard({
  label, value, tone, hint,
}: { label: string; value?: number | string; tone?: 'red' | 'amber'; hint?: string }) {
  const valueColor = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-gray-900'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <p className={`text-2xl md:text-3xl font-extrabold ${valueColor}`}>
        {value === undefined ? '—' : value}
      </p>
      <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
      {hint && <p className="text-[10px] text-gray-300 mt-0.5">{hint}</p>}
    </div>
  )
}

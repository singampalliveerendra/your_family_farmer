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

      {/* Stat cards — escalations & approvals lead (what needs action), then
          the at-a-glance numbers. Each card opens its respective screen. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <StatCard label="Open escalations" value={stats?.openEscalations} tone={(stats?.openEscalations ?? 0) > 0 ? 'red' : undefined} onClick={() => router.push('/moderator/escalations')} />
        <StatCard label="Pending approvals" value={stats?.pendingApprovals} tone={(stats?.pendingApprovals ?? 0) > 0 ? 'amber' : undefined} onClick={() => router.push('/moderator/listings')} />
        <StatCard label="Active farmers" value={stats?.activeFarmers} onClick={() => router.push('/moderator/farmers')} />
        <StatCard label="Consumers" value={stats?.consumers} onClick={() => router.push('/moderator/consumers')} />
        <StatCard label="Orders this week" value={stats?.ordersThisWeek} onClick={() => router.push('/moderator/reports')} />
        <StatCard label="GMV this week" value={stats ? `₹${stats.gmvThisWeek.toLocaleString('en-IN')}` : undefined} onClick={() => router.push('/moderator/reports')} />
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
            onClick={() => router.push('/moderator/listings/new')}
            className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-xl active:bg-gray-50"
          >
            + Add produce
          </button>
          <button
            onClick={() => router.push('/moderator/reports')}
            className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-xl active:bg-gray-50"
          >
            View reports
          </button>
          <button
            onClick={() => router.push('/moderator/audit')}
            className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-xl active:bg-gray-50"
          >
            Audit log
          </button>
        </div>
      </div>

      {/* Platform fee — global commission added on top of every consumer order */}
      <PlatformFeeCard />

      {/* Delivery charge — base per checkout + extra for each additional farmer */}
      <DeliveryChargeCard />
    </ModeratorShell>
  )
}

function DeliveryChargeCard() {
  const [base, setBase] = useState('')
  const [extra, setExtra] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/moderator/delivery-fee', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => {
        if (j?.base != null) setBase(String(j.base))
        if (j?.extra != null) setExtra(String(j.extra))
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const save = async () => {
    const b = Number(base)
    const e = Number(extra)
    if (!Number.isFinite(b) || b < 0 || !Number.isFinite(e) || e < 0) {
      setMsg('Enter valid charges (0 or more).')
      return
    }
    setSaving(true); setMsg('')
    try {
      const r = await fetch('/api/moderator/delivery-fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ base: b, extra: e }),
      })
      const j = await r.json().catch(() => ({}))
      setMsg(r.ok ? '✓ Saved — applies to all new checkouts.' : (j.error || 'Could not save.'))
    } catch {
      setMsg('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-7 bg-white rounded-2xl border border-gray-100 p-4 shadow-sm max-w-md">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Delivery charge</p>
      <p className="text-xs text-gray-500 mb-3">
        One delivery charge per checkout: the <b>base charge</b> plus the{' '}
        <b>additional charge</b> for each farmer beyond the first (the rider makes an
        extra pickup stop). Shown to the buyer at checkout.
      </p>
      <div className="space-y-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-gray-700">Delivery base charge</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={5}
              value={base}
              onChange={(e) => { setBase(e.target.value); setMsg('') }}
              disabled={!loaded}
              className="w-28 border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-sm font-semibold focus:border-green-600 focus:outline-none disabled:opacity-50"
              placeholder="30"
            />
          </div>
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-gray-700">Additional charge / extra farmer</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={5}
              value={extra}
              onChange={(e) => { setExtra(e.target.value); setMsg('') }}
              disabled={!loaded}
              className="w-28 border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-sm font-semibold focus:border-green-600 focus:outline-none disabled:opacity-50"
              placeholder="15"
            />
          </div>
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !loaded}
          className="bg-green-800 text-white text-sm font-bold px-5 py-2.5 rounded-xl active:bg-green-900 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {loaded && (base !== '' || extra !== '') && (
          <span className="text-xs text-gray-400">
            2 farmers = ₹{(Number(base) || 0) + (Number(extra) || 0)}
          </span>
        )}
      </div>
      {msg && <p className={`text-xs mt-2 font-semibold ${msg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{msg}</p>}
    </div>
  )
}

function PlatformFeeCard() {
  const [pct, setPct] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/moderator/platform-fee', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => { if (j?.feePercent != null) setPct(String(j.feePercent)) })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const save = async () => {
    const value = Number(pct)
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setMsg('Enter a percentage between 0 and 100.')
      return
    }
    setSaving(true); setMsg('')
    try {
      const r = await fetch('/api/moderator/platform-fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ feePercent: value }),
      })
      const j = await r.json().catch(() => ({}))
      setMsg(r.ok ? '✓ Saved — applies to all new orders.' : (j.error || 'Could not save.'))
    } catch {
      setMsg('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-7 bg-white rounded-2xl border border-gray-100 p-4 shadow-sm max-w-md">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Platform fee</p>
      <p className="text-xs text-gray-500 mb-3">
        A commission added on top of every consumer order total and shown to the buyer as a “Platform fee”.
      </p>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.5}
            value={pct}
            onChange={(e) => { setPct(e.target.value); setMsg('') }}
            disabled={!loaded}
            className="w-28 border border-gray-200 rounded-xl pl-4 pr-8 py-2.5 text-sm font-semibold focus:border-green-600 focus:outline-none disabled:opacity-50"
            placeholder="0"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
        </div>
        <button
          onClick={save}
          disabled={saving || !loaded}
          className="bg-green-800 text-white text-sm font-bold px-5 py-2.5 rounded-xl active:bg-green-900 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {msg && <p className={`text-xs mt-2 font-semibold ${msg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{msg}</p>}
    </div>
  )
}

function StatCard({
  label, value, tone, hint, onClick,
}: { label: string; value?: number | string; tone?: 'red' | 'amber'; hint?: string; onClick?: () => void }) {
  const valueColor = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-gray-900'
  const body = (
    <>
      <p className={`text-2xl md:text-3xl font-extrabold ${valueColor}`}>
        {value === undefined ? '—' : value}
      </p>
      <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
      {hint && <p className="text-[10px] text-gray-300 mt-0.5">{hint}</p>}
    </>
  )
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm text-left active:bg-gray-50 hover:border-gray-200 transition-colors"
      >
        {body}
      </button>
    )
  }
  return <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">{body}</div>
}

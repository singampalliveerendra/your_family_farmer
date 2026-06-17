'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ModeratorShell, { useModeratorAuth } from '../ModeratorShell'

type Farmer = {
  id: string
  slug: string
  name: string
  village: string | null
  district: string | null
  method: string | null
  phone: string | null
  active: boolean
  created_at: string
  activation_code: string | null
  listing_count: number
}

const METHOD_LABEL: Record<string, string> = {
  natural: 'Natural',
  organic: 'Organic',
  low_chemical: 'Low chem',
  chemical: 'Chemical',
}

export default function MyFarmersPage() {
  const router = useRouter()
  const { zone, checked } = useModeratorAuth()
  const [farmers, setFarmers] = useState<Farmer[]>([])
  const [error, setError] = useState('')
  const [needsRelogin, setNeedsRelogin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/moderator/farmers?mine=1', { credentials: 'same-origin' }).catch(() => null)
    setLoading(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load farmers.'); return }
    setNeedsRelogin(!!json.needsRelogin)
    setFarmers((json.farmers ?? []) as Farmer[])
  }, [])

  useEffect(() => { if (checked) void load() }, [checked, load])

  const copyCode = async (f: Farmer) => {
    if (!f.activation_code) return
    try {
      await navigator.clipboard.writeText(f.activation_code)
      setCopiedId(f.id)
      setTimeout(() => setCopiedId((id) => (id === f.id ? null : id)), 1800)
    } catch { /* clipboard blocked — code is still visible on screen */ }
  }

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  const activeCount = farmers.filter((f) => f.active).length

  return (
    <ModeratorShell title="My farmers" subtitle="Farmers you registered" zone={zone}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
          {farmers.length} registered · {activeCount} active
        </p>
        <button
          onClick={() => router.push('/moderator/register-farmer')}
          className="bg-green-800 text-white text-sm font-bold px-4 py-2 rounded-xl active:bg-green-900"
        >
          + Register farmer
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold mb-4">{error}</div>
      )}

      {needsRelogin && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm mb-4">
          <p className="font-bold">Please log out and sign in again.</p>
          <p className="text-xs mt-0.5">Your session was created before this feature. Re-login links your account so farmers you register show up here.</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
      ) : farmers.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
          <div className="text-5xl mb-3">🌾</div>
          <p className="font-semibold text-gray-500 text-sm">You haven&apos;t registered any farmers yet</p>
          <button
            onClick={() => router.push('/moderator/register-farmer')}
            className="mt-4 bg-green-800 text-white text-sm font-bold px-4 py-2 rounded-xl active:bg-green-900"
          >
            + Register your first farmer
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* header row — hidden on mobile */}
          <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase border-b border-gray-100">
            <div className="col-span-4">Farmer</div>
            <div className="col-span-3">Activation code</div>
            <div className="col-span-2">Method</div>
            <div className="col-span-1 text-center">Listings</div>
            <div className="col-span-2 text-right">Status</div>
          </div>
          {farmers.map((f) => (
            <div key={f.id} className="grid grid-cols-12 gap-2 items-center px-4 py-3 border-b border-gray-50 last:border-0">
              <div className="col-span-12 md:col-span-4 min-w-0">
                <p className="font-bold text-gray-900 text-sm truncate">{f.name}</p>
                <a href={`/farmer/${f.slug}`} target="_blank" className="text-[11px] text-green-700 underline">/farmer/{f.slug}</a>
                {f.village && <span className="text-[11px] text-gray-400"> · {f.village}</span>}
              </div>
              <div className="col-span-7 md:col-span-3 flex items-center gap-2">
                {f.activation_code ? (
                  <>
                    <span className="font-mono font-bold text-green-900 text-sm tracking-wide">{f.activation_code}</span>
                    <button onClick={() => copyCode(f)} className="text-[11px] text-green-700 underline">
                      {copiedId === f.id ? 'Copied ✓' : 'Copy'}
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-gray-400">—</span>
                )}
              </div>
              <div className="col-span-5 md:col-span-2">
                <span className="text-[11px] font-semibold bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                  {METHOD_LABEL[f.method ?? ''] ?? f.method ?? '—'}
                </span>
              </div>
              <div className="col-span-4 md:col-span-1 text-sm text-gray-700 md:text-center">{f.listing_count}</div>
              <div className="col-span-8 md:col-span-2 flex items-center justify-end gap-2">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${f.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                  {f.active ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => router.push(`/moderator/farmers/${f.id}/edit`)}
                  className="text-[11px] text-green-700 underline font-semibold"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ModeratorShell>
  )
}

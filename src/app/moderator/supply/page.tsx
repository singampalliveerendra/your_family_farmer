'use client'

import { useCallback, useEffect, useState } from 'react'
import ModeratorShell, { useModeratorAuth } from '../ModeratorShell'

type Status = 'ok' | 'low' | 'scarce' | 'surplus' | 'none'
type Crop = { crop: string; demand_kg: number; supply_kg: number; gap: number; status: Status }
type Farmer = { id: string; name: string; phone: string | null }

const STATUS_STYLE: Record<Status, string> = {
  ok: 'bg-green-100 text-green-700',
  low: 'bg-amber-100 text-amber-700',
  scarce: 'bg-red-100 text-red-600',
  surplus: 'bg-teal-100 text-teal-700',
  none: 'bg-gray-100 text-gray-500',
}
const STATUS_LABEL: Record<Status, string> = {
  ok: 'OK', low: 'Low', scarce: 'Scarce', surplus: 'Surplus', none: 'No demand',
}

export default function ModeratorSupplyPage() {
  const { zone, checked } = useModeratorAuth()
  const [crops, setCrops] = useState<Crop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notifyCrop, setNotifyCrop] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/moderator/supply', { credentials: 'same-origin' }).catch(() => null)
    setLoading(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load supply data.'); return }
    setCrops((json.crops ?? []) as Crop[])
  }, [])

  useEffect(() => { if (checked) void load() }, [checked, load])

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  // Bars are scaled to the largest demand/supply value across all crops.
  const maxKg = Math.max(1, ...crops.flatMap((c) => [c.demand_kg, c.supply_kg]))
  const scarceCount = crops.filter((c) => c.status === 'scarce').length

  return (
    <ModeratorShell title="Supply & demand" subtitle="Which crops are short, balanced, or in surplus this week" zone={zone}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
          {crops.length} crops · {scarceCount} scarce
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold mb-4">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
      ) : crops.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
          <div className="text-5xl mb-3">📊</div>
          <p className="font-semibold text-gray-500 text-sm">No demand or supply data yet</p>
          <p className="text-xs text-gray-400 mt-1">Numbers appear once buyers request crops and farmers list produce.</p>
        </div>
      ) : (
        <>
          {/* Balance table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 py-2 text-[11px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50">
              <span>Crop</span>
              <span className="w-16 text-right">Demand</span>
              <span className="w-16 text-right">Supply</span>
              <span className="w-14 text-right">Gap</span>
              <span className="w-20 text-center">Status</span>
            </div>
            <div className="divide-y divide-gray-100">
              {crops.map((c) => (
                <div key={c.crop} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 py-3 items-center text-sm">
                  <span className="font-bold text-gray-900 truncate">{c.crop}</span>
                  <span className="w-16 text-right text-gray-600">{c.demand_kg}</span>
                  <span className="w-16 text-right text-gray-600">{c.supply_kg}</span>
                  <span className={`w-14 text-right font-semibold ${c.gap < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {c.gap > 0 ? '+' : ''}{c.gap}
                  </span>
                  <span className="w-20 flex justify-center">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[c.status]}`}>
                      {STATUS_LABEL[c.status]}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Comparison bars (demand orange, supply green) + notify on scarce */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
            <div className="flex items-center gap-4 text-[11px] text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-400" /> Demand</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-600" /> Supply</span>
              <span className="ml-auto">kg</span>
            </div>
            {crops.map((c) => (
              <div key={c.crop}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-gray-800">{c.crop}</span>
                  {c.status === 'scarce' && (
                    <button
                      onClick={() => setNotifyCrop(c.crop)}
                      className="text-[11px] font-bold text-red-600 border border-red-200 rounded-lg px-2.5 py-1 active:bg-red-50"
                    >
                      Notify farmers
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  <Bar value={c.demand_kg} max={maxKg} color="bg-orange-400" />
                  <Bar value={c.supply_kg} max={maxKg} color="bg-green-600" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {notifyCrop && <NotifyModal crop={notifyCrop} onClose={() => setNotifyCrop(null)} />}
    </ModeratorShell>
  )
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-3.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-gray-500 w-10 text-right tabular-nums">{value}</span>
    </div>
  )
}

function NotifyModal({ crop, onClose }: { crop: string; onClose: () => void }) {
  const [farmers, setFarmers] = useState<Farmer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/moderator/notify-scarce?crop=${encodeURIComponent(crop)}`, { credentials: 'same-origin' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return
        if (!ok) { setError(j?.error ?? 'Could not load farmers.'); setLoading(false); return }
        setFarmers((j.farmers ?? []) as Farmer[]); setLoading(false)
      })
      .catch(() => { if (!cancelled) { setError('Network error.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [crop])

  const waLink = (phone: string) =>
    `https://wa.me/91${phone}?text=${encodeURIComponent(
      `Namaste! ${crop} is in short supply in our zone right now and buyers are asking for it. If you can harvest or list some, it will sell fast. — GoGrameen`,
    )}`

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold text-gray-900 mb-1">Notify farmers — {crop}</p>
        <p className="text-xs text-gray-500 mb-3">Farmers in your zone who grow {crop}. Tap to message them on WhatsApp.</p>
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        {loading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
        ) : farmers.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No farmer in your zone has listed {crop} yet.</p>
        ) : (
          <div className="space-y-2">
            {farmers.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 border border-gray-100 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{f.name}</p>
                  {f.phone && <p className="text-[11px] text-gray-400">+91 {f.phone}</p>}
                </div>
                {f.phone ? (
                  <a
                    href={waLink(f.phone)} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold bg-green-600 text-white px-3 py-1.5 rounded-lg whitespace-nowrap"
                  >
                    WhatsApp
                  </a>
                ) : (
                  <span className="text-[11px] text-gray-300">no phone</span>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="text-sm text-gray-500 px-3 py-2">Close</button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import ModeratorShell, { useModeratorAuth } from '../ModeratorShell'

type Buyer = { name: string; phone: string | null; order_count: number; total_spend: number; last_order_at: string | null }
type Intent = {
  id: string
  crop_name: string | null
  quantity_kg: number | null
  needed_by_date: string | null
  delivery_location: string | null
  requester_name: string | null
  requester_phone: string | null
  created_at: string
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) } catch { return '—' }
}

export default function ModeratorConsumersPage() {
  const { zone, checked } = useModeratorAuth()
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const [intents, setIntents] = useState<Intent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/moderator/consumers', { credentials: 'same-origin' }).catch(() => null)
    setLoading(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load consumers.'); return }
    setBuyers((json.buyers ?? []) as Buyer[])
    setIntents((json.intents ?? []) as Intent[])
  }, [])

  useEffect(() => { if (checked) void load() }, [checked, load])

  const markFulfilled = async (it: Intent) => {
    if (busyId) return
    setBusyId(it.id)
    const r = await fetch(`/api/moderator/demand-intents/${it.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ fulfilled: true }),
    }).catch(() => null)
    setBusyId(null)
    if (!r || !r.ok) {
      const j = r ? await r.json().catch(() => ({})) : {}
      setError(j?.error ?? 'Update failed.'); return
    }
    setIntents((list) => list.filter((x) => x.id !== it.id))
    // Offer to nudge the requester on WhatsApp that the crop is available.
    if (it.requester_phone) {
      const msg = encodeURIComponent(
        `Good news! ${it.crop_name ?? 'What you asked for'} is now available in your area on GoGrameen. Order here: gogrameen.in/consumer`,
      )
      window.open(`https://wa.me/91${it.requester_phone}?text=${msg}`, '_blank', 'noopener')
    }
  }

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <ModeratorShell title="Consumers" subtitle="Buyers in your zone and open demand requests" zone={zone}>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold mb-4">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
      ) : (
        <div className="space-y-6">
          {/* Open demand intents */}
          <section>
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
              Open demand · {intents.length}
            </h2>
            {intents.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-gray-100">
                <p className="text-sm text-gray-400">No open requests right now.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {intents.map((it) => (
                  <div key={it.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 text-sm">
                          {it.crop_name ?? 'Crop'}{it.quantity_kg ? ` · ${it.quantity_kg} kg` : ''}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {it.requester_name ?? 'Someone'}{it.delivery_location ? ` · ${it.delivery_location}` : ''}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">Needed by {fmtDate(it.needed_by_date)}</p>
                      </div>
                      <button
                        onClick={() => markFulfilled(it)}
                        disabled={busyId === it.id}
                        className="bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg active:bg-green-800 disabled:opacity-50 whitespace-nowrap"
                      >
                        Mark fulfilled
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Top buyers */}
          <section>
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
              Buyers · {buyers.length}
            </h2>
            {buyers.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-gray-100">
                <p className="text-sm text-gray-400">No orders in your zone yet.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 text-[11px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50">
                  <span>Buyer</span>
                  <span className="w-14 text-right">Orders</span>
                  <span className="w-20 text-right">Spend</span>
                </div>
                {buyers.map((b, i) => (
                  <div key={`${b.phone ?? b.name}-${i}`} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 items-center">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm truncate">{b.name}</p>
                      {b.phone && <a href={`tel:+91${b.phone}`} className="text-[11px] text-green-700">+91 {b.phone}</a>}
                    </div>
                    <span className="w-14 text-right text-sm text-gray-600">{b.order_count}</span>
                    <span className="w-20 text-right text-sm font-semibold text-gray-900">₹{b.total_spend}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </ModeratorShell>
  )
}

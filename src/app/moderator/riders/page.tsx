'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ModeratorShell, { useModeratorAuth } from '../ModeratorShell'

type Rider = {
  id: string
  name: string
  phone: string
  alt_phone: string | null
  vehicle_type: string | null
  vehicle_number: string | null
  service_areas: string | null
  service_pincodes: string[] | null
  status: 'pending_approval' | 'active' | 'suspended' | 'rejected'
  zone: string | null
  id_proof_url: string | null
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  last_login_at: string | null
  created_at: string
}

const STATUS_LABEL: Record<Rider['status'], string> = {
  pending_approval: 'Waiting for you',
  active: 'Active',
  suspended: 'Suspended',
  rejected: 'Rejected',
}

const STATUS_STYLE: Record<Rider['status'], string> = {
  pending_approval: 'bg-amber-100 text-amber-900 border-amber-300',
  active: 'bg-green-100 text-green-900 border-green-300',
  suspended: 'bg-red-100 text-red-900 border-red-300',
  rejected: 'bg-gray-200 text-gray-700 border-gray-300',
}

export default function ModeratorRidersPage() {
  const { zone, checked } = useModeratorAuth()
  const [riders, setRiders] = useState<Rider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'active' | 'other'>('pending')
  // Pincodes the moderator is granting, per rider. Seeded from what the rider
  // asked for at signup, but the moderator is the one who decides.
  const [pinDraft, setPinDraft] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/moderator/riders', { credentials: 'same-origin' }).catch(() => null)
    setLoading(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load riders.'); return }
    const list = (json.riders ?? []) as Rider[]
    setRiders(list)
    setPinDraft((prev) => {
      const next = { ...prev }
      for (const rd of list) {
        if (next[rd.id] === undefined) next[rd.id] = (rd.service_pincodes ?? []).join(', ')
      }
      return next
    })
  }, [])

  useEffect(() => { if (checked) void load() }, [checked, load])

  const act = async (rider: Rider, action: string, extra: Record<string, unknown> = {}) => {
    if (busyId) return
    setError('')
    setBusyId(rider.id)
    const r = await fetch(`/api/moderator/riders/${rider.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action, ...extra }),
    }).catch(() => null)
    setBusyId(null)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Action failed.'); return }
    await load()
  }

  const pincodesFor = (rider: Rider) =>
    (pinDraft[rider.id] ?? '').split(/[,\s]+/).map((p) => p.trim()).filter(Boolean)

  const approve = (rider: Rider) => {
    const pins = pincodesFor(rider)
    if (pins.length === 0) {
      setError('Enter at least one 6-digit pincode this rider will cover.')
      return
    }
    void act(rider, 'approve', { pincodes: pins })
  }

  const reject = (rider: Rider) => {
    const reason = window.prompt('Why is this application being rejected? (optional)') ?? ''
    void act(rider, 'reject', { reason })
  }

  const suspend = (rider: Rider) => {
    if (!confirm(`Suspend ${rider.name}? They lose access immediately. Any delivery they are already carrying must be reassigned from the owner panel.`)) return
    void act(rider, 'suspend')
  }

  const buckets = useMemo(() => ({
    pending: riders.filter((r) => r.status === 'pending_approval'),
    active: riders.filter((r) => r.status === 'active'),
    other: riders.filter((r) => r.status === 'suspended' || r.status === 'rejected'),
  }), [riders])

  const shown = buckets[tab]

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <ModeratorShell title="Delivery riders" zone={zone}>
      <div className="p-4 space-y-4">
        <p className="text-sm text-gray-600">
          Riders sign up themselves. Nobody can log in, see an order, or reach a buyer&apos;s
          address until you approve them here — so check the ID photo against the details
          before you do.
        </p>

        <div className="flex gap-2">
          {(['pending', 'active', 'other'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 rounded-xl text-sm font-bold border ${
                tab === t ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              {t === 'pending' ? 'Waiting' : t === 'active' ? 'Active' : 'Suspended / rejected'}
              <span className="ml-1.5 opacity-80">{buckets[t].length}</span>
            </button>
          ))}
        </div>

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 font-semibold">
            {error}
          </p>
        )}

        {loading && <p className="text-sm text-gray-500">Loading…</p>}

        {!loading && shown.length === 0 && (
          <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-4">
            {tab === 'pending'
              ? 'No applications waiting. New sign-ups land here.'
              : tab === 'active'
                ? 'No active riders yet. Approve an application to get deliveries moving.'
                : 'Nobody suspended or rejected.'}
          </p>
        )}

        <div className="space-y-3">
          {shown.map((rider) => (
            <div key={rider.id} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-900">{rider.name}</p>
                  <p className="text-sm text-gray-600">{rider.phone}</p>
                  {rider.alt_phone && (
                    <p className="text-xs text-gray-500">Alt: {rider.alt_phone}</p>
                  )}
                </div>
                <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-full border ${STATUS_STYLE[rider.status]}`}>
                  {STATUS_LABEL[rider.status]}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <dt className="text-gray-500">Vehicle</dt>
                  <dd className="font-semibold text-gray-900">
                    {rider.vehicle_type ?? '—'}{rider.vehicle_number ? ` · ${rider.vehicle_number}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Applied</dt>
                  <dd className="font-semibold text-gray-900">
                    {new Date(rider.created_at).toLocaleDateString()}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-gray-500">Areas they say they cover</dt>
                  <dd className="font-semibold text-gray-900">{rider.service_areas ?? '—'}</dd>
                </div>
              </dl>

              <div>
                <p className="text-xs text-gray-500 mb-1">ID proof</p>
                {rider.id_proof_url ? (
                  <a href={rider.id_proof_url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={rider.id_proof_url}
                      alt={`ID proof for ${rider.name}`}
                      className="w-full max-h-56 object-contain rounded-xl border border-gray-200 bg-gray-50"
                    />
                    <span className="text-[11px] text-blue-700 underline font-bold">Open full size</span>
                  </a>
                ) : (
                  <p className="text-xs text-red-700 font-semibold bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                    No ID photo on file — do not approve without seeing one.
                  </p>
                )}
              </div>

              {rider.status === 'rejected' && rider.rejection_reason && (
                <p className="text-xs text-gray-600">
                  <span className="text-gray-500">Reason: </span>{rider.rejection_reason}
                </p>
              )}

              {(rider.status === 'pending_approval' || rider.status === 'active') && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    Pincodes this rider may deliver to (they only ever see orders in these)
                  </label>
                  <input
                    value={pinDraft[rider.id] ?? ''}
                    onChange={(e) => setPinDraft((p) => ({ ...p, [rider.id]: e.target.value }))}
                    placeholder="534102, 530026"
                    inputMode="numeric"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {rider.status === 'pending_approval' && (
                  <>
                    <button
                      onClick={() => approve(rider)}
                      disabled={busyId === rider.id}
                      className="flex-1 bg-green-700 text-white font-bold py-2.5 rounded-xl text-sm active:bg-green-800 disabled:opacity-50"
                    >
                      {busyId === rider.id ? 'Working…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => reject(rider)}
                      disabled={busyId === rider.id}
                      className="px-4 bg-white border border-red-300 text-red-700 font-bold py-2.5 rounded-xl text-sm active:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}

                {rider.status === 'active' && (
                  <>
                    <button
                      onClick={() => void act(rider, 'set_pincodes', { pincodes: pincodesFor(rider) })}
                      disabled={busyId === rider.id}
                      className="flex-1 bg-white border border-gray-300 text-gray-800 font-bold py-2.5 rounded-xl text-sm active:bg-gray-50 disabled:opacity-50"
                    >
                      Save pincodes
                    </button>
                    <button
                      onClick={() => suspend(rider)}
                      disabled={busyId === rider.id}
                      className="px-4 bg-white border border-red-300 text-red-700 font-bold py-2.5 rounded-xl text-sm active:bg-red-50 disabled:opacity-50"
                    >
                      Suspend
                    </button>
                  </>
                )}

                {rider.status === 'suspended' && (
                  <button
                    onClick={() => void act(rider, 'reinstate')}
                    disabled={busyId === rider.id}
                    className="flex-1 bg-green-700 text-white font-bold py-2.5 rounded-xl text-sm active:bg-green-800 disabled:opacity-50"
                  >
                    Reinstate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModeratorShell>
  )
}

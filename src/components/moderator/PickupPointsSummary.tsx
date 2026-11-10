'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatPickupSlots, normalizePickupPhones, normalizePickupSchedule, type PickupPhones, type PickupSchedule } from '@/lib/pickup-slots'

// Moderator produce form, Delivery step (client card 2026-11-10): the seller's
// pickup points, read-only. They live on the farmer's profile, so they are
// edited on the farmer's own edit page (link) — one place, shared by every
// produce, exactly like the farmer's own form.

export default function PickupPointsSummary({ farmerId }: { farmerId: string }) {
  const [state, setState] = useState<{ locations: string[]; schedule: PickupSchedule; phones: PickupPhones } | null | 'error'>(null)

  useEffect(() => {
    if (!farmerId) return
    let alive = true
    fetch(`/api/moderator/farmers/${farmerId}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (!alive) return
        const f = (j?.farmer ?? {}) as { pickup_locations?: unknown; pickup_slots?: unknown; pickup_location_phones?: unknown }
        const locs = Array.isArray(f.pickup_locations) ? (f.pickup_locations as unknown[]).filter((x): x is string => typeof x === 'string') : []
        setState({ locations: locs, schedule: normalizePickupSchedule(f.pickup_slots, locs), phones: normalizePickupPhones(f.pickup_location_phones, locs) })
      })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [farmerId])

  const editLink = farmerId ? (
    <Link href={`/moderator/farmers/${farmerId}/edit`} className="text-xs font-bold text-green-800 underline">Edit on the farmer&apos;s page</Link>
  ) : null

  return (
    <div className="rounded-2xl border-2 border-green-200 bg-green-50/50 p-3 space-y-2 max-w-md">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-extrabold text-green-900">🧺 Pickup points</p>
        {editLink}
      </div>
      {!farmerId ? (
        <p className="text-xs text-gray-500">Choose the farmer first.</p>
      ) : state === null ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : state === 'error' ? (
        <p className="text-xs text-amber-800">Could not load this farmer&apos;s pickup points.</p>
      ) : state.locations.length === 0 ? (
        <p className="text-xs font-semibold text-amber-900">No pickup points yet — buyers won&apos;t know where to collect. Add them on the farmer&apos;s page.</p>
      ) : (
        <ul className="space-y-2">
          {state.locations.map((loc) => (
            <li key={loc} className="rounded-xl bg-white border border-green-100 px-3 py-2">
              <p className="text-sm font-bold text-gray-900">📍 {loc}</p>
              {formatPickupSlots(state.schedule[loc]).map((line) => <p key={line} className="text-xs text-gray-600">🕒 {line}</p>)}
              {state.phones[loc] && <p className="text-xs text-gray-600">📞 +91 {state.phones[loc]}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

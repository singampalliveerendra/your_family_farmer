'use client'

import { useEffect, useState } from 'react'
import { farmerFetch } from '@/lib/farmer-auth-client'
import {
  emptyPickupSlot, formatPickupSlots, normalizePickupPhones, normalizePickupSchedule,
  type PickupPhones, type PickupSchedule,
} from '@/lib/pickup-slots'

// The seller's pickup points — address/landmark, days & times, and a contact
// number per point — shown inside the produce form's Delivery step (client
// card 2026-11-10). They live on the PROFILE (farmers.pickup_locations,
// pickup_slots, pickup_location_phones), shared by every produce, so this
// editor loads and saves the profile itself (/api/farmer/profile) with the
// same rules as Settings → Profile. Saving here changes every produce's pickup.

type Translate = (en: string, te: string) => string
const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** What makes a set of pickup points saveable — the profile form's own rules. */
export function pickupPointsError(locations: string[], schedule: PickupSchedule, phones: PickupPhones): { en: string; te: string } | null {
  if (locations.length === 0) {
    return { en: 'Add at least one pickup point so buyers know where to collect.', te: 'కొనుగోలుదారులు ఎక్కడ తీసుకోవాలో తెలియడానికి కనీసం ఒక పికప్ స్థలం జోడించండి.' }
  }
  const clean = normalizePickupSchedule(schedule, locations)
  const missing = locations.filter((l) => !(clean[l]?.length))
  if (missing.length) return { en: `Add pickup timings for: ${missing.join(', ')}`, te: `వీటికి పికప్ సమయాలు జోడించండి: ${missing.join(', ')}` }
  const bad = locations.filter((l) => { const d = (phones[l] ?? '').replace(/\D/g, ''); return d.length > 0 && d.length !== 10 })
  if (bad.length) return { en: `Enter a 10-digit number, or leave it blank, for: ${bad.join(', ')}`, te: `వీటికి 10 అంకెల నంబర్ ఇవ్వండి, లేదా ఖాళీగా వదలండి: ${bad.join(', ')}` }
  return null
}

export default function PickupPointsEditor({ L }: { L: Translate }) {
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [locations, setLocations] = useState<string[]>([])
  const [schedule, setSchedule] = useState<PickupSchedule>({})
  const [phones, setPhones] = useState<PickupPhones>({})
  const [newPoint, setNewPoint] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    farmerFetch('/api/farmer/profile')
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        const f = (j?.farmer ?? {}) as { pickup_locations?: unknown; pickup_slots?: unknown; pickup_location_phones?: unknown }
        const locs = Array.isArray(f.pickup_locations) ? (f.pickup_locations as unknown[]).filter((x): x is string => typeof x === 'string') : []
        setLocations(locs)
        setSchedule(normalizePickupSchedule(f.pickup_slots, locs))
        setPhones(normalizePickupPhones(f.pickup_location_phones, locs))
        setEditing(locs.length === 0)
        setLoaded(true)
      })
      .catch(() => { if (alive) { setLoadError(true); setLoaded(true) } })
    return () => { alive = false }
  }, [])

  const add = () => {
    const v = newPoint.trim()
    if (!v || locations.includes(v)) { setNewPoint(''); return }
    setLocations((p) => [...p, v])
    setSchedule((p) => ({ ...p, [v]: [emptyPickupSlot()] }))
    setNewPoint('')
  }
  const remove = (loc: string) => {
    setLocations((p) => p.filter((l) => l !== loc))
    setSchedule((p) => { const n = { ...p }; delete n[loc]; return n })
    setPhones((p) => { const n = { ...p }; delete n[loc]; return n })
  }
  const setSlot = (loc: string, idx: number, patch: Partial<{ days: string[]; time_from: string; time_to: string }>) =>
    setSchedule((p) => ({ ...p, [loc]: (p[loc] ?? []).map((s, i) => (i === idx ? { ...s, ...patch } : s)) }))

  const save = async () => {
    const err = pickupPointsError(locations, schedule, phones)
    if (err) { setMsg({ ok: false, text: L(err.en, err.te) }); return }
    setSaving(true); setMsg(null)
    const clean = normalizePickupSchedule(schedule, locations)
    const r = await farmerFetch('/api/farmer/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickup_locations: locations,
        pickup_slots: Object.keys(clean).length ? clean : null,
        pickup_location_phones: normalizePickupPhones(phones, locations),
      }),
    }).catch(() => null)
    setSaving(false)
    if (!r || !r.ok) { setMsg({ ok: false, text: L('Could not save the pickup points. Please try again.', 'పికప్ స్థలాలు సేవ్ కాలేదు. మళ్లీ ప్రయత్నించండి.') }); return }
    setEditing(false)
    setMsg({ ok: true, text: L('Pickup points saved — every produce uses them.', 'పికప్ స్థలాలు సేవ్ అయ్యాయి — అన్ని ఉత్పత్తులకూ ఇవే.') })
  }

  const input = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-green-500 focus:outline-none min-h-[44px]'

  if (!loaded) return <p className="text-xs text-gray-400">{L('Loading pickup points…', 'పికప్ స్థలాలు లోడ్ అవుతున్నాయి…')}</p>
  if (loadError) return <p className="text-xs text-amber-800">{L('Could not load your pickup points. Check Settings → Profile.', 'మీ పికప్ స్థలాలు లోడ్ కాలేదు. సెట్టింగ్స్ → ప్రొఫైల్ చూడండి.')}</p>

  return (
    <div className="rounded-2xl border-2 border-green-200 bg-green-50/50 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-extrabold text-green-900">🧺 {L('Pickup points', 'పికప్ స్థలాలు')}</p>
        {!editing && (
          <button type="button" onClick={() => { setEditing(true); setMsg(null) }} className="text-xs font-bold text-green-800 underline min-h-[44px] px-1">
            {L('Edit', 'మార్చండి')}
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-600 leading-snug">
        {L('Shared by all your produce — the same as in Settings → Profile.', 'మీ అన్ని ఉత్పత్తులకూ ఇవే — సెట్టింగ్స్ → ప్రొఫైల్‌లో ఉన్నవే.')}
      </p>

      {!editing ? (
        <ul className="space-y-2">
          {locations.map((loc) => (
            <li key={loc} className="rounded-xl bg-white border border-green-100 px-3 py-2">
              <p className="text-sm font-bold text-gray-900">📍 {loc}</p>
              {formatPickupSlots(schedule[loc]).map((line) => <p key={line} className="text-xs text-gray-600">🕒 {line}</p>)}
              {phones[loc] && <p className="text-xs text-gray-600">📞 +91 {phones[loc]}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-3">
          {locations.map((loc) => (
            <div key={loc} className="rounded-xl bg-white border border-green-100 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-gray-900 truncate">📍 {loc}</span>
                <button type="button" onClick={() => remove(loc)} className="text-xs font-bold text-red-600 min-h-[44px] px-1">{L('Remove', 'తీసివేయి')}</button>
              </div>
              <label className="block">
                <span className="text-[11px] font-bold text-gray-600">{L('Contact number here (optional)', 'ఇక్కడి ఫోన్ నంబర్ (ఐచ్ఛికం)')}</span>
                <input
                  type="tel" inputMode="numeric" maxLength={10}
                  value={phones[loc] ?? ''}
                  onChange={(e) => setPhones((p) => ({ ...p, [loc]: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  placeholder={L('10-digit number', '10 అంకెల నంబర్')}
                  className={input}
                />
              </label>
              {(schedule[loc] ?? []).map((slot, idx) => (
                <div key={idx} className="rounded-lg bg-gray-50 border border-gray-200 p-2 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_DAYS.map((d) => {
                      const on = slot.days.includes(d)
                      return (
                        <button
                          key={d} type="button" aria-pressed={on}
                          onClick={() => setSlot(loc, idx, { days: on ? slot.days.filter((x) => x !== d) : [...slot.days, d] })}
                          className={`px-2.5 py-1.5 rounded-full text-xs font-bold border ${on ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200'}`}
                        >
                          {d.slice(0, 3)}
                        </button>
                      )
                    })}
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <input type="time" aria-label={L('From', 'నుండి')} value={slot.time_from} onChange={(e) => setSlot(loc, idx, { time_from: e.target.value })} className={input} />
                    <input type="time" aria-label={L('To', 'వరకు')} value={slot.time_to} onChange={(e) => setSlot(loc, idx, { time_to: e.target.value })} className={input} />
                    <button type="button" onClick={() => setSchedule((p) => ({ ...p, [loc]: (p[loc] ?? []).filter((_, i) => i !== idx) }))} className="text-xs font-bold text-red-600 px-1 min-h-[44px]" aria-label={L('Remove timing', 'సమయం తీసివేయి')}>✕</button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setSchedule((p) => ({ ...p, [loc]: [...(p[loc] ?? []), emptyPickupSlot()] }))} className="text-xs font-bold text-green-800 min-h-[44px]">
                + {L('Add a timing', 'సమయం జోడించండి')}
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={newPoint}
              onChange={(e) => setNewPoint(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
              placeholder={L('Address / landmark, e.g. Bus stand, Pentapadu', 'చిరునామా / గుర్తు, ఉదా. బస్ స్టాండ్, పెంటపాడు')}
              className={input}
            />
            <button type="button" onClick={add} className="bg-green-700 text-white font-bold px-4 rounded-xl text-sm min-h-[44px]">{L('Add', 'జోడించు')}</button>
          </div>
          <button type="button" disabled={saving} onClick={() => void save()} className="w-full bg-green-800 text-white font-bold rounded-xl text-sm min-h-[48px] disabled:opacity-50">
            {saving ? L('Saving…', 'సేవ్ అవుతోంది…') : L('Save pickup points', 'పికప్ స్థలాలు సేవ్ చేయండి')}
          </button>
        </div>
      )}
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-xs font-semibold ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
    </div>
  )
}

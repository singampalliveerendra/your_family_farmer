'use client'

import { useEffect, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { parseDefaultDashboard, type DefaultDashboard } from '@/lib/defaultDashboard'

/* Settings → Default dashboard. Rendered in the shop's ⚙️ menu and in the
 * farmer dashboard's Settings sheet — the same setting in both places, since
 * the server files it under the phone that links the two accounts.
 *
 * Tapping the active choice again clears it, which puts `/` back on the
 * normal landing page. Saves optimistically and rolls back on failure: on 4G
 * a spinner on a two-way toggle feels broken. */

type Load = 'loading' | 'ready' | 'error'

export default function DefaultDashboardSetting() {
  const { L } = useLang()
  const [load, setLoad] = useState<Load>('loading')
  const [value, setValue] = useState<DefaultDashboard | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/settings/default-dashboard', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        const body = await res.json()
        if (!live) return
        setValue(parseDefaultDashboard(body?.defaultDashboard))
        setLoad('ready')
      })
      .catch(() => { if (live) setLoad('error') })
    return () => { live = false }
  }, [])

  const choose = async (next: DefaultDashboard) => {
    if (saving) return
    const target = value === next ? null : next
    const previous = value
    setValue(target)
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/default-dashboard', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultDashboard: target }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setValue(previous)
      setError(L('Could not save. Please try again.', 'సేవ్ కాలేదు. మళ్లీ ప్రయత్నించండి.'))
    } finally {
      setSaving(false)
    }
  }

  const option = (key: DefaultDashboard, icon: string, label: string) => {
    const active = value === key
    return (
      <button
        type="button"
        onClick={() => void choose(key)}
        disabled={load !== 'ready' || saving}
        aria-pressed={active}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition disabled:opacity-60 ${
          active ? 'bg-green-700 text-white shadow-sm' : 'text-gray-700 active:bg-gray-200'
        }`}
      >
        <span aria-hidden>{icon}</span>
        {label}
      </button>
    )
  }

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
        {L('Default dashboard', 'డిఫాల్ట్ డాష్‌బోర్డ్')}
      </p>
      <p className="mt-0.5 mb-2 text-[11px] leading-snug text-gray-500">
        {L('The app opens here after you log in.', 'లాగిన్ అయ్యాక యాప్ ఇక్కడ తెరుచుకుంటుంది.')}
      </p>
      <div className="flex gap-1 rounded-2xl bg-gray-100 p-1">
        {option('farmer', '🧑‍🌾', L('Farmer', 'రైతు'))}
        {option('consumer', '🛒', L('Consumer', 'కొనుగోలుదారు'))}
      </div>
      {load === 'loading' && (
        <p className="mt-1.5 text-[11px] text-gray-400">{L('Loading…', 'లోడ్ అవుతోంది…')}</p>
      )}
      {load === 'error' && (
        <p className="mt-1.5 text-[11px] text-red-600">
          {L('Could not load your setting.', 'మీ సెట్టింగ్ లోడ్ కాలేదు.')}
        </p>
      )}
      {load === 'ready' && !error && (
        <p className="mt-1.5 text-[11px] leading-snug text-gray-400">
          {value
            ? L('Tap it again to clear.', 'తీసివేయడానికి మళ్లీ నొక్కండి.')
            : L('Not set — the app opens on the home page.', 'సెట్ చేయలేదు — యాప్ హోమ్ పేజీలో తెరుచుకుంటుంది.')}
        </p>
      )}
      {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
    </div>
  )
}

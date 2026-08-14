'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'

// The farmers an aggregator sources from. Rendered in two places — the
// aggregator's own /aggregator/farmers page and the moderator's farmer edit
// screen — with the same rules on both, per the farmer↔moderator parity rule.
// The only difference is the endpoint and, for the moderator, an aggregatorId
// on writes.
//
// Both endpoints validate through @/lib/source-farmers, so nothing here is the
// last line of defence; the inline checks are only to save a round trip.

export type SourceFarmer = {
  id: string
  name: string
  village: string | null
  address: string | null
  phone: string | null
}

type Draft = { name: string; village: string; address: string; phone: string }

const EMPTY: Draft = { name: '', village: '', address: '', phone: '' }

export default function SourceFarmersManager({
  endpoint,
  aggregatorId,
}: {
  /** '/api/aggregator/source-farmers' or '/api/moderator/source-farmers' */
  endpoint: string
  /** Required for the moderator endpoint; omitted when the aggregator manages their own. */
  aggregatorId?: string
}) {
  const { L } = useLang()

  const [rows, setRows] = useState<SourceFarmer[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const listUrl = aggregatorId ? `${endpoint}?aggregatorId=${aggregatorId}` : endpoint

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(listUrl, { credentials: 'include' })
      const json = await res.json()
      if (json?.ok) setRows(json.sourceFarmers ?? [])
      else setError(json?.error ?? '')
    } catch {
      setError('Could not load the farmer list.')
    } finally {
      setLoading(false)
    }
  }, [listUrl])

  useEffect(() => { load() }, [load])

  function startEdit(r: SourceFarmer) {
    setEditingId(r.id)
    setDraft({
      name: r.name ?? '',
      village: r.village ?? '',
      address: r.address ?? '',
      phone: r.phone ?? '',
    })
    setError('')
  }

  function cancel() {
    setEditingId(null)
    setDraft(EMPTY)
    setError('')
  }

  async function save() {
    if (busy) return
    if (!draft.name.trim()) { setError(L("Please enter the farmer's name.", 'రైతు పేరు నమోదు చేయండి.')); return }
    if (draft.phone.replace(/\D/g, '').length !== 10) {
      setError(L('Enter a valid 10-digit phone number.', 'సరైన 10 అంకెల ఫోన్ నంబర్ నమోదు చేయండి.'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(editingId ? `${endpoint}/${editingId}` : endpoint, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...draft, ...(aggregatorId ? { aggregatorId } : {}) }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Could not save.'); return }
      cancel()
      await load()
    } catch {
      setError('Could not save. Please check your connection.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(r: SourceFarmer) {
    if (busy) return
    const ok = window.confirm(
      L(`Remove ${r.name} from your farmer list?`, `${r.name} ను జాబితా నుండి తొలగించాలా?`),
    )
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`${endpoint}/${r.id}`, { method: 'DELETE', credentials: 'include' })
      const json = await res.json()
      // A farmer with harvests on record cannot be removed — the server explains
      // why, and that message is worth showing verbatim.
      if (!res.ok) { setError(json?.error ?? 'Could not remove.'); return }
      await load()
    } catch {
      setError('Could not remove. Please check your connection.')
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none'

  return (
    /* bg-white is load-bearing, not decoration: on its own page this card sits
       in a `-mt-5` container that pulls it up over the green header, so a
       transparent panel shows green through its top and page-grey through the
       rest. Matches the card style used by every other section. */
    <div className="space-y-4 bg-white border border-gray-100 shadow-sm rounded-2xl p-4">
      <div>
        <h4 className="text-sm font-extrabold text-green-800">
          {L('Farmers you aggregate from', 'మీరు సేకరించే రైతులు')}
        </h4>
        <p className="text-[11px] text-gray-500 mt-0.5">
          {L(
            'Every produce you list must name one of these farmers. Buyers see their name, village and phone.',
            'మీరు జాబితా చేసే ప్రతి ఉత్పత్తి ఈ రైతులలో ఒకరిని పేర్కొనాలి. కొనుగోలుదారులకు వారి పేరు, ఊరు, ఫోన్ కనిపిస్తాయి.',
          )}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">{L('Loading…', 'లోడ్ అవుతోంది…')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-3 py-3">
          {L(
            'No farmers added yet. Add at least one before logging a harvest.',
            'ఇంకా రైతులు జోడించబడలేదు. కోత నమోదు చేసే ముందు కనీసం ఒకరిని జోడించండి.',
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3"
            >
              <span className="text-lg leading-none mt-0.5">🌾</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{r.name}</p>
                {(r.village || r.address) && (
                  <p className="text-[11px] text-gray-500 truncate">
                    {[r.village, r.address].filter(Boolean).join(' · ')}
                  </p>
                )}
                {r.phone && <p className="text-[11px] text-gray-500">{r.phone}</p>}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(r)}
                  className="text-xs font-bold text-green-700 active:text-green-900"
                >
                  {L('Edit', 'సవరించు')}
                </button>
                <button
                  type="button"
                  onClick={() => remove(r)}
                  className="text-xs font-bold text-red-500 active:text-red-700"
                >
                  {L('Remove', 'తొలగించు')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="pt-3 border-t border-gray-200 space-y-3">
        <p className="text-xs font-extrabold text-gray-700 uppercase tracking-wide">
          {editingId ? L('Edit farmer', 'రైతును సవరించు') : L('Add a farmer', 'రైతును జోడించు')}
        </p>

        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder={L('Farmer name', 'రైతు పేరు')}
          maxLength={100}
          className={inputCls}
        />
        <input
          type="text"
          value={draft.village}
          onChange={(e) => setDraft({ ...draft, village: e.target.value })}
          placeholder={L('Village', 'ఊరు')}
          maxLength={100}
          className={inputCls}
        />
        <input
          type="text"
          value={draft.address}
          onChange={(e) => setDraft({ ...draft, address: e.target.value })}
          placeholder={L('Address (optional)', 'చిరునామా (ఐచ్ఛికం)')}
          maxLength={300}
          className={inputCls}
        />
        <input
          type="tel"
          inputMode="numeric"
          value={draft.phone}
          onChange={(e) => setDraft({ ...draft, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
          placeholder={L('Phone number', 'ఫోన్ నంబర్')}
          maxLength={10}
          className={inputCls}
        />

        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex-1 bg-green-700 text-white font-bold py-3 rounded-xl text-sm active:bg-green-800 disabled:opacity-50"
          >
            {busy
              ? L('Saving…', 'సేవ్ అవుతోంది…')
              : editingId
                ? L('Save changes', 'మార్పులు సేవ్ చేయండి')
                : L('Add farmer', 'రైతును జోడించు')}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancel}
              className="text-sm font-bold text-gray-500 active:text-gray-700"
            >
              {L('Cancel', 'రద్దు')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

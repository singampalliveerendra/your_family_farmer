'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'

export type SourceFarmerOption = { id: string; name: string; village?: string | null }

/* ─── Which farmer grows this produce ──────────────────────────────────
   An aggregator's produce must name the farmer behind it. That used to be
   asked once per harvest; it is now asked once per produce and every harvest
   logged against the listing inherits it (see
   scripts/migrations/20260814_source_farmer_on_produce.sql).

   The hook and the picker are separate because the two forms that own this
   field — the farmer dashboard's produce form and the moderator's ListingForm —
   need the answer for validation before they render anything, and HarvestManager
   needs the names without the input. Shared so the two surfaces cannot drift,
   per the farmer↔moderator parity rule. */

export function useSourceFarmers(farmerId: string | null | undefined) {
  const [isAggregator, setIsAggregator] = useState(false)
  const [sourceFarmers, setSourceFarmers] = useState<SourceFarmerOption[]>([])
  const [loaded, setLoaded] = useState(!farmerId)

  // Reset during render, not in an effect: in the moderator's create form the
  // seller can be switched, and the previous aggregator's list must not linger
  // against the new one for the render in between.
  const [prevFarmerId, setPrevFarmerId] = useState(farmerId)
  if (farmerId !== prevFarmerId) {
    setPrevFarmerId(farmerId)
    setIsAggregator(false)
    setSourceFarmers([])
    setLoaded(!farmerId)
  }

  useEffect(() => {
    if (!farmerId) return
    let cancelled = false

    const load = async () => {
      const { data: owner } = await supabase
        .from('farmers')
        .select('account_type')
        .eq('id', farmerId)
        .maybeSingle()
      if (cancelled) return
      if (owner?.account_type !== 'aggregator') { setLoaded(true); return }
      setIsAggregator(true)
      const { data: rows } = await supabase
        .from('source_farmers')
        .select('id, name, village')
        .eq('aggregator_id', farmerId)
        .order('name', { ascending: true })
      if (cancelled) return
      setSourceFarmers((rows ?? []) as SourceFarmerOption[])
      setLoaded(true)
    }
    void load()
    return () => { cancelled = true }
  }, [farmerId])

  return {
    isAggregator,
    sourceFarmers,
    loaded,
    /** An aggregator with an empty registry cannot list anything — the trigger
        rejects it. Say so rather than offering an empty dropdown that fails. */
    noSourceFarmers: isAggregator && loaded && sourceFarmers.length === 0,
  }
}

// Village disambiguates two farmers who share a first name — common enough in
// one mandal that the name alone is not a safe label to pick from.
export const sourceFarmerLabel = (r: SourceFarmerOption) =>
  r.village ? `${r.name} — ${r.village}` : r.name

export const sourceFarmerNameOf = (rows: SourceFarmerOption[], id?: string | null) =>
  (id ? rows.find((r) => r.id === id)?.name : null) ?? null

export default function SourceFarmerPicker({
  sourceFarmers,
  noSourceFarmers,
  value,
  onChange,
  manageHref,
}: {
  sourceFarmers: SourceFarmerOption[]
  noSourceFarmers: boolean
  value: string
  onChange: (id: string) => void
  /** Where to send them to add a farmer. Omitted on the moderator surface,
      which manages the registry on its own farmer-edit page. */
  manageHref?: string
}) {
  const { L } = useLang()

  if (noSourceFarmers) {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-3">
        <p className="text-xs font-bold text-amber-900 leading-snug">
          {L('No farmers in your list yet.', 'ఇంకా ఏ రైతూ జాబితాలో లేరు.')}
        </p>
        <p className="text-[11px] text-amber-800 leading-snug mt-0.5">
          {L(
            'Every produce you list has to name the farmer who grows it. Add them first.',
            'మీరు జాబితా చేసే ప్రతి ఉత్పత్తికి దానిని పండించిన రైతు పేరు ఉండాలి. ముందుగా వారిని జోడించండి.',
          )}
        </p>
        {manageHref && (
          <a
            href={manageHref}
            className="inline-block mt-2 text-xs font-extrabold text-green-800 underline"
          >
            {L('Add a farmer', 'రైతును జోడించు')} →
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block">
        {L('Farmer who grows this', 'దీన్ని పండించే రైతు')} <span className="text-red-500">*</span>
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-green-500 focus:outline-none"
      >
        <option value="">{L('Select a farmer…', 'రైతును ఎంచుకోండి…')}</option>
        {sourceFarmers.map((r) => (
          <option key={r.id} value={r.id}>{sourceFarmerLabel(r)}</option>
        ))}
      </select>
      <p className="text-[11px] text-gray-500 leading-snug">
        {L(
          'Buyers see their name, village and phone on every harvest of this produce.',
          'ఈ ఉత్పత్తి ప్రతి కోతపై కొనుగోలుదారులకు వారి పేరు, ఊరు, ఫోన్ కనిపిస్తాయి.',
        )}
      </p>
    </div>
  )
}

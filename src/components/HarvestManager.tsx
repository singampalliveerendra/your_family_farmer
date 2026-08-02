'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'
import { harvestClock, freshnessLabel, type Harvest } from '@/lib/harvest'

/* ─── Harvest timings manager ──────────────────────────────────────────
   A produce_listing is the template; logging a harvest records one actual pick
   (date+time, qty-for-sale) into the `harvests` table — each pick is its own
   sellable product powering the consumer "Today's Harvest" feed and the
   "Harvested 2h ago" clock.

   Lives inside the produce Edit form on BOTH surfaces: the farmer dashboard and
   the moderator's Edit Harvest page (moderators log harvests on a farmer's
   behalf). Shared so the two can't drift apart. */
export default function HarvestManager({ listingId, farmerId, unit, produceShelfLife }: { listingId: string; farmerId: string; unit?: string | null; produceShelfLife?: number | null }) {
  const { L } = useLang()
  const nowLocal = () => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16) // yyyy-MM-ddThh:mm for datetime-local
  }
  // datetime-local wants yyyy-MM-ddThh:mm in LOCAL time; convert a stored UTC
  // ISO string back to that shape for the edit inputs.
  const toLocalInput = (iso: string) => {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  }
  const [harvestedAt, setHarvestedAt] = useState(nowLocal())
  const [approxQty, setApproxQty] = useState('')
  const [savingHarvest, setSavingHarvest] = useState(false)
  const [harvestMsg, setHarvestMsg] = useState('')
  const [harvestErr, setHarvestErr] = useState('')

  const [harvests, setHarvests] = useState<Harvest[]>([])
  const [harvestsLoaded, setHarvestsLoaded] = useState(false)
  const [editingHarvestId, setEditingHarvestId] = useState<string | null>(null)
  const [editAt, setEditAt] = useState('')
  const [editQty, setEditQty] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editErr, setEditErr] = useState('')

  const loadHarvests = useCallback(async () => {
    const { data } = await supabase
      .from('harvests')
      .select('id, produce_listing_id, farmer_id, harvested_at, shelf_life_days, approx_quantity, unit, notes, paused')
      .eq('produce_listing_id', listingId)
      .order('harvested_at', { ascending: false })
      .limit(20)
    setHarvests((data ?? []) as Harvest[])
    setHarvestsLoaded(true)
  }, [listingId])

  useEffect(() => { void loadHarvests() }, [loadHarvests])

  const submitHarvest = async () => {
    setHarvestErr('')
    setHarvestMsg('')
    const when = new Date(harvestedAt)
    if (isNaN(when.getTime())) { setHarvestErr(L('Pick a valid harvest date & time.', 'సరైన కోత తేదీ & సమయం ఎంచుకోండి.')); return }
    setSavingHarvest(true)
    // Shelf life is not logged per-harvest — it's a produce-level property, so
    // the consumer freshness label falls back to the listing's shelf_life_days.
    const { error: err } = await supabase.from('harvests').insert({
      produce_listing_id: listingId,
      farmer_id: farmerId,
      harvested_at: when.toISOString(),
      approx_quantity: approxQty ? Number(approxQty) : null,
      // The quantity entered is this harvest's sellable stock: each harvest is
      // its own product with its own inventory (decremented as buyers order).
      stock_qty: approxQty ? Number(approxQty) : null,
      unit: unit ?? null,
    })
    setSavingHarvest(false)
    if (err) { setHarvestErr(err.message); return }
    setHarvestMsg(L('Harvest logged ✓', 'కోత నమోదైంది ✓'))
    setApproxQty(''); setHarvestedAt(nowLocal())
    void loadHarvests()
    setTimeout(() => setHarvestMsg(''), 1400)
  }

  const startEditHarvest = (h: Harvest) => {
    setEditingHarvestId(h.id)
    setEditErr('')
    setEditAt(toLocalInput(h.harvested_at))
    setEditQty(h.approx_quantity != null ? String(h.approx_quantity) : '')
  }

  const saveEditHarvest = async () => {
    if (!editingHarvestId) return
    setEditErr('')
    const when = new Date(editAt)
    if (isNaN(when.getTime())) { setEditErr(L('Pick a valid harvest date & time.', 'సరైన కోత తేదీ & సమయం ఎంచుకోండి.')); return }
    setSavingEdit(true)
    const { error: err } = await supabase.from('harvests').update({
      harvested_at: when.toISOString(),
      approx_quantity: editQty ? Number(editQty) : null,
      // Editing the quantity resets this harvest's sellable stock to the new
      // amount (the farmer is stating what's actually available now).
      stock_qty: editQty ? Number(editQty) : null,
    }).eq('id', editingHarvestId)
    setSavingEdit(false)
    if (err) { setEditErr(err.message); return }
    setEditingHarvestId(null)
    void loadHarvests()
  }

  // Pause / resume — the non-destructive alternative to 🗑. A paused harvest
  // keeps its row (and the history behind the "harvested 2h ago" clock) but
  // vanishes from every consumer surface until the farmer resumes it.
  const togglePause = async (h: Harvest) => {
    const next = !h.paused
    setHarvestErr('')
    // Optimistic: the list is short and the round-trip on 4G is the slow part.
    setHarvests((prev) => prev.map((x) => (x.id === h.id ? { ...x, paused: next } : x)))
    const { error: err } = await supabase.from('harvests').update({ paused: next }).eq('id', h.id)
    if (err) {
      setHarvests((prev) => prev.map((x) => (x.id === h.id ? { ...x, paused: h.paused } : x)))
      setHarvestErr(err.message)
    }
  }

  const deleteHarvest = async (h: Harvest) => {
    if (!window.confirm(L('Delete this harvest? This cannot be undone.', 'ఈ కోతను తొలగించాలా? దీన్ని తిరిగి మార్చలేరు.'))) return
    const { error: err } = await supabase.from('harvests').delete().eq('id', h.id)
    if (err) { setHarvestErr(err.message); return }
    if (editingHarvestId === h.id) setEditingHarvestId(null)
    void loadHarvests()
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2.5">
      <p className="text-xs font-bold text-green-800">🌾 {L('Harvest timings', 'కోత సమయాలు')}</p>
      <div>
        <label className="text-[11px] font-semibold text-gray-600">{L('Harvest date & time', 'కోత తేదీ & సమయం')}</label>
        <input
          type="datetime-local"
          value={harvestedAt}
          onChange={(e) => setHarvestedAt(e.target.value)}
          className="mt-1 w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-gray-600">{L('Qty for sale', 'అమ్మకానికి పరిమాణం')} ({unit || 'kg'})</label>
        <input
          type="number" inputMode="decimal" min={0} placeholder="e.g. 20"
          value={approxQty}
          onChange={(e) => setApproxQty(e.target.value)}
          className="mt-1 w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>
      {harvestErr && <p className="text-[11px] text-red-600 font-semibold">{harvestErr}</p>}
      {harvestMsg && <p className="text-[11px] text-green-700 font-semibold">{harvestMsg}</p>}
      <button
        onClick={submitHarvest}
        disabled={savingHarvest}
        className="w-full bg-green-700 text-white font-bold py-2 rounded-lg text-sm active:bg-green-800 disabled:opacity-50"
      >
        {savingHarvest ? '…' : L('Save harvest', 'సేవ్ చేయి')}
      </button>

      {/* Logged harvests — each editable (date/time, shelf life, qty). */}
      {harvestsLoaded && harvests.length > 0 && (
        <div className="pt-1 border-t border-green-200 space-y-2">
          <p className="text-[11px] font-bold text-green-800 uppercase tracking-wide">
            {L('Logged harvests', 'నమోదైన కోతలు')}
          </p>
          {harvests.map((h) => (
            <div key={h.id} className="bg-white border border-green-200 rounded-lg p-2.5">
              {editingHarvestId === h.id ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600">{L('Harvest date & time', 'కోత తేదీ & సమయం')}</label>
                    <input
                      type="datetime-local"
                      value={editAt}
                      onChange={(e) => setEditAt(e.target.value)}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600">{L('Qty for sale', 'అమ్మకానికి పరిమాణం')} ({unit || 'kg'})</label>
                    <input
                      type="number" inputMode="decimal" min={0} placeholder="e.g. 20"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  {editErr && <p className="text-[11px] text-red-600 font-semibold">{editErr}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={saveEditHarvest}
                      disabled={savingEdit}
                      className="flex-1 bg-green-700 text-white font-bold py-2 rounded-lg text-sm active:bg-green-800 disabled:opacity-50"
                    >
                      {savingEdit ? '…' : L('Save changes', 'మార్పులు సేవ్ చేయి')}
                    </button>
                    <button
                      onClick={() => setEditingHarvestId(null)}
                      className="px-4 border border-gray-300 text-gray-600 font-semibold py-2 rounded-lg text-sm"
                    >
                      {L('Cancel', 'రద్దు')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  {/* Paused rows dim, so the list reads at a glance as "these
                      two are live, that one is hidden". */}
                  <div className={`min-w-0 ${h.paused ? 'opacity-50' : ''}`}>
                    <p className="text-xs font-semibold text-gray-800 truncate">
                      🌾 {harvestClock(h.harvested_at, L)}
                      {h.paused && (
                        <span className="ml-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5 align-middle">
                          {L('Paused', 'నిలిపివేయబడింది')}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {/* Freshness uses the produce's shelf life (per-harvest
                          shelf life is no longer collected). */}
                      {freshnessLabel(h.harvested_at, produceShelfLife ?? null, L) ?? harvestClock(h.harvested_at, L)}
                      {h.approx_quantity != null && <> · {h.approx_quantity} {h.unit || unit || 'kg'}</>}
                    </p>
                    {h.paused && (
                      <p className="text-[10px] text-amber-700 leading-snug mt-0.5">
                        {L('Hidden from buyers. Resume to sell it again.', 'కొనుగోలుదారులకు కనిపించదు. మళ్లీ అమ్మడానికి కొనసాగించండి.')}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1.5">
                    {/* Pause sits before Delete so the reversible action is the
                        one that falls under the thumb first. */}
                    <button
                      onClick={() => togglePause(h)}
                      className={`text-xs font-bold border rounded-lg px-2.5 py-1.5 ${
                        h.paused
                          ? 'text-green-700 border-green-300 active:bg-green-50'
                          : 'text-amber-700 border-amber-300 active:bg-amber-50'
                      }`}
                    >
                      {h.paused ? L('Resume', 'కొనసాగించు') : L('Pause', 'నిలిపివేయి')}
                    </button>
                    <button
                      onClick={() => startEditHarvest(h)}
                      className="text-xs font-bold text-green-700 border border-green-300 rounded-lg px-3 py-1.5 active:bg-green-50"
                    >
                      {L('Edit', 'సవరించు')}
                    </button>
                    <button
                      onClick={() => deleteHarvest(h)}
                      aria-label={L('Delete harvest', 'కోత తొలగించు')}
                      className="text-xs font-bold text-red-600 border border-red-200 rounded-lg px-2.5 py-1.5 active:bg-red-50"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

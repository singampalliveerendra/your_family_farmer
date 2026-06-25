'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'
import LanguageToggle from '@/components/LanguageToggle'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { supabase } from '@/lib/supabase'

type Intent = {
  id: string
  crop_name: string
  quantity_kg: number | null
  needed_by_date: string | null
  delivery_location: string | null
  fulfilled: boolean | null
  created_at: string
}

// Local, editable copy of an intent's fields while a row is being edited.
type EditDraft = { crop: string; qty: string; date: string; location: string }

export default function ConsumerIntentsPage() {
  const { L } = useLang()
  const { state, consumer, openAuth } = useConsumerAuth()
  const [intents, setIntents] = useState<Intent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft>({ crop: '', qty: '', date: '', location: '' })
  const [savingId, setSavingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!consumer) return
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('demand_intents')
      .select('id, crop_name, quantity_kg, needed_by_date, delivery_location, fulfilled, created_at')
      .eq('consumer_id', consumer.id)
      .order('created_at', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setIntents((data ?? []) as Intent[])
    setLoading(false)
  }, [consumer])

  useEffect(() => {
    if (state.status === 'authenticated') void refresh()
    else if (state.status === 'anonymous') setLoading(false)
  }, [state.status, refresh])

  const startEdit = (it: Intent) => {
    setEditingId(it.id)
    setDraft({
      crop: it.crop_name ?? '',
      qty: it.quantity_kg != null ? String(it.quantity_kg) : '',
      date: it.needed_by_date ?? '',
      location: it.delivery_location ?? '',
    })
  }

  const saveEdit = async (id: string) => {
    if (!draft.crop.trim()) { setError(L('Crop name is required.', 'పంట పేరు అవసరం.')); return }
    setSavingId(id)
    setError('')
    const patch = {
      crop_name: draft.crop.trim(),
      quantity_kg: draft.qty ? Number(draft.qty) : null,
      needed_by_date: draft.date || null,
      delivery_location: draft.location.trim() || null,
    }
    const { error: err } = await supabase
      .from('demand_intents')
      .update(patch)
      .eq('id', id)
      .eq('consumer_id', consumer?.id ?? '')
    setSavingId(null)
    if (err) { setError(err.message); return }
    setIntents((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
    setEditingId(null)
  }

  const remove = async (id: string) => {
    if (!confirm(L('Remove this intent?', 'ఈ డిమాండ్‌ను తొలగించాలా?'))) return
    setSavingId(id)
    setError('')
    const { error: err } = await supabase
      .from('demand_intents')
      .delete()
      .eq('id', id)
      .eq('consumer_id', consumer?.id ?? '')
    setSavingId(null)
    if (err) { setError(err.message); return }
    setIntents((prev) => prev.filter((it) => it.id !== id))
  }

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-green-900 px-4 pt-6 pb-10">
        <div className="flex items-center justify-between mb-4">
          <Link href="/consumer" className="text-green-300 text-sm flex items-center gap-1">
            {L('← Back', '← తిరిగి')}
          </Link>
          <LanguageToggle />
        </div>
        <h1 className="text-white text-xl font-extrabold leading-tight">
          {L('My raised intents', 'నా డిమాండ్‌లు')}
        </h1>
        <p className="text-green-400 text-sm mt-1">
          {L('Crops you asked local farmers for', 'మీరు రైతులను అడిగిన పంటలు')}
        </p>
      </div>

      <div className="px-4 -mt-5 space-y-4 max-w-lg mx-auto">
        {error && (
          <p className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</p>
        )}

        {/* Not logged in */}
        {state.status === 'anonymous' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center space-y-3">
            <div className="text-4xl">📋</div>
            <p className="text-gray-600 text-sm font-semibold">
              {L('Log in to see the intents you have raised.', 'మీరు నమోదు చేసిన డిమాండ్‌లను చూడటానికి లాగిన్ అవ్వండి.')}
            </p>
            <button
              onClick={openAuth}
              className="inline-block bg-green-700 text-white font-bold text-sm px-6 py-3 rounded-xl active:bg-green-800"
            >
              {L('Log in', 'లాగిన్')}
            </button>
          </div>
        )}

        {/* Loading */}
        {state.status !== 'anonymous' && loading && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
            <div className="w-9 h-9 border-4 border-green-700 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 text-sm mt-3">{L('Loading…', 'లోడ్ అవుతోంది…')}</p>
          </div>
        )}

        {/* Empty */}
        {state.status === 'authenticated' && !loading && intents.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center space-y-3">
            <div className="text-4xl">🌱</div>
            <p className="text-gray-600 text-sm font-semibold">
              {L("You haven't raised any intents yet.", 'మీరు ఇంకా ఏ డిమాండ్‌ను నమోదు చేయలేదు.')}
            </p>
            <Link href="/consumer" className="inline-block text-green-700 text-sm font-bold underline">
              {L('Raise one →', 'ఒకటి నమోదు చేయండి →')}
            </Link>
          </div>
        )}

        {/* List */}
        {state.status === 'authenticated' && !loading && intents.map((it) => (
          <div key={it.id} className="bg-white rounded-2xl border border-gray-100 p-4">
            {editingId === it.id ? (
              /* ── Edit mode ── */
              <div className="space-y-2.5">
                <input
                  type="text"
                  value={draft.crop}
                  onChange={(e) => setDraft((d) => ({ ...d, crop: e.target.value }))}
                  placeholder={L('Crop name *', 'పంట పేరు *')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={draft.qty}
                    onChange={(e) => setDraft((d) => ({ ...d, qty: e.target.value }))}
                    placeholder={L('Quantity (kg)', 'పరిమాణం')}
                    className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <input
                  type="text"
                  value={draft.location}
                  onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                  placeholder={L('Delivery location', 'డెలివరీ స్థలం')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setEditingId(null)}
                    className="flex-1 border-2 border-gray-300 text-gray-600 font-semibold py-2.5 rounded-xl text-sm"
                  >
                    {L('Cancel', 'రద్దు')}
                  </button>
                  <button
                    onClick={() => saveEdit(it.id)}
                    disabled={savingId === it.id}
                    className="flex-1 bg-green-700 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50"
                  >
                    {savingId === it.id ? L('Saving…', 'సేవ్…') : L('Save', 'సేవ్')}
                  </button>
                </div>
              </div>
            ) : (
              /* ── Read mode ── */
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-gray-900 text-base leading-tight">{it.crop_name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {it.quantity_kg ? `${it.quantity_kg} kg` : L('Any quantity', 'ఏదైనా పరిమాణం')}
                      {fmtDate(it.needed_by_date) ? ` · ${L('by', 'లోపు')} ${fmtDate(it.needed_by_date)}` : ''}
                    </p>
                    {it.delivery_location && (
                      <p className="text-xs text-gray-500 mt-0.5">📍 {it.delivery_location}</p>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      it.fulfilled ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {it.fulfilled ? L('Fulfilled', 'పూర్తయింది') : L('Open', 'తెరిచి ఉంది')}
                  </span>
                </div>

                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  {!it.fulfilled && (
                    <button
                      onClick={() => startEdit(it)}
                      className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2 rounded-xl text-sm active:bg-gray-50"
                    >
                      ✎ {L('Edit', 'సవరించు')}
                    </button>
                  )}
                  <button
                    onClick={() => remove(it.id)}
                    disabled={savingId === it.id}
                    className="flex-1 border border-red-200 text-red-600 font-semibold py-2 rounded-xl text-sm active:bg-red-50 disabled:opacity-50"
                  >
                    🗑 {L('Remove', 'తొలగించు')}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}

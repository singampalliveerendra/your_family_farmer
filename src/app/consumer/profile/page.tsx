'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import LanguageToggle from '@/components/LanguageToggle'
import AddressFields from '@/components/consumer/AddressFields'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { useLang } from '@/lib/LanguageContext'
import { EMPTY_ADDRESS, isAddressComplete, type SavedAddress } from '@/lib/savedAddress'

// "My address" — the buyer's one saved delivery address. The cart pre-selects
// it for home delivery so it isn't retyped on every order.
export default function ConsumerProfilePage() {
  const { L } = useLang()
  const { state, consumer, openAuth } = useConsumerAuth()
  const [addr, setAddr] = useState<SavedAddress>(EMPTY_ADDRESS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // Anonymous renders the log-in prompt before `loading` is ever checked.
    if (state.status !== 'authenticated') return
    let cancelled = false
    void (async () => {
      const r = await fetch('/api/consumer/profile', { credentials: 'same-origin' }).catch(() => null)
      const json = r ? await r.json().catch(() => ({})) : null
      if (cancelled) return
      if (!r || !r.ok) setError(json?.error ?? 'Could not load your address.')
      else if (json.address) setAddr(json.address as SavedAddress)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [state.status])

  const save = async () => {
    setSaving(true); setError(''); setSaved(false)
    const r = await fetch('/api/consumer/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(addr),
    }).catch(() => null)
    const json = r ? await r.json().catch(() => ({})) : null
    setSaving(false)
    if (!r || !r.ok) {
      setError(json?.error ?? L('Could not save. Check your connection.', 'సేవ్ కాలేదు. మీ కనెక్షన్ చూడండి.'))
      return
    }
    setAddr(json.address as SavedAddress)
    setSaved(true)
  }

  const complete = isAddressComplete(addr)
  const altPartial = addr.altPhone.length > 0 && addr.altPhone.length < 10

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      <div className="bg-green-900 px-4 pt-6 pb-10">
        <div className="flex items-center justify-between mb-4">
          <Link href="/consumer" className="text-green-300 text-sm flex items-center gap-1">{L('← Back', 'వెనక్కు')}</Link>
          <LanguageToggle />
        </div>
        <h1 className="text-white text-xl font-extrabold leading-tight">{L('My address', 'నా చిరునామా')}</h1>
        <p className="text-green-400 text-sm mt-1">
          {L('Saved for home delivery, so you don’t type it every order', 'హోమ్ డెలివరీ కోసం సేవ్ — ప్రతి ఆర్డర్‌కు టైప్ చేయనక్కర్లేదు')}
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-6">
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          {state.status === 'anonymous' ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-gray-600">{L('Log in to save your address.', 'చిరునామా సేవ్ చేయడానికి లాగిన్ అవ్వండి.')}</p>
              <button onClick={() => openAuth()} className="bg-green-700 text-white font-bold text-sm rounded-xl px-5 py-2.5">
                {L('Log in', 'లాగిన్')}
              </button>
            </div>
          ) : loading ? (
            <p className="text-sm text-gray-500 py-6 text-center">{L('Loading…', 'లోడ్ అవుతోంది…')}</p>
          ) : (
            <>
              {consumer && (
                <p className="text-xs text-gray-500">
                  {consumer.name ?? ''} · +91 {consumer.phone}
                </p>
              )}
              <AddressFields value={addr} onChange={(a) => { setAddr(a); setSaved(false) }} />
              {error && <p className="text-[12px] text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
              {saved && <p className="text-[12px] text-green-800 bg-green-50 rounded-xl px-3 py-2">{L('✓ Address saved', '✓ చిరునామా సేవ్ అయింది')}</p>}
              <button
                onClick={save}
                disabled={!complete || altPartial || saving}
                className="w-full bg-green-700 disabled:bg-gray-300 text-white font-extrabold text-sm rounded-xl py-3"
              >
                {saving ? L('Saving…', 'సేవ్ అవుతోంది…') : L('Save address', 'చిరునామా సేవ్ చేయండి')}
              </button>
              {!complete && (
                <p className="text-[11px] text-gray-500">
                  {L('Needs the full address, city/town and a 6-digit PIN code.', 'పూర్తి చిరునామా, నగరం మరియు 6 అంకెల పిన్ కోడ్ అవసరం.')}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}

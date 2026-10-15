'use client'

import { useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { farmerFetch, isFarmerSessionExpired } from '@/lib/farmer-auth-client'
import { RESOLVE_NOTE_MAX } from '@/lib/farmerResolve'

/** The order fields the server stamped, merged into the caller's copy. */
export type ResolvedFields = {
  shipped_at?: string | null
  collected_at?: string | null
  received_at?: string | null
  farmer_resolved_at?: string | null
}

// "Mark as resolved" for a farmer / aggregator whose buyer can't be reached to
// read the handover code. A quiet link first, then a confirm panel that says
// plainly what happens, with an optional note for the record. Shown only when
// canFarmerResolve() allows it (src/lib/farmerResolve.ts); the route checks
// the same rules again.
export default function ResolveOrderButton({
  orderId,
  isPickup,
  onResolved,
}: {
  orderId: string
  isPickup: boolean
  onResolved: (fields: ResolvedFields) => void
}) {
  const { L } = useLang()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      const res = await farmerFetch(`/api/farmer/orders/${orderId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || L('Could not mark the order resolved. Please try again.', 'ఆర్డర్ పూర్తయినట్లు గుర్తించలేకపోయాం. మళ్ళీ ప్రయత్నించండి.'))
        return
      }
      setOpen(false)
      onResolved((json.order ?? {}) as ResolvedFields)
    } catch (e) {
      if (isFarmerSessionExpired(e)) return
      setErr(L('Network error. Please try again.', 'నెట్‌వర్క్ సమస్య. మళ్ళీ ప్రయత్నించండి.'))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setErr(null) }}
        className="w-full border border-gray-300 text-gray-700 font-bold py-2.5 rounded-xl text-sm active:bg-gray-50"
      >
        ✓ {L('Mark as resolved', 'పూర్తయినట్లు గుర్తించండి')}
      </button>
    )
  }

  return (
    <div className="bg-gray-50 border border-gray-300 rounded-xl p-3 space-y-2">
      <p className="text-sm font-bold text-gray-900">
        {L('Mark this order as resolved?', 'ఈ ఆర్డర్ పూర్తయినట్లు గుర్తించాలా?')}
      </p>
      <p className="text-xs text-gray-600 leading-snug">
        {isPickup
          ? L('Only do this if the buyer has already collected the produce but could not give you the code.',
              'కొనుగోలుదారు ఇప్పటికే పంటను తీసుకెళ్లి, కోడ్ ఇవ్వలేకపోతే మాత్రమే ఇది చేయండి.')
          : L('Only do this if the buyer has already received the produce but could not give you the code.',
              'కొనుగోలుదారుకు ఇప్పటికే పంట అంది, కోడ్ ఇవ్వలేకపోతే మాత్రమే ఇది చేయండి.')}
        {' '}
        {L('The order moves to Completed for you and the buyer, and the buyer is told you marked it.',
           'ఆర్డర్ మీకు, కొనుగోలుదారుకు పూర్తయిన వాటిలోకి వెళ్తుంది. మీరు గుర్తించారని కొనుగోలుదారుకు తెలుస్తుంది.')}
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, RESOLVE_NOTE_MAX))}
        rows={2}
        placeholder={L('Note (optional) — e.g. handed to his brother', 'గమనిక (ఐచ్ఛికం) — ఉదా: వారి తమ్ముడికి ఇచ్చాను')}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-base resize-none bg-white focus:border-green-500 focus:outline-none"
      />
      {err && <p className="text-[11px] text-red-600 font-semibold">{err}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="border border-gray-300 text-gray-600 font-bold py-2.5 rounded-xl text-sm active:bg-white disabled:opacity-50"
        >
          {L('Cancel', 'రద్దు')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="bg-green-700 text-white font-bold py-2.5 rounded-xl text-sm active:bg-green-800 disabled:opacity-50"
        >
          {busy ? '…' : L('Yes, resolved', 'అవును, పూర్తయింది')}
        </button>
      </div>
    </div>
  )
}

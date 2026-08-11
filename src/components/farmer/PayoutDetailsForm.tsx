'use client'

import { useEffect, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'

// Where we send this seller's money. Farmers and aggregators both use this —
// an aggregator is a `farmers` row with account_type = 'aggregator'.
//
// This form deliberately does NOT go through the profile save. That path writes
// to `farmers` with the anon key, and `farmers` is world-readable and
// anon-writable, so bank details there would be public and rewritable by a
// stranger. These fields post to /api/farmer/payout-details, which is gated on
// the signed farmer cookie and writes with the service-role key.
//
// Payout is manual — we receive payment, work out the shares and transfer by
// hand — so nothing here touches the order or payment flow.

type Saved = {
  hasAccount: boolean
  accountHolderName?: string
  accountLast4?: string
  ifsc?: string
  upiId?: string | null
}

export default function PayoutDetailsForm() {
  const { L } = useLang()

  const [saved, setSaved] = useState<Saved | null>(null)
  const [holder, setHolder] = useState('')
  const [account, setAccount] = useState('')
  const [ifsc, setIfsc] = useState('')
  const [upi, setUpi] = useState('')

  // Once an account is on file we show the masked number and keep the form
  // collapsed, so the common case is "yes, it's set" rather than a wall of
  // inputs the farmer might edit by accident.
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/farmer/payout-details', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.ok) return
        setSaved(j)
        setHolder(j.accountHolderName ?? '')
        setIfsc(j.ifsc ?? '')
        setUpi(j.upiId ?? '')
        if (!j.hasAccount) setEditing(true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function save() {
    setError('')
    setSuccess(false)
    setBusy(true)
    try {
      const res = await fetch('/api/farmer/payout-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          account_holder_name: holder,
          account_number: account,
          ifsc,
          upi_id: upi,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error || 'Could not save. Please try again.')
        return
      }
      setSaved({
        hasAccount: true,
        accountHolderName: holder.trim(),
        accountLast4: json.accountLast4,
        ifsc: ifsc.trim().toUpperCase(),
        upiId: upi.trim() || null,
      })
      setAccount('')
      setEditing(false)
      setSuccess(true)
    } catch {
      setError('Could not save. Please check your connection.')
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none'

  return (
    <>
      <div className="pt-3 border-t-2 border-green-100">
        <h4 className="text-sm font-extrabold text-green-800">
          {L('Payout Details', 'చెల్లింపు ఖాతా వివరాలు')}
        </h4>
        <p className="text-[11px] text-gray-500">
          {L('The bank account we send your money to', 'మీ డబ్బు పంపే బ్యాంక్ ఖాతా')}
        </p>
      </div>

      <div className="space-y-4 border border-gray-200 rounded-2xl p-4">
        {saved?.hasAccount && !editing ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3">
              <span className="text-lg">🏦</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-green-900 truncate">
                  {saved.accountHolderName}
                </span>
                <span className="block text-[11px] text-green-700 font-mono">
                  {saved.accountLast4} · {saved.ifsc}
                </span>
              </span>
            </div>
            {saved.upiId && (
              <p className="text-[11px] text-gray-500">UPI: {saved.upiId}</p>
            )}
            <button
              type="button"
              onClick={() => { setEditing(true); setSuccess(false) }}
              className="text-sm font-bold text-green-700 active:text-green-900"
            >
              {L('Change account', 'ఖాతా మార్చండి')}
            </button>
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1">
                {L('Account holder name', 'ఖాతాదారు పేరు')}
              </label>
              <p className="text-[11px] text-gray-500 mb-2">
                {L('Exactly as it appears on your passbook.', 'మీ పాస్‌బుక్‌లో ఉన్నట్టే.')}
              </p>
              <input
                type="text"
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                placeholder={L('Full name', 'పూర్తి పేరు')}
                className={inputCls}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1">
                {L('Account number', 'ఖాతా నంబర్')}
              </label>
              {saved?.hasAccount && (
                <p className="text-[11px] text-amber-700 mb-2">
                  {L(
                    `Currently ${saved.accountLast4}. Type the full number again to change it.`,
                    `ప్రస్తుతం ${saved.accountLast4}. మార్చాలంటే పూర్తి నంబర్ మళ్లీ టైప్ చేయండి.`,
                  )}
                </p>
              )}
              <input
                type="text"
                inputMode="numeric"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="00000000000"
                className={inputCls}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1">
                IFSC
              </label>
              <input
                type="text"
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                placeholder="SBIN0001234"
                className={`${inputCls} font-mono`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1">
                {L('UPI ID (optional)', 'UPI ID (ఐచ్ఛికం)')}
              </label>
              <input
                type="text"
                inputMode="email"
                value={upi}
                onChange={(e) => setUpi(e.target.value.trim())}
                placeholder="yourname@ybl"
                className={inputCls}
              />
            </div>

            {error && (
              <p className="text-sm font-semibold text-red-600">{error}</p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="flex-1 bg-green-700 text-white font-bold py-3 rounded-xl text-sm active:bg-green-800 disabled:opacity-50"
              >
                {busy ? L('Saving…', 'సేవ్ అవుతోంది…') : L('Save payout details', 'సేవ్ చేయండి')}
              </button>
              {saved?.hasAccount && (
                <button
                  type="button"
                  onClick={() => { setEditing(false); setError(''); setAccount('') }}
                  className="text-sm font-bold text-gray-500 active:text-gray-700"
                >
                  {L('Cancel', 'రద్దు')}
                </button>
              )}
            </div>
          </>
        )}

        {success && (
          <p className="text-sm font-semibold text-green-700">
            ✓ {L('Payout details saved.', 'చెల్లింపు వివరాలు సేవ్ అయ్యాయి.')}
          </p>
        )}

        <p className="text-[11px] text-gray-400 leading-relaxed">
          {L(
            'Only you and the Go Grameen team can see these details. They are never shown to buyers.',
            'ఈ వివరాలు మీకు మరియు Go Grameen బృందానికి మాత్రమే కనిపిస్తాయి. కొనుగోలుదారులకు ఎప్పుడూ చూపబడవు.',
          )}
        </p>
      </div>
    </>
  )
}

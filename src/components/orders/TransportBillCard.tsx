'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'
import { formatQty } from '@/lib/saleStep'
import type { BillView } from '@/lib/transportBill'

/* The transport bill on one bulk order (client decision 2026-11-05). For a lot
 * charged per km or by cargo bill, the online payment covered only the produce:
 *   seller — after shipping, enters the km (per km; the app works out the bill)
 *            or the cargo bill's amount + the bill itself, sends it, and ticks
 *            "Transport paid" when the buyer pays them directly;
 *   buyer  — sees the amount, opens / downloads the bill, pays the seller.
 * The bill file sits in a private bucket: opening it asks the server for a
 * short-lived link (/api/orders/[id]/cargo-bill). */

type Role = 'seller' | 'buyer'
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

export default function TransportBillCard({ orderId, bill, role, canSend, onChanged }: {
  orderId: string
  bill: BillView | null | undefined
  role: Role
  /** Seller only: the order is approved and shipped (the server checks again). */
  canSend?: boolean
  onChanged?: () => void
}) {
  const { L } = useLang()
  const [editing, setEditing] = useState(false)
  const [km, setKm] = useState('')
  const [amount, setAmount] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (!bill || bill.state === 'online') return null
  const perKm = bill.mode === 'per_km'
  const rate = bill.rate ?? 0
  const kmNum = Number(km)
  const kmTotal = perKm && kmNum > 0 ? Math.round(kmNum * rate) : null

  const openBill = async () => {
    setErr('')
    const r = await fetch(`/api/orders/${orderId}/cargo-bill`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null)
    const j = r ? await r.json().catch(() => null) : null
    if (!r?.ok || !j?.url) { setErr(j?.error ?? L('Could not open the bill.', 'బిల్లు తెరవలేకపోయాం.')); return }
    window.open(j.url as string, '_blank', 'noopener')
  }

  const send = async () => {
    setErr('')
    setBusy(true)
    try {
      let billPath: string | undefined
      if (file) {
        const ext = (file.name.split('.').pop() || file.type.split('/')[1] || 'jpg').toLowerCase()
        const u = await fetch(`/api/farmer/orders/${orderId}/transport-bill/upload`, {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ext }),
        }).catch(() => null)
        const uj = u ? await u.json().catch(() => null) : null
        if (!u?.ok || !uj?.token) { setErr(uj?.error ?? L('Could not upload the bill.', 'బిల్లు అప్‌లోడ్ కాలేదు.')); return }
        const { error } = await supabase.storage.from('cargo-bills').uploadToSignedUrl(uj.path, uj.token, file, { contentType: uj.contentType })
        if (error) { setErr(L(`Could not upload the bill: ${error.message}`, `బిల్లు అప్‌లోడ్ కాలేదు: ${error.message}`)); return }
        billPath = uj.path as string
      }
      const r = await fetch(`/api/farmer/orders/${orderId}/transport-bill`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(perKm ? { km: kmNum, billPath } : { amount: Number(amount), billPath }),
      }).catch(() => null)
      const j = r ? await r.json().catch(() => null) : null
      if (!r?.ok) { setErr(j?.error ?? L('Could not send the bill.', 'బిల్లు పంపలేకపోయాం.')); return }
      setEditing(false); setFile(null)
      onChanged?.()
    } finally {
      setBusy(false)
    }
  }

  const setPaid = async (paid: boolean) => {
    setErr('')
    setBusy(true)
    const r = await fetch(`/api/farmer/orders/${orderId}/transport-paid`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paid }),
    }).catch(() => null)
    setBusy(false)
    if (!r?.ok) { const j = r ? await r.json().catch(() => null) : null; setErr(j?.error ?? L('Could not save.', 'సేవ్ కాలేదు.')); return }
    onChanged?.()
  }

  const how = perKm
    ? L(`Transport: ₹${formatQty(rate)} per km, billed after delivery`, `రవాణా: కి.మీ.కు ₹${formatQty(rate)}, డెలివరీ తర్వాత బిల్లు`)
    : L('Transport: as per the actual cargo bill, after delivery', 'రవాణా: అసలు కార్గో బిల్లు ప్రకారం, డెలివరీ తర్వాత')

  const showForm = role === 'seller' && canSend && (bill.state === 'awaiting' || (bill.state === 'billed' && editing))
  const inputCls = 'w-full min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-sm focus:border-green-500 focus:outline-none'

  return (
    <section className="rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-4 text-sm" aria-label={L('Transport bill', 'రవాణా బిల్లు')}>
      <p className="font-extrabold text-amber-900">🚚 {L('Transport bill', 'రవాణా బిల్లు')}</p>
      <p className="mt-0.5 text-xs text-amber-900/80">{how}</p>

      {bill.state === 'awaiting' && !showForm && (
        <p className="mt-2 text-[13px] leading-snug text-black/70">
          {role === 'buyer'
            ? L('The seller sends the transport bill after delivery. You pay it to them directly.', 'డెలివరీ తర్వాత అమ్మకందారు రవాణా బిల్లు పంపుతారు. మీరు నేరుగా వారికి చెల్లిస్తారు.')
            : L('Mark the order Shipped, then send the transport bill here.', 'ఆర్డర్‌ను పంపినట్లు గుర్తించి, తర్వాత ఇక్కడ రవాణా బిల్లు పంపండి.')}
        </p>
      )}

      {(bill.state === 'billed' || bill.state === 'paid') && !showForm && (
        <div className="mt-2 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-black/65">{bill.km != null ? L(`${formatQty(bill.km)} km × ₹${formatQty(rate)}`, `${formatQty(bill.km)} కి.మీ. × ₹${formatQty(rate)}`) : L('Cargo bill', 'కార్గో బిల్లు')}</span>
            <span className="text-lg font-extrabold">{inr(bill.amount)}</span>
          </div>
          {bill.state === 'paid' ? (
            <p className="rounded-lg bg-[#e7f0e9] px-3 py-1.5 text-[13px] font-bold text-[#1f4a35]">✓ {L('Transport paid to the seller', 'రవాణా ఛార్జ్ అమ్మకందారుకు చెల్లించారు')}</p>
          ) : (
            <p className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold text-amber-900">
              {role === 'buyer'
                ? L('Pay this to the seller directly (cash / UPI / bank).', 'దీన్ని నేరుగా అమ్మకందారుకు చెల్లించండి (నగదు / UPI / బ్యాంక్).')
                : L('Waiting for the buyer to pay you.', 'కొనుగోలుదారు మీకు చెల్లించడానికి వేచి ఉంది.')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {bill.hasFile && (
              <button type="button" onClick={openBill} className="min-h-[40px] rounded-xl bg-white px-3 text-[13px] font-bold text-[#27486a] ring-1 ring-black/10">
                📄 {L('View / download bill', 'బిల్లు చూడండి / డౌన్‌లోడ్')}
              </button>
            )}
            {role === 'seller' && bill.state === 'billed' && (
              <>
                <button type="button" disabled={busy} onClick={() => void setPaid(true)} className="min-h-[40px] rounded-xl bg-[#1f7a4d] px-3 text-[13px] font-bold text-white disabled:opacity-60">
                  ✓ {L('Mark transport paid', 'రవాణా చెల్లించినట్లు గుర్తించు')}
                </button>
                {canSend && (
                  <button type="button" onClick={() => { setEditing(true); setKm(bill.km != null ? String(bill.km) : ''); setAmount(bill.km == null ? String(bill.amount) : '') }} className="min-h-[40px] rounded-xl bg-white px-3 text-[13px] font-bold text-gray-700 ring-1 ring-black/10">
                    {L('Edit bill', 'బిల్లు మార్చు')}
                  </button>
                )}
              </>
            )}
            {role === 'seller' && bill.state === 'paid' && (
              <button type="button" disabled={busy} onClick={() => void setPaid(false)} className="min-h-[40px] text-[12px] font-semibold text-gray-500 underline">
                {L('Not paid yet? Undo', 'ఇంకా చెల్లించలేదా? వెనక్కి')}
              </button>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div className="mt-3 space-y-2.5">
          {perKm ? (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-700">{L('Distance travelled (km)', 'ప్రయాణించిన దూరం (కి.మీ.)')}</span>
              <input type="text" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder={L('e.g. 20', 'ఉదా. 20')} className={inputCls} />
              {kmTotal !== null && (
                <span className="mt-1 block text-[13px] font-bold text-amber-900">
                  {L(`${formatQty(kmNum)} km × ₹${formatQty(rate)} = ${inr(kmTotal)}`, `${formatQty(kmNum)} కి.మీ. × ₹${formatQty(rate)} = ${inr(kmTotal)}`)}
                </span>
              )}
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-700">{L('Amount on the cargo bill (₹)', 'కార్గో బిల్లుపై మొత్తం (₹)')}</span>
              <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={L('e.g. 1200', 'ఉదా. 1200')} className={inputCls} />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-700">
              {perKm ? L('Cargo bill (optional)', 'కార్గో బిల్లు (ఐచ్ఛికం)') : L('Cargo bill — photo or PDF', 'కార్గో బిల్లు — ఫోటో లేదా PDF')}
            </span>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-[13px]" />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void send()} className="min-h-[44px] flex-1 rounded-xl bg-[#27486a] px-4 text-sm font-bold text-white disabled:opacity-60">
              {busy ? L('Sending…', 'పంపుతోంది…') : L('Send bill to the buyer', 'కొనుగోలుదారుకు బిల్లు పంపండి')}
            </button>
            {editing && <button type="button" onClick={() => setEditing(false)} className="min-h-[44px] rounded-xl bg-white px-4 text-sm font-bold text-gray-600 ring-1 ring-black/10">{L('Cancel', 'రద్దు')}</button>}
          </div>
        </div>
      )}

      {err && <p className="mt-2 text-[13px] font-semibold text-red-700">{err}</p>}
    </section>
  )
}

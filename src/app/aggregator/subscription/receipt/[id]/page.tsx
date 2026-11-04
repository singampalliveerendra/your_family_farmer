'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'
import { requireFarmerSession } from '@/lib/farmer-auth-client'
import BackButton from '@/components/BackButton'
import { receiptDate, type Msg } from '@/lib/orderReceipt'
import { buildSubscriptionReceipt, type ReceiptSub, type SubscriptionReceipt } from '@/lib/subscriptionReceipt'

// The receipt for one subscription payment, saved as a PDF with the phone's
// own print screen — the same approach as the order receipt
// (/farmer/dashboard/orders/[id]/receipt): Telugu prints correctly and no
// library is needed. Rows come from the aggregator's own
// /api/aggregator/subscription, so nobody can open another's receipt.

export default function SubscriptionReceiptPage() {
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === 'string' ? params.id : ''
  const { lang, L } = useLang()
  const t = (m: Msg) => m[lang === 'te' ? 'te' : 'en']
  const [r, setR] = useState<SubscriptionReceipt | null>(null)
  const [seller, setSeller] = useState<{ name?: string; village?: string; phone?: string } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void (async () => {
      const me = await requireFarmerSession()
      if (!me || cancelled) return
      const [res, who] = await Promise.all([
        fetch('/api/aggregator/subscription', { credentials: 'same-origin', cache: 'no-store' }).then((x) => (x.ok ? x.json() : null)).catch(() => null),
        Promise.resolve(supabase.from('farmers').select('name, village, phone').eq('id', me).maybeSingle()).catch(() => ({ data: null })),
      ])
      if (cancelled) return
      const row = ((res?.subscriptions ?? []) as ReceiptSub[]).find((s) => s.id === id)
      const built = row ? buildSubscriptionReceipt(row) : null
      if (!built) { setState('missing'); return }
      setR(built)
      setSeller((who.data ?? null) as typeof seller)
      setState('ready')
    })()
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (!r) return
    const before = document.title
    document.title = r.fileName
    return () => { document.title = before }
  }, [r])

  return (
    <main className="min-h-screen bg-[#f7f4ec] pb-28 print:bg-white print:pb-0">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          html, body { background: #fff !important; }
          body *:not(:has(#yff-receipt)):not(#yff-receipt):not(#yff-receipt *) { display: none !important; }
          main { min-height: 0 !important; padding: 0 !important; }
          #yff-receipt { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; padding: 0 !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="bg-[#27486a] px-4 pb-8 pt-5 text-white print:hidden">
        <BackButton fallback="/aggregator/subscription" className="mb-4 !text-white/80" />
        <h1 className="text-xl font-extrabold">{L('Subscription receipt', 'సబ్‌స్క్రిప్షన్ రసీదు')}</h1>
        <p className="mt-1 text-xs text-white/75">{L('Tap Download PDF, then choose “Save as PDF”.', '“PDF డౌన్‌లోడ్” నొక్కి, తర్వాత “Save as PDF” ఎంచుకోండి.')}</p>
      </div>

      <div className="mx-auto -mt-4 max-w-xl px-3 print:m-0 print:max-w-none print:p-0">
        {state === 'loading' && <div className="h-40 animate-pulse rounded-2xl bg-white" />}
        {state === 'missing' && (
          <div className="space-y-3 rounded-2xl bg-white p-6 text-center">
            <p className="font-bold">{L('Receipt not found', 'రసీదు కనబడలేదు')}</p>
            <Link href="/aggregator/subscription" className="text-sm font-bold text-[#27486a] underline">{L('Back to your plan', 'మీ ప్లాన్‌కు తిరిగి')}</Link>
          </div>
        )}
        {r && (
          <article id="yff-receipt" className="rounded-2xl border border-black/10 bg-white p-5 text-[#1d2a20] shadow-sm">
            <header className="flex items-start justify-between gap-3 border-b-2 border-[#27486a] pb-3">
              <div>
                <p className="text-lg font-black leading-none text-[#27486a]">Go Grameen</p>
                <p className="mt-1 text-[11px] text-black/55">gogrameen.in</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wide text-black/55">{L('Subscription receipt', 'సబ్‌స్క్రిప్షన్ రసీదు')}</p>
                <p className="break-all font-mono text-sm font-bold">{r.number}</p>
                <p className="text-[11px] text-black/60">{r.issuedAt}</p>
              </div>
            </header>

            <section className="mt-4 text-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-black/55">{L('Billed to', 'ఎవరికి')} · {L('Aggregator', 'అగ్రిగేటర్')}</p>
              <p className="font-bold">{seller?.name || '—'}</p>
              {seller?.village && <p className="text-xs text-black/60">{seller.village}</p>}
              {seller?.phone && <p className="text-xs text-black/60">+91 {seller.phone}</p>}
            </section>

            <section className="mt-4 rounded-xl bg-[#e5ecf3]/60 p-3 text-sm">
              <p className="font-bold">{r.planName}</p>
              <p className="text-xs text-black/65">
                {t(r.kind)}{r.duration ? ` · ${t(r.duration)}` : ''}
              </p>
              <p className="mt-1 text-xs text-black/65">{L('Valid', 'చెల్లుబాటు')}: {r.period.from} – {r.period.to}</p>
            </section>

            <section className="ml-auto mt-4 w-full max-w-[280px] space-y-1 text-sm">
              {r.lines.map((l) => (
                <div key={l.label.en} className="flex justify-between gap-3">
                  <span className="text-black/60">{t(l.label)}</span>
                  <span className={`font-semibold ${l.tone === 'saving' ? 'text-[#2f6f4f]' : ''}`}>{l.value}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t-2 border-black pt-1.5">
                <span className="font-bold">{L('Total paid', 'మొత్తం చెల్లింపు')}</span>
                <span className="font-black text-[#27486a]">{r.total}</span>
              </div>
            </section>

            <dl className="mt-5 space-y-0.5 text-sm">
              {r.payment.map((p) => (
                <div key={p.label.en} className="flex gap-2">
                  <dt className="shrink-0 text-black/60">{t(p.label)}:</dt>
                  <dd className="min-w-0 break-words font-semibold">{typeof p.value === 'string' ? p.value : t(p.value)}</dd>
                </div>
              ))}
            </dl>

            <footer className="mt-6 border-t border-black/10 pt-3 text-[10px] leading-snug text-black/55">
              <p>{L('No refunds or part payments. Computer-generated receipt — no signature needed. This is not a GST invoice.', 'రీఫండ్‌లు, పాక్షిక చెల్లింపులు లేవు. కంప్యూటర్ ద్వారా తయారైన రసీదు — సంతకం అవసరం లేదు. ఇది GST ఇన్వాయిస్ కాదు.')}</p>
              <p className="mt-0.5">{L('Generated on', 'తయారైన తేదీ')} {receiptDate(new Date().toISOString())}</p>
            </footer>
          </article>
        )}
      </div>

      {r && (
        <div className="fixed inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom,0px))] mx-auto max-w-xl px-4 print:hidden">
          <button type="button" onClick={() => window.print()} className="h-12 w-full rounded-xl bg-[#27486a] font-bold text-white shadow-lg">
            ⬇ {L('Download PDF', 'PDF డౌన్‌లోడ్')}
          </button>
        </div>
      )}
    </main>
  )
}

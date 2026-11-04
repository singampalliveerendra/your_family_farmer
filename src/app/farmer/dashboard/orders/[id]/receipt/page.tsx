'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'
import { requireFarmerSession } from '@/lib/farmer-auth-client'
import { buildOrderReceipt, receiptDate, rowText, type OrderReceipt, type ReceiptOrder, type ReceiptRow, type ReceiptSeller } from '@/lib/orderReceipt'
import BackButton from '@/components/BackButton'

// The order receipt, saved as a PDF with the phone's own print screen
// ("Save as PDF") — decision 2026-11-04: PDF only, one receipt per order.
// Farmers and aggregators both land here (the aggregator dashboard reuses the
// farmer order screens). The order comes from the same cookie-scoped API as
// the order screen, so nobody can print another seller's order. Every number
// and label is built in src/lib/orderReceipt.ts.

export default function OrderReceiptPage() {
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === 'string' ? params.id : ''
  const { lang, L } = useLang()
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void (async () => {
      const farmerId = await requireFarmerSession()
      if (!farmerId || cancelled) return
      const [orderRes, sellerRes] = await Promise.all([
        fetch(`/api/farmer/orders/${id}`, { credentials: 'same-origin' }).catch(() => null),
        // Public profile columns only (the same ones buyers already see).
        Promise.resolve(
          supabase.from('farmers').select('name, village, phone, account_type').eq('id', farmerId).maybeSingle(),
        ).catch(() => ({ data: null })),
      ])
      const json = orderRes && orderRes.ok ? await orderRes.json().catch(() => null) : null
      const order = (json?.order ?? null) as ReceiptOrder | null
      if (cancelled) return
      if (!order) { setState('missing'); return }
      setReceipt(buildOrderReceipt(order, (sellerRes.data ?? null) as ReceiptSeller | null))
      setState('ready')
    })()
    return () => { cancelled = true }
  }, [id])

  // Browsers name the saved PDF after the page title.
  useEffect(() => {
    if (!receipt) return
    const before = document.title
    document.title = receipt.fileName
    return () => { document.title = before }
  }, [receipt])

  const t = (m: { en: string; te: string }) => m[lang === 'te' ? 'te' : 'en']
  const v = (r: ReceiptRow) => rowText(r.value, lang === 'te' ? 'te' : 'en')

  return (
    <main className="min-h-screen bg-gray-100 pb-28 print:bg-white print:pb-0">
      {/* Only the receipt prints. Everything that is neither the receipt, inside
          it, nor a box that holds it (the app's bars, splash, this page's
          header and button) is taken out of the layout — display, not
          visibility, so it leaves no blank second page behind. */}
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

      <div className="bg-green-900 px-4 pt-6 pb-8 print:hidden">
        <BackButton fallback={`/farmer/dashboard/orders/${id}`} className="mb-4" />
        <h1 className="text-white text-xl font-extrabold leading-tight">🧾 {L('Order receipt', 'ఆర్డర్ రసీదు')}</h1>
        <p className="text-green-300 text-xs mt-1">
          {L('Tap Download PDF, then choose “Save as PDF”.', '“PDF డౌన్‌లోడ్” నొక్కి, తర్వాత “Save as PDF” ఎంచుకోండి.')}
        </p>
      </div>

      <div className="px-3 -mt-4 max-w-xl mx-auto print:m-0 print:p-0 print:max-w-none">
        {state === 'loading' && (
          <div className="bg-white rounded-2xl p-6 text-center">
            <div className="w-9 h-9 border-4 border-green-700 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}
        {state === 'missing' && (
          <div className="bg-white rounded-2xl p-6 text-center space-y-3">
            <p className="text-gray-700 font-bold">{L('Order not found', 'ఆర్డర్ కనబడలేదు')}</p>
            <Link href="/farmer/dashboard/orders" className="text-green-700 text-sm font-bold underline">
              {L('Back to orders', 'ఆర్డర్లకు తిరిగి వెళ్ళు')}
            </Link>
          </div>
        )}

        {receipt && (
          <article id="yff-receipt" className="relative bg-white rounded-2xl shadow-sm border border-gray-200 p-5 text-gray-900 overflow-hidden">
            {receipt.void && (
              <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rotate-[-18deg] border-4 border-red-300 text-red-300 text-4xl font-black px-4 py-1 rounded-lg uppercase tracking-widest">
                  {t(receipt.status)}
                </span>
              </div>
            )}

            {/* Brand + number */}
            <header className="flex items-start justify-between gap-3 border-b-2 border-green-800 pb-3">
              <div>
                <p className="text-lg font-black text-green-800 leading-none">🌾 Go Grameen</p>
                <p className="text-[11px] text-gray-500 mt-1">gogrameen.in</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{L('Order receipt', 'ఆర్డర్ రసీదు')}</p>
                <p className="text-sm font-mono font-bold break-all">{receipt.number}</p>
                <p className="text-[11px] text-gray-600">{receipt.placedAt}</p>
              </div>
            </header>

            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${receipt.void ? 'border-red-300 text-red-700' : 'border-green-300 text-green-800'}`}>
                {t(receipt.status)}
              </span>
              {receipt.tags.map((tag) => (
                <span key={tag.en} className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-amber-300 text-amber-800">{t(tag)}</span>
              ))}
            </div>

            {/* Seller / buyer */}
            <section className="grid grid-cols-2 gap-3 mt-4 text-sm">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{L('Seller', 'అమ్మకందారు')} · {t(receipt.seller.role)}</p>
                <p className="font-bold leading-snug">{receipt.seller.name}</p>
                {receipt.seller.place && <p className="text-xs text-gray-600">{receipt.seller.place}</p>}
                {receipt.seller.phone && <p className="text-xs text-gray-600">+91 {receipt.seller.phone}</p>}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{L('Buyer', 'కొనుగోలుదారు')}</p>
                <p className="font-bold leading-snug">{receipt.buyer.name}</p>
                {receipt.buyer.phone && <p className="text-xs text-gray-600">+91 {receipt.buyer.phone}</p>}
              </div>
            </section>

            {/* Item */}
            <table className="w-full mt-4 text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                  <th className="text-left font-bold py-1.5 px-2">{L('Produce', 'పంట')}</th>
                  <th className="text-right font-bold py-1.5 px-2">{L('Qty', 'పరిమాణం')}</th>
                  <th className="text-right font-bold py-1.5 px-2">{L('Rate', 'ధర')}</th>
                  <th className="text-right font-bold py-1.5 px-2">{L('Amount', 'మొత్తం')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="py-2 px-2 font-semibold">{receipt.item.name}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">{receipt.item.qty}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">{receipt.item.rate}</td>
                  <td className="py-2 px-2 text-right font-semibold whitespace-nowrap">{receipt.item.amount}</td>
                </tr>
              </tbody>
            </table>

            {/* Money */}
            <section className="mt-3 ml-auto w-full max-w-[260px] text-sm space-y-1">
              {receipt.money.map((r) => (
                <div key={r.label.en} className="flex justify-between gap-3">
                  <span className="text-gray-600">{t(r.label)}</span>
                  <span className="font-semibold">{v(r)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t-2 border-gray-900 pt-1.5">
                <span className="font-bold">{L('Buyer pays', 'కొనుగోలుదారు చెల్లించేది')}</span>
                <span className="font-black text-green-800">{receipt.total}</span>
              </div>
            </section>

            {/* Payment + pickup/delivery */}
            <section className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-4 mt-5 text-sm">
              <Rows title={L('Payment', 'చెల్లింపు')} rows={receipt.payment} t={t} v={v} />
              <Rows title={L('Pickup / delivery', 'పికప్ / డెలివరీ')} rows={receipt.fulfilment} t={t} v={v} />
            </section>

            <footer className="mt-6 pt-3 border-t border-gray-200 text-[10px] text-gray-500 leading-snug">
              <p>{L('Computer-generated receipt — no signature needed. This is not a GST invoice.', 'కంప్యూటర్ ద్వారా తయారైన రసీదు — సంతకం అవసరం లేదు. ఇది GST ఇన్వాయిస్ కాదు.')}</p>
              <p className="mt-0.5">{L('Generated on', 'తయారైన తేదీ')} {receiptDate(new Date().toISOString())}</p>
            </footer>
          </article>
        )}
      </div>

      {receipt && (
        <div className="fixed left-0 right-0 bottom-[calc(80px+env(safe-area-inset-bottom,0px))] px-4 max-w-xl mx-auto print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="w-full h-12 rounded-xl bg-green-800 active:opacity-90 text-white font-bold shadow-lg"
          >
            ⬇ {L('Download PDF', 'PDF డౌన్‌లోడ్')}
          </button>
        </div>
      )}
    </main>
  )
}

function Rows({ title, rows, t, v }: {
  title: string
  rows: ReceiptRow[]
  t: (m: { en: string; te: string }) => string
  v: (r: ReceiptRow) => string
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">{title}</p>
      <dl className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.label.en} className="flex gap-2">
            <dt className="text-gray-600 shrink-0">{t(r.label)}:</dt>
            <dd className="font-semibold break-words min-w-0">{v(r)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

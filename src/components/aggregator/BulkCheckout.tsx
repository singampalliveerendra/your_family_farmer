'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import Icon from '@/components/home/Icon'
import { SLATE } from '@/components/aggregator/MarketParts'
import { checkBulkOrder, rateText, type BulkListing, type Delivery } from '@/lib/bulkOrder'
import { payBulkOrder, placeBulkOrder } from '@/lib/bulkCheckout'
import type { MarketItem } from '@/lib/bulkMarket'
import { formatQty, roundQty } from '@/lib/saleStep'
import { inr } from '@/lib/subscriptionPlans'
import { TRANSPORT_STATE_LABELS, type TransportRates } from '@/lib/wholesale'

/* The bulk checkout on a market lot (Phase 6), for an aggregator holding a
 * Buying plan: quantity (whole packs, from the minimum, up to what one
 * harvest holds), pickup or the seller's delivery with its charge, address,
 * the full price, then Cashfree. The figures come from the SAME
 * checkBulkOrder the server runs, so what is shown is what is charged. No
 * cash option for bulk (decision 2026-11-04). */

type T = (en: string, te: string) => string
type Phase = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'paid'; orderId: string; code: string | null } | { kind: 'error'; text: string }

export default function BulkCheckout({ it, feePercent, unitLabel, L }: { it: MarketItem; feePercent: number; unitLabel: string; L: T }) {
  const [qty, setQty] = useState<number>(it.minQty)
  const [delivery, setDelivery] = useState<Delivery>('pickup')
  const [addr, setAddr] = useState({ line: '', city: '', pincode: '', landmark: '' })
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  // The lot in the shape checkBulkOrder reads, rebuilt from the market item.
  const listing: BulkListing = useMemo(() => {
    const rates: TransportRates = {}
    for (const d of it.delivery) if (d.delivery !== 'pickup' && d.rate) rates[d.delivery] = d.rate
    return {
      name: it.name, unit: it.unit, sale_mode: it.saleMode, sale_step: it.step,
      wholesale_price: it.price, wholesale_min_qty: it.minQty, wholesale_pack_size: it.packSize, wholesale_pack_price: it.packPrice,
      wholesale_transport_states: it.transportStates, wholesale_transport_rates: rates,
    }
  }, [it])
  const max = it.stock
  const quote = checkBulkOrder(listing, qty, delivery, feePercent)
  const canUp = max === null || roundQty(qty + it.step) <= max + 1e-9
  const canDown = roundQty(qty - it.step) >= it.minQty - 1e-9

  const pay = async () => {
    if (!quote.ok) return
    setPhase({ kind: 'busy', text: L('Placing your order…', 'మీ ఆర్డర్ పెడుతోంది…') })
    const placed = await placeBulkOrder({ listingId: it.id, qty: quote.qty, delivery, address: delivery === 'pickup' ? undefined : addr })
    if (!placed.ok) { setPhase({ kind: 'error', text: placed.error }); return }
    setPhase({ kind: 'busy', text: L('Opening secure payment…', 'సురక్షిత చెల్లింపు తెరుస్తోంది…') })
    const out = await payBulkOrder(placed, () => setPhase({ kind: 'busy', text: L('Confirming your payment…', 'మీ చెల్లింపు ధృవీకరిస్తోంది…') }))
    if (out.kind === 'paid') setPhase({ kind: 'paid', orderId: out.orderId, code: placed.orderCode })
    else if (out.kind === 'unpaid') setPhase({ kind: 'error', text: L('Payment was not completed. No money was taken and the lot is free again.', 'చెల్లింపు పూర్తి కాలేదు. డబ్బు తీసుకోలేదు, లాట్ మళ్లీ అందుబాటులో ఉంది.') })
    else if (out.kind === 'processing') setPhase({ kind: 'error', text: L('Your bank is still confirming. If money was taken, the order goes through by itself — check My bulk orders in a few minutes.', 'మీ బ్యాంక్ ఇంకా ధృవీకరిస్తోంది. డబ్బు తీసుకుంటే ఆర్డర్ దానంతటదే పూర్తవుతుంది — కొన్ని నిమిషాల్లో నా బల్క్ ఆర్డర్లు చూడండి.') })
    else setPhase({ kind: 'error', text: out.error })
  }

  if (phase.kind === 'paid') {
    return (
      <section role="status" className="rounded-2xl bg-[#e7f0e9] p-5 text-[#1f4a35]">
        <p className="flex items-center gap-2 text-lg font-bold"><Icon name="check" className="h-5 w-5" strokeWidth={2.6} /> {L('Order placed and paid', 'ఆర్డర్ పెట్టి చెల్లించారు')}</p>
        {phase.code && <p className="mt-1 font-mono text-sm">{phase.code}</p>}
        <p className="mt-2 text-sm">{L('The seller has been told on WhatsApp. If they decline, you get the full amount back automatically.', 'అమ్మకందారుకు వాట్సాప్‌లో తెలిపాం. వారు తిరస్కరిస్తే, పూర్తి మొత్తం ఆటోమేటిక్‌గా తిరిగి వస్తుంది.')}</p>
        <Link href="/aggregator/purchases" className="mt-4 inline-flex min-h-[46px] items-center gap-2 rounded-xl px-4 text-sm font-bold text-white" style={{ background: SLATE }}>
          {L('Orders I placed', 'నేను పెట్టిన ఆర్డర్లు')} <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </section>
    )
  }

  const busy = phase.kind === 'busy'
  const input = 'w-full min-h-[46px] rounded-xl border border-black/15 bg-white px-3 text-[15px]'

  return (
    <section aria-labelledby="buy" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/10">
      <h2 id="buy" className="brand-wordmark text-xl font-bold">{L('Buy this lot', 'ఈ లాట్ కొనండి')}</h2>

      {/* Quantity */}
      <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-black/55">{L('Quantity', 'పరిమాణం')}</p>
      <div className="mt-1 flex items-center gap-3">
        <button type="button" disabled={!canDown || busy} onClick={() => setQty((q) => roundQty(q - it.step))} aria-label={L('Less', 'తగ్గించు')} className="h-12 w-12 rounded-xl border-2 border-black/15 text-2xl font-bold disabled:opacity-30">−</button>
        <span className="min-w-0 flex-1 text-center">
          <span className="brand-wordmark block text-3xl font-bold leading-none">{formatQty(qty)}</span>
          <span className="text-xs font-semibold text-black/55">{unitLabel}{it.packSize ? ` · ${L(`${formatQty(qty / it.packSize)} packs`, `${formatQty(qty / it.packSize)} ప్యాక్‌లు`)}` : ''}</span>
        </span>
        <button type="button" disabled={!canUp || busy} onClick={() => setQty((q) => roundQty(q + it.step))} aria-label={L('More', 'పెంచు')} className="h-12 w-12 rounded-xl text-2xl font-bold text-white disabled:opacity-30" style={{ background: SLATE }}>+</button>
      </div>
      <p className="mt-1 text-center text-[11px] text-black/50">
        {L(`From ${formatQty(it.minQty)} ${unitLabel}`, `${formatQty(it.minQty)} ${unitLabel} నుండి`)}
        {max !== null ? L(` · up to ${formatQty(max)} ${unitLabel}`, ` · ${formatQty(max)} ${unitLabel} వరకు`) : ''}
      </p>

      {/* Pickup or delivery */}
      <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-black/55">{L('How it reaches you', 'మీకు ఎలా చేరుతుంది')}</p>
      <div className="mt-2 space-y-2" role="radiogroup">
        {it.delivery.map((d) => {
          const on = delivery === d.delivery
          return (
            <button
              key={d.delivery}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setDelivery(d.delivery)}
              className={`flex w-full items-start gap-3 rounded-xl border-2 p-3 text-left ${on ? 'border-[#27486a] bg-[#e5ecf3]/50' : 'border-black/10'}`}
            >
              <Icon name={d.delivery === 'pickup' ? 'pin' : 'truck'} className="mt-0.5 h-5 w-5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-bold">
                  {d.delivery === 'pickup' ? L('I will collect from the seller', 'అమ్మకందారు దగ్గర నేనే తీసుకుంటాను') : L(`Seller delivers in ${TRANSPORT_STATE_LABELS[d.delivery].en}`, `అమ్మకందారు ${TRANSPORT_STATE_LABELS[d.delivery].te}లో డెలివరీ`)}
                </span>
                <span className="block text-xs text-black/60">
                  {d.delivery === 'pickup' ? (it.contact?.address ?? L('Pickup point is on your order after payment.', 'చెల్లించాక పికప్ స్థలం మీ ఆర్డర్‌లో కనిపిస్తుంది.')) : rateText(d.rate!, unitLabel, L)}
                </span>
              </span>
            </button>
          )
        })}
        {it.transportStates.length > 0 && it.delivery.length === 1 && (
          <p className="text-xs text-black/55">{L('The seller has not set a delivery charge yet, so this lot is pickup only for now.', 'అమ్మకందారు ఇంకా డెలివరీ ఛార్జ్ పెట్టలేదు, కాబట్టి ప్రస్తుతం పికప్ మాత్రమే.')}</p>
        )}
      </div>

      {delivery !== 'pickup' && (
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-black/55">{L('Delivery address', 'డెలివరీ చిరునామా')}</p>
          <input className={input} placeholder={L('Door no, street, area', 'ఇంటి నంబర్, వీధి, ప్రాంతం')} value={addr.line} onChange={(e) => setAddr({ ...addr, line: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className={input} placeholder={L('City / town', 'నగరం / పట్టణం')} value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
            <input className={input} inputMode="numeric" maxLength={6} placeholder={L('Pincode', 'పిన్‌కోడ్')} value={addr.pincode} onChange={(e) => setAddr({ ...addr, pincode: e.target.value.replace(/\D/g, '') })} />
          </div>
          <input className={input} placeholder={L('Landmark (optional)', 'గుర్తు (ఐచ్ఛికం)')} value={addr.landmark} onChange={(e) => setAddr({ ...addr, landmark: e.target.value })} />
        </div>
      )}

      {/* Price */}
      {quote.ok ? (
        <dl className="mt-5 space-y-1.5 border-t border-black/10 pt-4 text-sm">
          <Row label={L(`Produce (${formatQty(quote.qty)} ${unitLabel} × ${inr(quote.unitPrice)})`, `ఉత్పత్తి (${formatQty(quote.qty)} ${unitLabel} × ${inr(quote.unitPrice)})`)} value={inr(quote.goods)} />
          <Row
            label={L('Transport', 'రవాణా')}
            value={delivery === 'pickup' ? L('Pickup', 'పికప్')
              : quote.transportMode === 'per_km' ? L(`₹${formatQty(quote.transportRate ?? 0)}/km · after delivery`, `కి.మీ.కు ₹${formatQty(quote.transportRate ?? 0)} · డెలివరీ తర్వాత`)
              : quote.transportMode === 'cargo_bill' ? L('Cargo bill · after delivery', 'కార్గో బిల్లు · డెలివరీ తర్వాత')
              : quote.transport === 0 ? L('Free', 'ఉచితం') : inr(quote.transport)}
          />
          <Row label={L(`Platform fee (${feePercent}%)`, `ప్లాట్‌ఫామ్ ఫీజు (${feePercent}%)`)} value={inr(quote.fee)} />
          <div className="flex items-baseline justify-between gap-3 border-t-2 border-black pt-2">
            <dt className="font-bold">{L('You pay', 'మీరు చెల్లించేది')}</dt>
            <dd className="brand-wordmark text-2xl font-bold" style={{ color: SLATE }}>{inr(quote.total)}</dd>
          </div>
          {/* Per km / cargo bill (2026-11-05): not in this payment. */}
          {quote.transportMode === 'per_km' || quote.transportMode === 'cargo_bill' ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900">
              {quote.transportMode === 'per_km'
                ? L('Transport is billed after delivery (km × the rate above) and paid to the seller directly — it is not part of this payment.', 'రవాణా ఛార్జ్ డెలివరీ తర్వాత (కి.మీ. × పై ధర) బిల్లు చేయబడుతుంది, నేరుగా అమ్మకందారుకు చెల్లించాలి — ఈ చెల్లింపులో లేదు.')
                : L('Transport is billed after delivery as per the actual cargo bill and paid to the seller directly — it is not part of this payment.', 'రవాణా ఛార్జ్ డెలివరీ తర్వాత అసలు కార్గో బిల్లు ప్రకారం, నేరుగా అమ్మకందారుకు చెల్లించాలి — ఈ చెల్లింపులో లేదు.')}
            </p>
          ) : null}
        </dl>
      ) : (
        <p className="mt-4 text-sm font-semibold text-[#6e2c12]">{quote.error}</p>
      )}

      {phase.kind === 'busy' && (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm font-bold"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#27486a] border-t-transparent" />{phase.text}</p>
      )}
      {phase.kind === 'error' && <p role="alert" className="mt-4 rounded-xl bg-[#f8e7de] p-3 text-sm font-semibold text-[#6e2c12]">{phase.text}</p>}

      <button
        type="button"
        disabled={!quote.ok || busy}
        onClick={() => void pay()}
        className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-white disabled:opacity-40"
        style={{ background: SLATE }}
      >
        <Icon name="shield" className="h-5 w-5" /> {quote.ok ? L(`Pay ${inr(quote.total)} securely`, `${inr(quote.total)} సురక్షితంగా చెల్లించండి`) : L('Pay securely', 'సురక్షితంగా చెల్లించండి')}
      </button>
      <p className="mt-2 text-center text-[11px] leading-snug text-black/55">
        {L('Online payment only (UPI, cards, net banking) through Cashfree. If the seller declines, you get the full amount back automatically.', 'క్యాష్‌ఫ్రీ ద్వారా ఆన్‌లైన్ చెల్లింపు మాత్రమే (UPI, కార్డులు, నెట్ బ్యాంకింగ్). అమ్మకందారు తిరస్కరిస్తే, పూర్తి మొత్తం ఆటోమేటిక్‌గా తిరిగి వస్తుంది.')}
      </p>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-black/65">{label}</dt>
      <dd className="shrink-0 font-semibold">{value}</dd>
    </div>
  )
}

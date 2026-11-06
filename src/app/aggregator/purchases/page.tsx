'use client'

import TransportBillCard from '@/components/orders/TransportBillCard'
import type { BillView } from '@/lib/transportBill'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { requireFarmerSession } from '@/lib/farmer-auth-client'
import LanguageToggle from '@/components/LanguageToggle'
import BackButton from '@/components/BackButton'
import AggregatorOrdersTabs from '@/components/aggregator/OrdersTabs'
import Icon from '@/components/home/Icon'
import { SLATE } from '@/components/aggregator/MarketParts'
import { bulkOrderStage, type BulkOrderRow } from '@/lib/bulkOrder'
import { localizeName, localizeUnit } from '@/lib/localizeName'
import { formatQty } from '@/lib/saleStep'
import { inr } from '@/lib/subscriptionPlans'

/* /aggregator/purchases — "My bulk orders" (Phase 6): every bulk lot this
 * aggregator bought, where it is, the pickup code to read out to the seller,
 * the seller's phone, and what was paid. Comes from the aggregator-only
 * /api/aggregator/bulk-orders; a household buyer never reaches it. */

type Order = BulkOrderRow & {
  id: string
  order_code?: string | null
  produce_name?: string | null
  quantity?: number | null
  unit?: string | null
  total_price?: number | null
  platform_fee?: number | null
  transport_charge?: number | null
  transport_state?: string | null
  delivery_address?: string | null
  delivery_city?: string | null
  delivery_pincode?: string | null
  pickup_location?: string | null
  handover_otp?: string | null
  created_at: string
  refund_amount?: number | null
  seller?: { name?: string | null; village?: string | null; district?: string | null; phone?: string | null } | null
  transport_bill?: BillView
}

const TONE: Record<string, string> = {
  grey: 'bg-black/5 text-black/60',
  amber: 'bg-[#fdf4df] text-[#6b4a07]',
  blue: 'bg-[#e5ecf3] text-[#27486a]',
  green: 'bg-[#e7f0e9] text-[#1f4a35]',
  red: 'bg-[#f8e7de] text-[#6e2c12]',
}
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

export default function BulkPurchasesPage() {
  const { lang, L } = useLang()
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    void (async () => {
      if (!(await requireFarmerSession())) return
      const r = await fetch('/api/aggregator/bulk-orders', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null)
      if (r?.status === 401) { setDenied(true); return }
      const j = r ? await r.json().catch(() => null) : null
      setOrders((j?.orders ?? []) as Order[])
    })()
  }, [])

  if (denied) {
    return (
      <main className="min-h-screen bg-[#f7f4ec] px-4 py-16 text-center">
        <p className="brand-wordmark text-2xl font-bold">{L('Bulk orders are for aggregators', 'బల్క్ ఆర్డర్లు అగ్రిగేటర్ల కోసం')}</p>
        <Link href="/aggregator/login?next=/aggregator/purchases" className="mt-6 inline-flex min-h-[48px] items-center rounded-xl px-5 font-bold text-white" style={{ background: SLATE }}>
          {L('Log in as aggregator', 'అగ్రిగేటర్‌గా లాగిన్')}
        </Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f7f4ec] pb-28 text-[#1d2a20]">
      <header className="px-4 pb-6 pt-4 text-white" style={{ background: SLATE }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <BackButton fallback="/aggregator/market" className="!text-white/80" />
          <LanguageToggle size="sm" />
        </div>
        <div className="mx-auto mt-4 max-w-3xl">
          <h1 className="brand-wordmark text-3xl font-bold">{L('Orders I placed', 'నేను పెట్టిన ఆర్డర్లు')}</h1>
          <p className="mt-1 text-sm text-white/80">{L('Bulk lots you bought on Go Grameen.', 'గో గ్రామీణ్‌లో మీరు కొన్న బల్క్ లాట్‌లు.')}</p>
          <AggregatorOrdersTabs active="bought" alwaysShow />
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-3 px-4 pt-4">
        {orders === null ? (
          [0, 1].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-white" />)
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-black/15 bg-white px-5 py-10 text-center">
            <Icon name="box" className="mx-auto h-8 w-8 text-black/35" />
            <p className="mt-2 font-bold">{L('No bulk orders yet', 'ఇంకా బల్క్ ఆర్డర్లు లేవు')}</p>
            <Link href="/aggregator/market" className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-bold text-white" style={{ background: SLATE }}>
              {L('Open the bulk market', 'బల్క్ మార్కెట్ తెరవండి')} <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          orders.map((o) => {
            const st = bulkOrderStage(o)
            const unit = localizeUnit(o.unit || 'kg', lang)
            const paid = (Number(o.total_price) || 0) + (Number(o.platform_fee) || 0)
            const pickup = o.delivery_type !== 'courier'
            const live = st.key === 'waiting' || st.key === 'approved' || st.key === 'shipped'
            return (
              <article key={o.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold leading-tight">{localizeName(o.produce_name ?? '', lang) || '—'}</p>
                    <p className="text-xs text-black/55">{formatQty(o.quantity)} {unit} · {o.order_code ?? ''} · {fmt(o.created_at)}</p>
                  </div>
                  <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-bold ${TONE[st.tone]}`}>{L(st.en, st.te)}</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-black/50">{L('Paid', 'చెల్లించింది')}</p>
                    <p className="font-bold">{inr(paid)}</p>
                    {Number(o.transport_charge) > 0 && <p className="text-[11px] text-black/55">{L(`incl. transport ${inr(Number(o.transport_charge))}`, `రవాణా ${inr(Number(o.transport_charge))} కలిపి`)}</p>}
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-black/50">{pickup ? L('Pickup', 'పికప్') : L('Delivery', 'డెలివరీ')}</p>
                    <p className="text-sm leading-snug">
                      {pickup ? (o.pickup_location || L('At the seller', 'అమ్మకందారు దగ్గర')) : [o.delivery_address, o.delivery_city, o.delivery_pincode].filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>

                {pickup && live && o.handover_otp && (
                  <p className="mt-3 flex items-center justify-between rounded-xl bg-[#e5ecf3]/60 px-3 py-2 text-sm">
                    <span className="font-semibold text-[#27486a]">{L('Pickup code — tell the seller', 'పికప్ కోడ్ — అమ్మకందారుకు చెప్పండి')}</span>
                    <span className="font-mono text-xl font-bold tracking-[0.3em] text-[#27486a]">{o.handover_otp}</span>
                  </p>
                )}
                {/* Per km / cargo bill (2026-11-05): the seller's transport
                    bill, paid to them directly. Nothing for other orders. */}
                {st.key !== 'declined' && (
                  <div className="mt-3"><TransportBillCard orderId={o.id} bill={o.transport_bill} role="buyer" /></div>
                )}
                {st.key === 'declined' && o.decline_reason && <p className="mt-3 text-xs text-[#6e2c12]">{L('Reason', 'కారణం')}: {o.decline_reason}</p>}
                {st.key === 'declined' && Number(o.refund_amount) > 0 && <p className="mt-1 text-xs text-black/60">{L(`Refund ${inr(Number(o.refund_amount))} — reaches your account in 3–5 working days.`, `రీఫండ్ ${inr(Number(o.refund_amount))} — 3–5 పని రోజుల్లో మీ ఖాతాకు.`)}</p>}

                {o.seller && (
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/10 pt-3">
                    <span className="min-w-0 text-xs text-black/65">
                      <span className="font-bold text-black/80">{o.seller.name}</span>
                      {o.seller.village ? ` · ${o.seller.village}` : ''}
                    </span>
                    {o.seller.phone && (
                      <a href={`tel:+91${String(o.seller.phone).replace(/\D/g, '').slice(-10)}`} className="flex shrink-0 items-center gap-1 text-sm font-bold" style={{ color: SLATE }}>
                        <Icon name="phone" className="h-4 w-4" /> {L('Call', 'కాల్')}
                      </a>
                    )}
                  </div>
                )}
              </article>
            )
          })
        )}
      </div>
    </main>
  )
}

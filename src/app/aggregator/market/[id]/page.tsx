'use client'

import { packLabel } from '@/lib/packPricing'
import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useLang } from '@/lib/LanguageContext'
import { requireFarmerSession } from '@/lib/farmer-auth-client'
import LanguageToggle from '@/components/LanguageToggle'
import BackButton from '@/components/BackButton'
import Icon from '@/components/home/Icon'
import { LockedNote, Price, SLATE, quantityText, transportText } from '@/components/aggregator/MarketParts'
import BulkCheckout from '@/components/aggregator/BulkCheckout'
import { deliveryCostText, deliveryLabel } from '@/lib/bulkOrder'
import { placeOf, type MarketItem } from '@/lib/bulkMarket'
import { localizeName, localizeUnit } from '@/lib/localizeName'
import { methodLabel } from '@/lib/produceLabels'
import { formatQty } from '@/lib/saleStep'
import { harvestClock } from '@/lib/harvest'
import { inr } from '@/lib/subscriptionPlans'

/* One bulk listing (Phase 5). Everything about the lot, the seller's name and
 * place, the grower when an aggregator sells it — and the seller's phone,
 * WhatsApp and address only for an aggregator with a Buying plan (the server
 * leaves them out of the response otherwise) — and, with that plan, the bulk
 * checkout (Phase 6): online payment only, the seller's transport charge
 * shown before paying. */

export default function BulkListingPage() {
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === 'string' ? params.id : ''
  const { lang, L } = useLang()
  const [it, setIt] = useState<MarketItem | null>(null)
  const [buying, setBuying] = useState(false)
  const [feePercent, setFeePercent] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'denied'>('loading')
  const [img, setImg] = useState(0)

  useEffect(() => {
    if (!id) return
    void (async () => {
      if (!(await requireFarmerSession())) return
      const r = await fetch(`/api/aggregator/market?id=${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null)
      if (r?.status === 401) { setState('denied'); return }
      const j = r && r.ok ? await r.json().catch(() => null) : null
      if (!j?.item) { setState('missing'); return }
      setIt(j.item as MarketItem)
      setBuying(!!j.access?.buying)
      setFeePercent(Number(j.access?.bulkFeePercent) || 0)
      setState('ready')
    })()
  }, [id])

  if (state !== 'ready' || !it) {
    return (
      <main className="min-h-screen bg-[#f7f4ec] px-4 py-16 text-center text-[#1d2a20]">
        {state === 'loading' ? (
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: SLATE, borderTopColor: 'transparent' }} />
        ) : (
          <>
            <p className="brand-wordmark text-2xl font-bold">
              {state === 'denied' ? L('The bulk market is for aggregators', 'బల్క్ మార్కెట్ అగ్రిగేటర్ల కోసం') : L('This bulk lot is not available any more', 'ఈ బల్క్ లాట్ ఇప్పుడు అందుబాటులో లేదు')}
            </p>
            <Link href="/aggregator/market" className="mt-6 inline-flex min-h-[48px] items-center rounded-xl px-5 font-bold text-white" style={{ background: SLATE }}>
              {L('Back to the bulk market', 'బల్క్ మార్కెట్‌కు తిరిగి')}
            </Link>
          </>
        )}
      </main>
    )
  }

  const unitLabel = localizeUnit(it.unit, lang)
  const place = placeOf(it.seller)
  const minValue = it.price * it.minQty
  const waText = encodeURIComponent(
    `Hello ${it.seller.name}, I saw your ${it.name} on the Go Grameen bulk market (${it.packPrice && it.packSize ? `${inr(it.packPrice)}/${packLabel(it.packSize, it.unit)} pack` : `${inr(it.price)}/${it.unit}`}, min ${formatQty(it.minQty)} ${it.unit}). I would like to buy.`,
  )

  return (
    <main className="min-h-screen bg-[#f7f4ec] pb-32 text-[#1d2a20]">
      <div className="sticky top-0 z-30 px-4 py-3 text-white" style={{ background: SLATE }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <BackButton fallback="/aggregator/market" className="!text-white/80" />
          <LanguageToggle size="sm" />
        </div>
      </div>

      <div className="mx-auto max-w-3xl">
        {/* Photos */}
        <div className="relative aspect-[4/3] w-full bg-[#e5ecf3]">
          {it.images.length ? (
            <Image src={it.images[img] ?? it.images[0]} alt={it.name} fill sizes="(max-width: 768px) 100vw, 768px" className="object-cover" priority />
          ) : (
            <span className="flex h-full items-center justify-center text-7xl" aria-hidden>{it.emoji ?? '🌾'}</span>
          )}
          <span className="absolute left-3 top-3 rounded-md bg-white/95 px-2 py-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: SLATE }}>
            {it.saleMode === 'both' ? L('Bulk · also retail', 'బల్క్ · చిల్లర కూడా') : L('Bulk only', 'బల్క్ మాత్రమే')}
          </span>
        </div>
        {it.images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 pt-3">
            {it.images.map((u, i) => (
              <button key={u} type="button" onClick={() => setImg(i)} aria-label={L(`Photo ${i + 1}`, `ఫోటో ${i + 1}`)} className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg ${i === img ? 'ring-2 ring-[#27486a]' : 'opacity-70'}`}>
                <Image src={u} alt="" fill sizes="56px" className="object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="space-y-4 px-4 pt-4">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/10">
            <h1 className="brand-wordmark text-2xl font-bold leading-tight">{localizeName(it.name, lang)}</h1>
            {it.variety && <p className="text-sm text-black/60">{localizeName(it.variety, lang)}</p>}
            <div className="mt-4"><Price it={it} unitLabel={unitLabel} L={L} big /></div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Fact icon="scale" label={L('Order size', 'ఆర్డర్ పరిమాణం')} value={quantityText(it, L, unitLabel)} />
              <Fact icon="rupee" label={L('Smallest order', 'కనిష్ట ఆర్డర్')} value={inr(minValue)} />
              <Fact icon="truck" label={L('Transport', 'రవాణా')} value={transportText(it, L)} />
              {it.stock !== null && <Fact icon="box" label={L('Ready now', 'ఇప్పుడు సిద్ధం')} value={`${formatQty(it.stock)} ${unitLabel}`} />}
              {it.harvestedAt && <Fact icon="clock" label={L('Harvest', 'కోత')} value={harvestClock(it.harvestedAt, L)} />}
              {it.method && <Fact icon="sprout" label={L('Grown', 'పండించిన విధానం')} value={methodLabel(it.method, lang)} />}
            </dl>
            {it.delivery.some((d) => d.rate) && (
              <ul className="mt-3 space-y-0.5 text-xs text-black/60">
                {it.delivery.filter((d) => d.rate).map((d) => (
                  <li key={d.delivery}>{deliveryLabel(d, L)}: {deliveryCostText(d, unitLabel, L)}</li>
                ))}
              </ul>
            )}
            {it.description && <p className="mt-4 whitespace-pre-line border-t border-black/10 pt-4 text-sm leading-relaxed text-black/70">{it.description}</p>}
          </section>

          {/* Buying — Phase 6 */}
          {buying ? (
            <BulkCheckout it={it} feePercent={feePercent} unitLabel={unitLabel} L={L} />
          ) : (
            <section className="rounded-2xl border-l-4 border-[#27486a] bg-[#e5ecf3]/60 p-4 text-sm text-[#1d3651]">
              <p className="font-bold">{L('Order and pay right here with a Buying plan', 'బయింగ్ ప్లాన్‌తో ఇక్కడే ఆర్డర్ చేసి చెల్లించండి')}</p>
              <p className="mt-1">{L('See the transport charge before you pay. If the seller declines, you get your money back automatically.', 'చెల్లించే ముందే రవాణా ఛార్జ్ చూడండి. అమ్మకందారు తిరస్కరిస్తే, మీ డబ్బు ఆటోమేటిక్‌గా తిరిగి వస్తుంది.')}</p>
            </section>
          )}

          {/* Seller — last, below Buy this lot (client, 2026-11-05): the lot and
              ordering come first; contacts are there when needed. */}
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/10" aria-labelledby="seller">
            <p id="seller" className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: SLATE }}>
              {it.seller.type === 'aggregator' ? L('Sold by aggregator', 'అమ్మేది అగ్రిగేటర్') : L('Sold by farmer', 'అమ్మేది రైతు')}
            </p>
            <p className="mt-1 text-lg font-bold">{it.seller.name}</p>
            {place && <p className="flex items-center gap-1 text-sm text-black/65"><Icon name="pin" className="h-4 w-4" />{place}{it.seller.state ? `, ${it.seller.state}` : ''}</p>}
            {it.grower && (
              <p className="mt-3 rounded-xl bg-[#e7f0e9] px-3 py-2 text-sm text-[#1f4a35]">
                <span className="font-bold">{L('Grown by', 'పండించినవారు')}:</span> {it.grower.name}{it.grower.village ? `, ${it.grower.village}` : ''}
              </p>
            )}
            {it.contact ? (
              <div className="mt-4 space-y-2">
                {it.contact.address && (
                  <p className="text-sm"><span className="font-semibold text-black/60">{L('Address', 'చిరునామా')}:</span> {it.contact.address}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <a href={`tel:+91${it.contact.phone}`} className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl text-sm font-bold text-white" style={{ background: SLATE }}>
                    <Icon name="phone" className="h-4 w-4" /> {L('Call', 'కాల్')}
                  </a>
                  <a href={`https://wa.me/${it.contact.whatsapp}?text=${waText}`} target="_blank" rel="noopener noreferrer" className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#1f7a4d] text-sm font-bold text-white">
                    <Icon name="share" className="h-4 w-4" /> WhatsApp
                  </a>
                </div>
                <p className="text-center text-xs text-black/55">+91 {it.contact.phone}</p>
              </div>
            ) : !buying ? (
              <div className="mt-4"><LockedNote L={L} compact /></div>
            ) : (
              <p className="mt-4 text-sm text-black/60">{L('This seller has no phone number on file yet.', 'ఈ అమ్మకందారు ఫోన్ నంబర్ ఇంకా లేదు.')}</p>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}

function Fact({ icon, label, value }: { icon: Parameters<typeof Icon>[0]['name']; label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-black/45" />
      <span className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-black/50">{label}</dt>
        <dd className="font-semibold leading-snug">{value}</dd>
      </span>
    </div>
  )
}

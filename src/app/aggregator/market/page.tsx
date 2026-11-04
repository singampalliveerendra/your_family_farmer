'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { requireFarmerSession } from '@/lib/farmer-auth-client'
import LanguageToggle from '@/components/LanguageToggle'
import BackButton from '@/components/BackButton'
import Icon from '@/components/home/Icon'
import { LockedNote, Price, SLATE, SellerLine, quantityText, transportText } from '@/components/aggregator/MarketParts'
import { filterMarket, type MarketFilter, type MarketItem } from '@/lib/bulkMarket'
import { localizeName, localizeUnit } from '@/lib/localizeName'
import { categoryLabel } from '@/lib/produceLabels'
import { formatQty } from '@/lib/saleStep'
import { harvestClock } from '@/lib/harvest'

/* /aggregator/market — the bulk market (Phase 5). Every produce sold
 * Wholesale or Both by farmers and other aggregators; household buyers never
 * reach it (the API answers aggregators only). Without a Buying plan the list
 * is fully browsable but seller contacts are not in the data at all; a banner
 * explains what a plan unlocks. Ordering in the app is Phase 6. */

type Access = { buying: boolean; standing: string }

export default function BulkMarketPage() {
  const { lang, L } = useLang()
  const [items, setItems] = useState<MarketItem[] | null>(null)
  const [access, setAccess] = useState<Access>({ buying: false, standing: 'none' })
  const [denied, setDenied] = useState(false)
  const [f, setF] = useState<MarketFilter>({ q: '', seller: 'all', delivers: null, category: null })

  useEffect(() => {
    void (async () => {
      if (!(await requireFarmerSession())) return
      const r = await fetch('/api/aggregator/market', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null)
      if (r?.status === 401) { setDenied(true); return }
      const j = r ? await r.json().catch(() => null) : null
      setItems((j?.items ?? []) as MarketItem[])
      if (j?.access) setAccess(j.access as Access)
    })()
  }, [])

  const categories = useMemo(() => [...new Set((items ?? []).map((i) => i.category).filter(Boolean))] as string[], [items])
  const shown = items ? filterMarket(items, f) : []
  const chip = (on: boolean) =>
    `shrink-0 min-h-[38px] rounded-full border px-3 text-xs font-bold ${on ? 'border-transparent text-white' : 'border-black/15 bg-white text-black/70'}`

  if (denied) {
    return (
      <main className="min-h-screen bg-[#f7f4ec] px-4 py-16 text-center text-[#1d2a20]">
        <p className="brand-wordmark text-2xl font-bold">{L('The bulk market is for aggregators', 'బల్క్ మార్కెట్ అగ్రిగేటర్ల కోసం')}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-black/65">{L('Farmers sell in bulk here; aggregators buy.', 'ఇక్కడ రైతులు బల్క్‌గా అమ్ముతారు; అగ్రిగేటర్లు కొంటారు.')}</p>
        <Link href="/aggregator/login?next=/aggregator/market" className="mt-6 inline-flex min-h-[48px] items-center rounded-xl px-5 font-bold text-white" style={{ background: SLATE }}>
          {L('Log in as aggregator', 'అగ్రిగేటర్‌గా లాగిన్')}
        </Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f7f4ec] pb-28 text-[#1d2a20]">
      <header className="px-4 pb-6 pt-4 text-white" style={{ background: SLATE }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <BackButton fallback="/aggregator/dashboard" className="!text-white/80" />
          <LanguageToggle size="sm" />
        </div>
        <div className="mx-auto mt-4 max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">{L('Aggregators only', 'అగ్రిగేటర్లకు మాత్రమే')}</p>
          <h1 className="brand-wordmark mt-1 text-3xl font-bold">{L('Bulk market', 'బల్క్ మార్కెట్')}</h1>
          <p className="mt-1 text-sm text-white/80">{L('Bulk produce straight from farmers and other aggregators.', 'రైతులు, ఇతర అగ్రిగేటర్ల నుండి నేరుగా బల్క్ ఉత్పత్తులు.')}</p>
          {access.buying && (
            <Link href="/aggregator/purchases" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-bold ring-1 ring-white/30">
              <Icon name="receipt" className="h-4 w-4" /> {L('My bulk orders', 'నా బల్క్ ఆర్డర్లు')}
            </Link>
          )}
          <label className="mt-4 flex items-center gap-2 rounded-xl bg-white px-3 text-[#1d2a20]">
            <Icon name="search" className="h-5 w-5 text-black/45" />
            <input
              value={f.q}
              onChange={(e) => setF((x) => ({ ...x, q: e.target.value }))}
              placeholder={L('Search produce, seller or village', 'ఉత్పత్తి, అమ్మకందారు లేదా గ్రామం వెతకండి')}
              className="min-h-[46px] w-full bg-transparent text-[15px] outline-none"
            />
          </label>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
        {!access.buying && items !== null && <LockedNote L={L} />}

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={L('Filters', 'ఫిల్టర్లు')}>
          {(['all', 'farmer', 'aggregator'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={f.seller === k} onClick={() => setF((x) => ({ ...x, seller: k }))} className={chip(f.seller === k)} style={f.seller === k ? { background: SLATE } : undefined}>
              {k === 'all' ? L('All sellers', 'అందరూ') : k === 'farmer' ? L('Farmers', 'రైతులు') : L('Aggregators', 'అగ్రిగేటర్లు')}
            </button>
          ))}
          {(['AP', 'TG'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={f.delivers === s} onClick={() => setF((x) => ({ ...x, delivers: x.delivers === s ? null : s }))} className={chip(f.delivers === s)} style={f.delivers === s ? { background: SLATE } : undefined}>
              {L(`Delivers in ${s}`, `${s}లో డెలివరీ`)}
            </button>
          ))}
          {categories.map((c) => (
            <button key={c} type="button" aria-pressed={f.category === c} onClick={() => setF((x) => ({ ...x, category: x.category === c ? null : c }))} className={chip(f.category === c)} style={f.category === c ? { background: SLATE } : undefined}>
              {categoryLabel(c, lang) ?? c}
            </button>
          ))}
        </div>

        {items === null ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />)}</div>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-black/15 bg-white px-5 py-10 text-center">
            <Icon name="box" className="mx-auto h-8 w-8 text-black/35" />
            <p className="mt-2 font-bold">{items.length ? L('Nothing matches these filters', 'ఈ ఫిల్టర్లకు ఏమీ లేదు') : L('No bulk produce right now', 'ప్రస్తుతం బల్క్ ఉత్పత్తులు లేవు')}</p>
            <p className="mt-1 text-sm text-black/60">{items.length ? L('Try clearing a filter.', 'ఒక ఫిల్టర్ తీసేసి చూడండి.') : L('Farmers add bulk lots as they harvest — check back soon.', 'రైతులు కోసినప్పుడు బల్క్ లాట్‌లు చేరుస్తారు — త్వరలో మళ్లీ చూడండి.')}</p>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold text-black/55">{L(`${shown.length} bulk listings`, `${shown.length} బల్క్ లిస్టింగ్‌లు`)}</p>
            <ul className="space-y-3">
              {shown.map((it) => {
                const unitLabel = localizeUnit(it.unit, lang)
                return (
                  <li key={it.id}>
                    <Link href={`/aggregator/market/${it.id}`} className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/10 active:bg-black/[0.02]">
                      <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#e5ecf3]">
                        {it.image ? (
                          <Image src={it.image} alt="" fill sizes="96px" className="object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-3xl" aria-hidden>{it.emoji ?? '🌾'}</span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold leading-tight">{localizeName(it.name, lang)}{it.variety ? <span className="font-normal text-black/55"> · {localizeName(it.variety, lang)}</span> : null}</span>
                        <span className="mt-1 block"><Price it={it} unitLabel={unitLabel} L={L} /></span>
                        <span className="mt-1 block text-[12px] font-semibold text-black/65">{quantityText(it, L, unitLabel)}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-black/55">
                          <span className="inline-flex items-center gap-1"><Icon name="truck" className="h-3.5 w-3.5" />{transportText(it, L)}</span>
                          {it.stock !== null && <span>{L(`${formatQty(it.stock)} ${unitLabel} ready`, `${formatQty(it.stock)} ${unitLabel} సిద్ధం`)}</span>}
                          {it.harvestedAt && <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-3.5 w-3.5" />{harvestClock(it.harvestedAt, L)}</span>}
                        </span>
                        <span className="mt-1.5 block"><SellerLine it={it} L={L} /></span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  )
}

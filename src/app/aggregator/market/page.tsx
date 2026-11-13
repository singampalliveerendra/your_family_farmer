'use client'

import { packLabel } from '@/lib/packPricing'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { requireFarmerSession } from '@/lib/farmer-auth-client'
import LanguageToggle from '@/components/LanguageToggle'
import BackButton from '@/components/BackButton'
import Icon from '@/components/home/Icon'
import { LockedNote, SLATE, quantityText, transportText } from '@/components/aggregator/MarketParts'
import ProduceTile, { METHOD_PILL, PRODUCE_GRID_CLASS, ProduceChipRow, ProduceSearchBox, type TileChip } from '@/components/produce/ProduceTile'
import { filterMarket, type MarketFilter, type MarketItem } from '@/lib/bulkMarket'
import { localizeName, localizeUnit } from '@/lib/localizeName'
import { METHOD_SHORT, categoryLabel } from '@/lib/produceLabels'
import { formatQty } from '@/lib/saleStep'
import { harvestClock } from '@/lib/harvest'

/* /aggregator/market — the bulk market (Phase 5). Every produce sold
 * Wholesale or Both by farmers and other aggregators; household buyers never
 * reach it (the API answers aggregators only). Without a Buying plan the list
 * is fully browsable but seller contacts are not in the data at all; a banner
 * explains what a plan unlocks. Ordering happens on the lot page (Phase 6).
 * Since 2026-11-05 the list is the consumer home's grid — same tile, search
 * box and chip row (src/components/produce/ProduceTile.tsx). */

type Access = { buying: boolean; standing: string }

export default function BulkMarketPage() {
  const { lang, L } = useLang()
  const [items, setItems] = useState<MarketItem[] | null>(null)
  const [access, setAccess] = useState<Access>({ buying: false, standing: 'none' })
  const [denied, setDenied] = useState(false)
  const [f, setF] = useState<MarketFilter>({ q: '', seller: 'all', transports: false, category: null })

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

  const chips = [
    ...(['all', 'farmer', 'aggregator'] as const).map((k) => ({
      key: `seller-${k}`,
      label: k === 'all' ? L('All sellers', 'అందరూ') : k === 'farmer' ? L('Farmers', 'రైతులు') : L('Aggregators', 'అగ్రిగేటర్లు'),
      on: f.seller === k,
      onClick: () => setF((x) => ({ ...x, seller: k })),
    })),
    // One chip since transport went pan India (client, 2026-11-12) — not
    // "Delivers in AP" / "Delivers in TG".
    {
      key: 'transports',
      label: L('Pan India transport', 'దేశవ్యాప్త రవాణా'),
      on: !!f.transports,
      onClick: () => setF((x) => ({ ...x, transports: !x.transports })),
    },
    ...categories.map((c) => ({
      key: `cat-${c}`,
      label: categoryLabel(c, lang) ?? c,
      on: f.category === c,
      onClick: () => setF((x) => ({ ...x, category: x.category === c ? null : c })),
    })),
  ]

  return (
    <main className="min-h-screen bg-gray-50 pb-28 text-[#1d2a20]">
      <header className="px-4 pb-12 pt-4 text-white" style={{ background: SLATE }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <BackButton fallback="/aggregator/dashboard" className="!text-white/80" />
          <LanguageToggle size="sm" />
        </div>
        <div className="mx-auto mt-4 max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">{L('Aggregators only', 'అగ్రిగేటర్లకు మాత్రమే')}</p>
          <h1 className="brand-wordmark mt-1 text-3xl font-bold">{L('Bulk market', 'బల్క్ మార్కెట్')}</h1>
          <p className="mt-1 text-sm text-white/80">{L('Bulk produce straight from farmers and other aggregators.', 'రైతులు, ఇతర అగ్రిగేటర్ల నుండి నేరుగా బల్క్ ఉత్పత్తులు.')}</p>
          {/* "My bulk orders" moved to the bottom menu's Orders (2026-11-06). */}
        </div>
      </header>

      {/* Search card floating over the header, then chips and the grid — the
          same components as the consumer home (src/components/produce). */}
      <div className="mx-auto -mt-7 max-w-3xl px-4">
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-xl">
          <ProduceSearchBox value={f.q ?? ''} onChange={(q) => setF((x) => ({ ...x, q }))} placeholder={L('Search produce, seller or village', 'ఉత్పత్తి, అమ్మకందారు లేదా గ్రామం వెతకండి')} />
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-3xl px-4">
        <ProduceChipRow chips={chips} />
      </div>

      <div className="mx-auto mt-4 max-w-3xl space-y-3 px-3">
        {!access.buying && items !== null && <LockedNote L={L} compact />}

        {items === null ? (
          <div className={PRODUCE_GRID_CLASS}>{[0, 1, 2, 3].map((i) => <div key={i} className="h-72 animate-pulse rounded-xl bg-white" />)}</div>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-black/15 bg-white px-5 py-10 text-center">
            <Icon name="box" className="mx-auto h-8 w-8 text-black/35" />
            <p className="mt-2 font-bold">{items.length ? L('Nothing matches these filters', 'ఈ ఫిల్టర్లకు ఏమీ లేదు') : L('No bulk produce right now', 'ప్రస్తుతం బల్క్ ఉత్పత్తులు లేవు')}</p>
            <p className="mt-1 text-sm text-black/60">{items.length ? L('Try clearing a filter.', 'ఒక ఫిల్టర్ తీసేసి చూడండి.') : L('Farmers add bulk lots as they harvest — check back soon.', 'రైతులు కోసినప్పుడు బల్క్ లాట్‌లు చేరుస్తారు — త్వరలో మళ్లీ చూడండి.')}</p>
          </div>
        ) : (
          <>
            <p className="px-1 text-xs font-semibold text-black/55">{L(`${shown.length} bulk listings`, `${shown.length} బల్క్ లిస్టింగ్‌లు`)}</p>
            <div className={PRODUCE_GRID_CLASS}>
              {shown.map((it, i) => <BulkTile key={it.id} it={it} buying={access.buying} priority={i < 4} />)}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

/** One bulk lot in the consumer-style grid: wholesale price, the minimum and
 *  transport where the household card has its retail price and cart button.
 *  Tapping anywhere opens the lot page, where ordering happens (Phase 6). */
function BulkTile({ it, buying, priority }: { it: MarketItem; buying: boolean; priority: boolean }) {
  const { lang, L } = useLang()
  const unitLabel = localizeUnit(it.unit, lang)
  const href = `/aggregator/market/${it.id}`
  const method = it.method?.toLowerCase() ?? null
  const methodShort = method ? METHOD_SHORT[method] : null
  const chips: TileChip[] = []
  if (it.harvestedAt) chips.push({ key: 'clock', icon: '⏱', text: harvestClock(it.harvestedAt, L), tone: 'green' })
  chips.push(it.delivery.length > 1
    ? { key: 'transport', icon: '🚚', text: transportText(it, L), tone: 'blue' }
    : { key: 'transport', icon: '🚶', text: L('Pickup only', 'పికప్ మాత్రమే'), tone: 'gray' })
  if (it.seller.type === 'aggregator') chips.push({ key: 'agg', icon: '🤝', text: L('Aggregator', 'అగ్రిగేటర్'), tone: 'amber' })
  const place = it.seller.village || it.seller.district

  return (
    <ProduceTile
      href={href}
      name={localizeName(it.name, lang)}
      variety={it.variety ? localizeName(it.variety, lang) : null}
      growerLine={it.grower ? `${L('from', 'నుండి')} ${it.grower.name}${it.grower.village ? `, ${it.grower.village}` : ''}` : null}
      images={it.images.length ? it.images : it.image ? [it.image] : []}
      emoji={it.emoji ?? '🌾'}
      method={method && methodShort ? { className: METHOD_PILL[method] ?? 'bg-green-600 text-white', label: L(methodShort.en, methodShort.te) } : null}
      priority={priority}
      chips={chips}
      seller={{ icon: it.seller.type === 'aggregator' ? '🤝' : '👨‍🌾', text: place ? `${it.seller.name} · ${place}` : it.seller.name }}
      price={it.packPrice && it.packSize
        ? { main: `₹${it.packPrice}`, unit: `${packLabel(it.packSize, it.unit)} ${L('pack', 'ప్యాక్')}` }
        : { main: `₹${it.price}`, unit: unitLabel }}
      priceNote={
        <p className="mt-0.5 text-[11px] font-semibold text-[#27486a]">
          {L('Bulk price', 'బల్క్ ధర')} · {quantityText(it, L, unitLabel)}
        </p>
      }
      badge={it.stock !== null ? { tone: 'gray', text: L(`${formatQty(it.stock)} ${unitLabel} ready`, `${formatQty(it.stock)} ${unitLabel} సిద్ధం`) } : null}
      cta={
        <Link
          href={href}
          className="flex items-center justify-center w-full h-10 text-white font-bold rounded-xl text-sm whitespace-nowrap"
          style={{ background: SLATE }}
        >
          {buying ? L('Order bulk', 'బల్క్ ఆర్డర్') : L('View', 'చూడండి')}
        </Link>
      }
    />
  )
}

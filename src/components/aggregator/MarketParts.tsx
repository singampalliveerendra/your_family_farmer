'use client'

import Link from 'next/link'
import Icon from '@/components/home/Icon'
import { formatQty } from '@/lib/saleStep'
import { inr } from '@/lib/subscriptionPlans'
import { placeOf, type MarketItem } from '@/lib/bulkMarket'
import { TRANSPORT_STATE_LABELS } from '@/lib/wholesale'

/* Small shared pieces of the bulk market screens (Phase 5), so the list and
 * the detail page say things the same way. Slate = the aggregator colour;
 * turmeric stays for offers only. */

export const SLATE = '#27486a'
type T = (en: string, te: string) => string

/** "Delivers in AP, TG" or "Pickup only". */
export function transportText(it: Pick<MarketItem, 'transportStates'>, L: T): string {
  if (!it.transportStates.length) return L('Pickup only', 'పికప్ మాత్రమే')
  const s = it.transportStates.map((x) => L(TRANSPORT_STATE_LABELS[x].en, TRANSPORT_STATE_LABELS[x].te)).join(', ')
  return L(`Delivers in ${s}`, `${s}లో డెలివరీ`)
}

/** "Min 100 kg · packs of 25 kg". */
export function quantityText(it: Pick<MarketItem, 'minQty' | 'packSize' | 'unit'>, L: T, unitLabel: string): string {
  const min = L(`Min ${formatQty(it.minQty)} ${unitLabel}`, `కనీసం ${formatQty(it.minQty)} ${unitLabel}`)
  if (!it.packSize) return min
  return `${min} · ${L(`packs of ${formatQty(it.packSize)} ${unitLabel}`, `${formatQty(it.packSize)} ${unitLabel} ప్యాక్‌లు`)}`
}

export function SellerLine({ it, L }: { it: MarketItem; L: T }) {
  const place = placeOf(it.seller)
  return (
    <p className="flex min-w-0 items-center gap-1 text-[12px] text-black/60">
      <Icon name="pin" className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        <span className="font-semibold text-black/75">{it.seller.name}</span>
        {place ? ` · ${place}` : ''}
      </span>
      <span className="ml-1 shrink-0 rounded bg-black/5 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-black/55">
        {it.seller.type === 'aggregator' ? L('Aggregator', 'అగ్రిగేటర్') : L('Farmer', 'రైతు')}
      </span>
    </p>
  )
}

/** The call to action for an aggregator without a Buying plan. */
export function LockedNote({ L, compact = false }: { L: T; compact?: boolean }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl bg-white ring-1 ring-black/10 ${compact ? 'p-3' : 'p-4'}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: '#e5ecf3', color: SLATE }}>
        <Icon name="lock" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold leading-snug">{L('Phone numbers and ordering unlock with a Buying plan', 'బయింగ్ ప్లాన్‌తో ఫోన్ నంబర్లు, ఆర్డర్ చేయడం వస్తాయి')}</span>
        <span className="mt-0.5 block text-xs text-black/60">{L('You can look at everything now. Exact addresses are shown after you subscribe.', 'ఇప్పుడు అన్నీ చూడవచ్చు. సబ్‌స్క్రైబ్ చేసాక పూర్తి చిరునామాలు కనిపిస్తాయి.')}</span>
        <Link href="/aggregator/subscription" className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-white" style={{ background: SLATE }}>
          {L('See plans', 'ప్లాన్లు చూడండి')} <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </span>
    </div>
  )
}

export function Price({ it, unitLabel, L, big = false }: { it: MarketItem; unitLabel: string; L: T; big?: boolean }) {
  return (
    <p className="leading-none">
      <span className={`brand-wordmark font-bold text-[#1d2a20] ${big ? 'text-[2.4rem]' : 'text-2xl'}`}>{inr(it.price)}</span>
      <span className="ml-0.5 text-sm font-semibold text-black/55">/{unitLabel}</span>
      <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wide text-black/45">{L('bulk price', 'బల్క్ ధర')}</span>
    </p>
  )
}

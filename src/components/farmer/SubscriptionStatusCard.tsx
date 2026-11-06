'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import Icon from '@/components/home/Icon'
import { accessOf, type SubscriptionRow } from '@/lib/subscriptionPlans'
import { standingOf, type Standing } from '@/lib/subscriptionLifecycle'
import { planBadge } from '@/lib/planBadge'
import { needsSubscribeNudge } from '@/lib/planHighlight'
import SubscribeHighlight from '@/components/aggregator/SubscribeHighlight'
import type { PlanRow } from '@/lib/subscriptionPlans'

/* The aggregator dashboard's plan strip (Phase 4) and its two main actions —
 * the bulk market (Phase 5) and Sell your products — plus the selling-lock notice
 * (Phase 7). Redesigned 2026-11-05 on the client's word: the plan is one slim
 * line with a short badge on the right ("Free plan", "Till 12 Dec", "Renew"),
 * and Bulk market / Sell your products are two filled buttons that stand out
 * (renamed from "Sell bulk" 2026-11-06: it opens the normal Add produce). The
 * "Shop as a consumer" card is gone — the bottom bar's "Shop as buyer" does
 * the same. Shows nothing for farmers (they are free) or before the
 * subscription migration (the API answers configured: false). */

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

export default function SubscriptionStatusCard({ onSellBulk }: { onSellBulk?: () => void }) {
  const { L } = useLang()
  const [subs, setSubs] = useState<SubscriptionRow[] | null>(null)
  const [plans, setPlans] = useState<PlanRow[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/aggregator/subscription', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.configured) { setSubs((j.subscriptions ?? []) as SubscriptionRow[]); setPlans((j.plans ?? []) as PlanRow[]) } })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!subs) return null
  const now = new Date()
  const s: Standing = standingOf(subs, now)
  const a = accessOf(subs, now)
  const badge = planBadge(s, L, fmt)

  const sellClass = 'flex min-h-[64px] flex-col items-start justify-center gap-0.5 rounded-2xl bg-[#d99a1e] px-4 py-3 text-left text-[#2b1d02] shadow-md active:scale-[0.98]'

  return (
    <div className="space-y-2.5">
      {/* No plan, or one ending / ended: the big subscribe box comes first, so
          it can't be missed (client, 2026-11-05). Live and free-forever plans
          keep only the slim line below. */}
      {needsSubscribeNudge(s.state) && (
        <SubscribeHighlight plans={plans} where="dashboard" state={s.state as 'none' | 'expired' | 'ending'} href="/aggregator/subscription" />
      )}
      <Link
        href="/aggregator/subscription"
        className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/10"
      >
        <Icon name={s.state === 'expired' || s.state === 'ending' ? 'bell' : 'tag'} className="h-4 w-4 shrink-0 text-[#27486a]" />
        <span className="flex-1 text-[13px] font-bold text-[#27486a]">{L('Your plan', 'మీ ప్లాన్')}</span>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold" style={{ background: badge.bg, color: badge.ink }}>
          {badge.text} ›
        </span>
      </Link>

      {/* The two things an aggregator comes here for, side by side. */}
      <div className="grid grid-cols-2 gap-2.5">
        <Link
          href="/aggregator/market"
          className="flex min-h-[64px] flex-col items-start justify-center gap-0.5 rounded-2xl bg-[#27486a] px-4 py-3 text-white shadow-md active:scale-[0.98]"
        >
          <span className="flex items-center gap-1.5 text-[15px] font-extrabold"><Icon name="box" className="h-5 w-5" /> {L('Bulk market', 'బల్క్ మార్కెట్')}</span>
          <span className="text-[11px] font-semibold text-white/80">{L('Buy in bulk', 'బల్క్‌గా కొనండి')}</span>
        </Link>
        {a.selling && onSellBulk ? (
          <button type="button" onClick={onSellBulk} className={sellClass}>
            <span className="flex items-center gap-1.5 text-[15px] font-extrabold">🧺 {L('Sell your products', 'మీ ఉత్పత్తులు అమ్మండి')}</span>
            <span className="text-[11px] font-semibold text-[#2b1d02]/75">{L('Retail, wholesale or both', 'చిల్లర, హోల్‌సేల్ లేదా రెండూ')}</span>
          </button>
        ) : (
          <Link href="/aggregator/subscription" className={sellClass}>
            <span className="flex items-center gap-1.5 text-[15px] font-extrabold">🧺 {L('Sell your products', 'మీ ఉత్పత్తులు అమ్మండి')}</span>
            <span className="text-[11px] font-semibold text-[#2b1d02]/75">{L('Needs a Selling plan', 'సెల్లింగ్ ప్లాన్ అవసరం')}</span>
          </Link>
        )}
      </div>

      {/* The selling lock (Phase 7): say it BEFORE they fill a whole produce
          form, not after the save is refused. */}
      {!a.selling && (
        <p className="rounded-2xl border border-[#d99a1e]/40 bg-[#fdf4df] px-4 py-3 text-[13px] font-semibold leading-snug text-[#6b4a07]">
          {L('You can’t put produce on sale yet — that needs a Selling plan (or Buying + Selling).', 'మీరు ఇంకా ఉత్పత్తులను అమ్మకానికి పెట్టలేరు — దానికి సెల్లింగ్ ప్లాన్ (లేదా కొనుగోలు + అమ్మకం) అవసరం.')}{' '}
          <Link href="/aggregator/subscription" className="underline">{L('See plans', 'ప్లాన్లు చూడండి')}</Link>
        </p>
      )}
    </div>
  )
}

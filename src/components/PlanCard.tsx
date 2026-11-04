'use client'

import type { ReactNode } from 'react'
import {
  PLAN_KIND_BLURBS,
  PLAN_KIND_LABELS,
  durationLabel,
  highlightLines,
  inr,
  isPlanKind,
  perLabel,
  planPrice,
  type PlanRow,
} from '@/lib/subscriptionPlans'

// One subscription plan as an aggregator sees it: the actual price crossed
// out, the offer price big, what they save, how long it runs, when the offer
// ends, and its benefits. The same card is the moderator's live preview, so
// what they set is exactly what /home/aggregator shows. All numbers come from
// src/lib/subscriptionPlans.ts.

type Lang = 'en' | 'te'

const KIND_STYLE: Record<string, string> = {
  buying: 'bg-sky-100 text-sky-800',
  selling: 'bg-amber-100 text-amber-800',
  combined: 'bg-green-100 text-green-800',
}

function endDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

export default function PlanCard({
  plan,
  lang,
  now,
  footer,
  highlight,
}: {
  plan: PlanRow
  lang: Lang
  /** Pass a fixed time for previews/tests; defaults to now. */
  now?: Date
  footer?: ReactNode
  /** Draw the card a little louder (e.g. the best-value plan). */
  highlight?: boolean
}) {
  const t = (m: { en: string; te: string }) => m[lang]
  const pick = (en?: string | null, te?: string | null) => (lang === 'te' && te?.trim() ? te : en) ?? ''
  const p = planPrice(plan, now)
  const kind = isPlanKind(plan.kind) ? plan.kind : 'combined'
  const benefits = highlightLines(pick(plan.highlights_en, plan.highlights_te))
  const per = t(perLabel(plan.duration_days))
  const offerTag = pick(plan.offer_label_en, plan.offer_label_te)

  return (
    <article
      className={`relative flex flex-col rounded-3xl border-2 bg-white p-5 shadow-sm text-left text-gray-900 ${
        p.onOffer || highlight ? 'border-amber-400' : 'border-gray-200'
      }`}
    >
      {p.onOffer && (
        <span className="absolute -top-3 right-4 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white shadow">
          🔥 {offerTag || (lang === 'te' ? 'ఆఫర్' : 'Offer')}
        </span>
      )}

      <span className={`self-start rounded-full px-2.5 py-0.5 text-[11px] font-bold ${KIND_STYLE[kind]}`}>
        {t(PLAN_KIND_LABELS[kind])}
      </span>
      <h3 className="mt-2 text-lg font-extrabold leading-tight">{pick(plan.name_en, plan.name_te)}</h3>
      <p className="mt-0.5 text-xs leading-snug text-gray-500">{t(PLAN_KIND_BLURBS[kind])}</p>

      {/* Price */}
      <div className="mt-4">
        {p.onOffer && (
          <p className="text-sm font-semibold text-gray-400">
            <span className="line-through decoration-2">{inr(p.actual)}</span>
          </p>
        )}
        <p className="flex items-baseline gap-1">
          <span className={`text-4xl font-black ${p.onOffer ? 'text-orange-600' : 'text-green-800'}`}>
            {p.free ? (lang === 'te' ? 'ఉచితం' : 'Free') : inr(p.price)}
          </span>
          {!p.free && <span className="text-sm font-bold text-gray-500">{per}</span>}
        </p>
        <p className="mt-1 text-xs font-semibold text-gray-600">
          ⏳ {t(durationLabel(plan.duration_days))}
        </p>
        {p.onOffer && p.savings > 0 && (
          <p className="mt-2 inline-flex rounded-lg bg-green-50 px-2.5 py-1 text-xs font-extrabold text-green-800">
            {lang === 'te' ? `${inr(p.savings)} ఆదా (${p.savingsPct}%)` : `You save ${inr(p.savings)} (${p.savingsPct}%)`}
          </p>
        )}
        {p.offerEndsAt && (
          <p className="mt-1.5 text-[11px] font-bold text-orange-700">
            {lang === 'te' ? `ఆఫర్ ${endDate(p.offerEndsAt)} వరకు` : `Offer ends ${endDate(p.offerEndsAt)}`}
          </p>
        )}
      </div>

      {benefits.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-gray-100 pt-3 text-sm">
          {benefits.map((b) => (
            <li key={b} className="flex gap-2 leading-snug">
              <span className="text-green-600" aria-hidden>✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      {footer && <div className="mt-auto pt-4">{footer}</div>}
    </article>
  )
}

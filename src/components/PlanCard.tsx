'use client'

import type { ReactNode } from 'react'
import Icon from '@/components/home/Icon'
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

// One subscription plan as an aggregator sees it. The same card is the
// moderator's live preview, so what they set is exactly what /home/aggregator
// and /aggregator/subscription show. All numbers come from
// src/lib/subscriptionPlans.ts.
//
// The offer is the loudest thing on the card on purpose: a turmeric price tag
// with the offer's name, the old price struck through, and the saving set like
// a cut-out coupon. Without an offer the card is calm — ink and white.

type Lang = 'en' | 'te'

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
  /** The best-value plan gets a heavier outline and a "Best value" note. */
  highlight?: boolean
}) {
  const t = (m: { en: string; te: string }) => m[lang]
  const pick = (en?: string | null, te?: string | null) => (lang === 'te' && te?.trim() ? te : en) ?? ''
  const p = planPrice(plan, now)
  const kind = isPlanKind(plan.kind) ? plan.kind : 'combined'
  const benefits = highlightLines(pick(plan.highlights_en, plan.highlights_te))
  const per = t(perLabel(plan.duration_days))
  const offerTag = pick(plan.offer_label_en, plan.offer_label_te) || (lang === 'te' ? 'ప్రత్యేక ఆఫర్' : 'Special offer')

  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-2xl bg-white text-left text-[#1d2a20] ${
        p.onOffer ? 'ring-2 ring-[#d99a1e]' : highlight ? 'ring-2 ring-[#27486a]' : 'ring-1 ring-black/10'
      }`}
    >
      {p.onOffer && (
        <div className="flex items-center justify-between bg-[#fdf4df] pr-4">
          <span
            className="inline-flex items-center gap-2 bg-[#e9a823] py-1.5 pl-4 pr-6 text-[12px] font-extrabold uppercase tracking-wide text-[#3a2a05]"
            style={{ clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)' }}
          >
            <Icon name="tag" className="h-4 w-4" strokeWidth={2.2} /> {offerTag}
          </span>
          {p.offerEndsAt && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-[#8a5a06]">
              <Icon name="calendar" className="h-3.5 w-3.5" />
              {lang === 'te' ? `${endDate(p.offerEndsAt)} వరకు` : `Ends ${endDate(p.offerEndsAt)}`}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#27486a]">{t(PLAN_KIND_LABELS[kind])}</p>
            <h3 className="brand-wordmark mt-1 text-xl font-bold leading-tight">{pick(plan.name_en, plan.name_te)}</h3>
          </div>
          {highlight && !p.onOffer && (
            <span className="shrink-0 rounded-md bg-[#e5ecf3] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#27486a]">
              {lang === 'te' ? 'ఉత్తమ విలువ' : 'Best value'}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-black/60">{t(PLAN_KIND_BLURBS[kind])}</p>

        {/* Price */}
        <div className="mt-5 flex items-end gap-3">
          <p className="leading-none">
            {p.onOffer && (
              <span className="mb-1 block text-sm font-semibold text-black/45">
                <span className="line-through decoration-[#b4532a] decoration-2">{inr(p.actual)}</span>
              </span>
            )}
            <span className={`brand-wordmark text-[2.6rem] font-bold ${p.onOffer ? 'text-[#a35f00]' : 'text-[#1d2a20]'}`}>
              {p.free ? (lang === 'te' ? 'ఉచితం' : 'Free') : inr(p.price)}
            </span>
            {!p.free && <span className="ml-1 text-sm font-semibold text-black/55">{per}</span>}
          </p>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-black/65">
          <Icon name="clock" className="h-4 w-4" /> {t(durationLabel(plan.duration_days))}
        </p>

        {p.onOffer && p.savings > 0 && (
          <p className="mt-3 self-start rounded-lg border-2 border-dashed border-[#d99a1e] px-3 py-1.5 text-[13px] font-extrabold text-[#7a4a00]">
            {lang === 'te' ? `${inr(p.savings)} ఆదా · ${p.savingsPct}% తగ్గింపు` : `You save ${inr(p.savings)} · ${p.savingsPct}% off`}
          </p>
        )}

        {benefits.length > 0 && (
          <ul className="mt-5 space-y-2 border-t border-black/10 pt-4 text-sm">
            {benefits.map((b) => (
              <li key={b} className="flex gap-2.5 leading-snug">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-[#2f6f4f]" strokeWidth={2.4} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        {footer && <div className="mt-auto pt-5">{footer}</div>}
      </div>
    </article>
  )
}

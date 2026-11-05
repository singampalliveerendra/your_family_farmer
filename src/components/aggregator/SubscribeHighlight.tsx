'use client'

import Link from 'next/link'
import { useMemo, useSyncExternalStore } from 'react'
import { useLang } from '@/lib/LanguageContext'
import Icon from '@/components/home/Icon'
import { planHighlight, type PlanHighlight } from '@/lib/planHighlight'
import type { PlanRow } from '@/lib/subscriptionPlans'

/* The big "subscribe" box (client, 2026-11-05): an aggregator must notice that
 * bulk buying and selling need a plan. Two places:
 *   dashboard — for an aggregator with no plan, or one ending / ended
 *   intro     — right under the heading of /home/aggregator, before anything
 * Prices are the live ones the moderator set (lowest, plus the best offer). */

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

export default function SubscribeHighlight({ plans, where, state = 'none', href }: {
  plans: PlanRow[]
  where: 'dashboard' | 'intro'
  /** Dashboard: the aggregator's standing — changes the heading. */
  state?: 'none' | 'expired' | 'ending'
  href: string
}) {
  const { L } = useLang()
  // Priced in the browser so an offer that ended a minute ago shows the real price.
  // (null on the server render, then the real numbers once in the browser).
  const inBrowser = useSyncExternalStore(() => () => {}, () => true, () => false)
  const h: PlanHighlight | null = useMemo(() => (inBrowser ? planHighlight(plans, new Date()) : null), [inBrowser, plans])

  const title = where === 'intro'
    ? L('Aggregators need a subscription', 'అగ్రిగేటర్లకు సబ్‌స్క్రిప్షన్ అవసరం')
    : state === 'expired' ? L('Your plan has ended — renew to keep buying and selling', 'మీ ప్లాన్ ముగిసింది — కొనుగోలు, అమ్మకం కొనసాగించడానికి రీన్యూ చేయండి')
    : state === 'ending' ? L('Your plan is ending soon — renew now', 'మీ ప్లాన్ త్వరలో ముగుస్తుంది — ఇప్పుడే రీన్యూ చేయండి')
    : L('Subscribe to unlock bulk buying and selling', 'బల్క్ కొనుగోలు, అమ్మకం కోసం సబ్‌స్క్రైబ్ చేయండి')

  return (
    <section
      aria-label={L('Subscription', 'సబ్‌స్క్రిప్షన్')}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#27486a] to-[#1b3550] p-5 text-white shadow-lg ring-2 ring-[#d99a1e]"
    >
      {h && h.bestOfferPct > 0 && (
        <span className="absolute right-3 top-3 rounded-full bg-[#d99a1e] px-2.5 py-1 text-[11px] font-extrabold text-[#2b1d02]">
          {L(`${h.bestOfferPct}% OFF`, `${h.bestOfferPct}% తగ్గింపు`)}{h.offerEndsAt ? L(` · till ${fmt(h.offerEndsAt)}`, ` · ${fmt(h.offerEndsAt)} వరకు`) : ''}
        </span>
      )}
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#f3cf7a]">⭐ {L('Subscription', 'సబ్‌స్క్రిప్షన్')}</p>
      <h2 className="mt-1 pr-20 text-lg font-extrabold leading-snug">{title}</h2>
      <ul className="mt-3 space-y-1.5 text-[13px] text-white/90">
        <li className="flex items-start gap-2"><Icon name="box" className="mt-0.5 h-4 w-4 shrink-0 text-[#f3cf7a]" />{L('Buy bulk lots from farmers and aggregators, and order in the app', 'రైతులు, అగ్రిగేటర్ల నుండి బల్క్ లాట్‌లు కొని, యాప్‌లోనే ఆర్డర్ చేయండి')}</li>
        <li className="flex items-start gap-2"><Icon name="phone" className="mt-0.5 h-4 w-4 shrink-0 text-[#f3cf7a]" />{L('See sellers’ phone, WhatsApp and address', 'అమ్మకందారుల ఫోన్, వాట్సాప్, చిరునామా చూడండి')}</li>
        <li className="flex items-start gap-2"><Icon name="tag" className="mt-0.5 h-4 w-4 shrink-0 text-[#f3cf7a]" />{L('Sell your produce on Go Grameen — retail, wholesale or both', 'మీ ఉత్పత్తులను గో గ్రామీణ్‌లో అమ్మండి — చిల్లర, హోల్‌సేల్ లేదా రెండూ')}</li>
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {h && (
          <p className="leading-tight">
            <span className="block text-[11px] text-white/70">{h.allFree ? L('Right now', 'ప్రస్తుతం') : L('Plans from', 'ప్లాన్లు')}</span>
            <span className="text-2xl font-extrabold">{h.allFree ? L('Free', 'ఉచితం') : `₹${h.fromPrice.toLocaleString('en-IN')}`}</span>
            {!h.allFree && <span className="text-sm text-white/80"> / {L(h.fromPeriod.en, h.fromPeriod.te)}</span>}
          </p>
        )}
        <Link href={href} className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl bg-[#d99a1e] px-5 text-[15px] font-extrabold text-[#2b1d02] shadow active:scale-[0.98]">
          {where === 'intro' ? L('See plans', 'ప్లాన్లు చూడండి') : state === 'none' ? L('Subscribe now', 'ఇప్పుడే సబ్‌స్క్రైబ్') : L('Renew now', 'ఇప్పుడే రీన్యూ')} <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import { useLang } from '@/lib/LanguageContext'
import Icon, { type IconName } from '@/components/home/Icon'
import { ROLE_ACCENT, type Pair, type Role } from '@/lib/roleContent'
import { inr, plansTeaser, type PlanRow } from '@/lib/subscriptionPlans'

/* "Where would you like to start?" — the landing page's three ways in
 * (business model agreed 2026-11-04):
 *   Consumer   → straight into the retail shop ("Why shop here?" explains)
 *   Farmer     → /home/farmer, what farmers get — free, always
 *   Aggregator → /home/aggregator, how the plans work, live plans and offers
 *
 * Each card carries its role's colour, three plain facts and its next step.
 * Plan prices appear ONLY on the Aggregator card, as a turmeric price tag:
 * most visitors are household buyers, and a subscription price shouting from
 * the top of the page would read as "do I have to pay?". The tag is worked out
 * in the browser (plansTeaser) so an offer that ended since the page was
 * cached never shows its old price.
 *
 * Moderator (staff-only) and delivery rider (recruited, at the client's
 * request) are deliberately absent; both keep their own logins. */

type Card = {
  role: Role
  icon: IconName
  title: Pair
  points: Pair[]
  primary: { href: string; label: Pair }
  secondary: { href: string; label: Pair }
}

export const ROLE_CARDS: Card[] = [
  {
    role: 'consumer',
    icon: 'cart',
    title: ['Shop as a Consumer', 'వినియోగదారుగా కొనండి'],
    points: [
      ['Harvest time on every item', 'ప్రతి వస్తువుపై కోసిన సమయం'],
      ['The farmer who grew it is named', 'పండించిన రైతు పేరు కనిపిస్తుంది'],
      ['Pickup or home delivery', 'పికప్ లేదా ఇంటికి డెలివరీ'],
    ],
    primary: { href: '/consumer', label: ['Start shopping', 'కొనడం మొదలుపెట్టండి'] },
    secondary: { href: '/home/consumer', label: ['Why shop here?', 'ఇక్కడే ఎందుకు?'] },
  },
  {
    role: 'farmer',
    icon: 'sprout',
    title: ["I'm a Farmer", 'నేను రైతుని'],
    points: [
      ['No subscription — free, always', 'సబ్‌స్క్రిప్షన్ లేదు — ఎప్పటికీ ఉచితం'],
      ['Sell retail to families, bulk to aggregators', 'కుటుంబాలకు చిల్లర, అగ్రిగేటర్లకు బల్క్'],
      ['You set the price', 'ధర మీరే నిర్ణయిస్తారు'],
    ],
    primary: { href: '/home/farmer', label: ['See how it works', 'ఎలా పనిచేస్తుందో చూడండి'] },
    secondary: { href: '/farmer/login', label: ['Log in', 'లాగిన్'] },
  },
  {
    role: 'aggregator',
    icon: 'box',
    title: ["I'm an Aggregator", 'నేను అగ్రిగేటర్‌ని'],
    points: [
      ['Buy bulk straight from farmers', 'రైతుల నుండి నేరుగా బల్క్ కొనండి'],
      ['Sell retail, wholesale or both', 'చిల్లర, హోల్‌సేల్ లేదా రెండూ అమ్మండి'],
      ['0% platform fee on bulk orders', 'బల్క్ ఆర్డర్లపై 0% ప్లాట్‌ఫామ్ ఫీజు'],
    ],
    primary: { href: '/home/aggregator', label: ['See plans & offers', 'ప్లాన్లు & ఆఫర్లు చూడండి'] },
    secondary: { href: '/aggregator/login', label: ['Log in', 'లాగిన్'] },
  },
]

export default function RoleSelect({ plans = [] }: { plans?: PlanRow[] }) {
  const { L } = useLang()
  // undefined until mounted: the server's clock and cache must not decide
  // whether an offer is still running.
  const [teaser, setTeaser] = useState<ReturnType<typeof plansTeaser> | undefined>(undefined)
  useEffect(() => { setTeaser(plansTeaser(plans)) }, [plans])

  const tag = (role: Role): { text: string; offer: boolean } | null => {
    if (role === 'farmer') return { text: L('Free, always', 'ఎప్పటికీ ఉచితం'), offer: false }
    if (role !== 'aggregator' || teaser === undefined) return null
    if (!teaser) return { text: L('Plans coming soon', 'ప్లాన్లు త్వరలో'), offer: false }
    if (teaser.bestSavingPct > 0) return { text: L(`Save up to ${teaser.bestSavingPct}%`, `${teaser.bestSavingPct}% వరకు ఆదా`), offer: true }
    if (teaser.fromPrice === 0) return { text: L('Free plan available', 'ఉచిత ప్లాన్ ఉంది'), offer: true }
    return { text: L(`From ${inr(teaser.fromPrice)}${teaser.fromPer.en}`, `${inr(teaser.fromPrice)}${teaser.fromPer.te} నుండి`), offer: false }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {ROLE_CARDS.map((c, i) => {
        const a = ROLE_ACCENT[c.role]
        const b = tag(c.role)
        return (
          <article
            key={c.role}
            style={{ '--ink': a.ink, '--tint': a.tint, animationDelay: `${0.05 * i}s` } as CSSProperties}
            className="gghome-rise relative flex flex-col overflow-hidden rounded-2xl bg-white text-left text-[#1d2a20] shadow-sm ring-1 ring-black/10 dark:bg-white/5 dark:text-white dark:ring-white/10"
          >
            <span aria-hidden className="h-1.5 bg-[var(--ink)]" />
            <div className="flex flex-1 flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--tint)] text-[var(--ink)]">
                  <Icon name={c.icon} className="h-6 w-6" />
                </span>
                {b && (
                  b.offer ? (
                    <span
                      className="inline-flex items-center gap-1.5 bg-[#e9a823] py-1 pl-3 pr-5 text-[12px] font-extrabold text-[#3a2a05]"
                      style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)' }}
                    >
                      <Icon name="tag" className="h-3.5 w-3.5" strokeWidth={2.2} /> {b.text}
                    </span>
                  ) : (
                    <span className="rounded-md bg-[var(--tint)] px-2 py-1 text-[11px] font-bold text-[var(--ink)] dark:bg-white/10 dark:text-white">{b.text}</span>
                  )
                )}
              </div>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ink)] dark:text-lime-300">{L(a.label[0], a.label[1])}</p>
              <h3 className="brand-wordmark mt-1 text-xl font-bold leading-tight">{L(c.title[0], c.title[1])}</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {c.points.map((p) => (
                  <li key={p[0]} className="flex gap-2 leading-snug text-black/70 dark:text-white/75">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink)] dark:text-lime-300" strokeWidth={2.4} />
                    {L(p[0], p[1])}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-5">
                <Link
                  href={c.primary.href}
                  className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-4 text-[15px] font-bold text-white active:opacity-90"
                >
                  {L(c.primary.label[0], c.primary.label[1])} <Icon name="arrow" className="h-4 w-4" />
                </Link>
                <Link
                  href={c.secondary.href}
                  className="mt-2 flex min-h-[40px] items-center justify-center text-sm font-bold text-[var(--ink)] underline-offset-4 hover:underline dark:text-lime-300"
                >
                  {L(c.secondary.label[0], c.secondary.label[1])}
                </Link>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { inr, plansTeaser, type PlanRow } from '@/lib/subscriptionPlans'

/* "Where would you like to start?" — the landing page's three ways in
 * (business model agreed 2026-11-04):
 *   Buyer      → straight into the retail shop (no explainer needed)
 *   Farmer     → /home/farmer, what farmers get — free, always
 *   Aggregator → /home/aggregator, how buying + selling plans work, live plans
 *
 * Plan prices appear ONLY on the Aggregator card, as a small badge: most
 * visitors are household buyers, and a subscription price at the top of the
 * page would read as "do I have to pay?". The badge is worked out in the
 * browser (plansTeaser) so an offer that ended since the page was cached never
 * shows its old price.
 *
 * Moderator (staff-only) and delivery rider (recruited, at the client's
 * request) are deliberately absent; both keep their own logins. */

type Role = {
  key: 'buyer' | 'farmer' | 'aggregator'
  href: string
  emoji: string
  title: [string, string]
  blurb: [string, string]
  cta: [string, string]
}

const ROLES: Role[] = [
  {
    key: 'buyer',
    href: '/consumer',
    emoji: '🛒',
    title: ['Shop as a Consumer', 'వినియోగదారుగా కొనండి'],
    blurb: ['Fresh retail produce, straight from farmers.', 'రైతుల నుండి నేరుగా తాజా చిల్లర ఉత్పత్తులు.'],
    cta: ['Start shopping', 'కొనడం మొదలుపెట్టండి'],
  },
  {
    key: 'farmer',
    href: '/home/farmer',
    emoji: '🧑‍🌾',
    title: ["I'm a Farmer", 'నేను రైతుని'],
    blurb: ['Sell retail to families and in bulk to aggregators.', 'కుటుంబాలకు చిల్లరగా, అగ్రిగేటర్లకు బల్క్‌గా అమ్మండి.'],
    cta: ['See how it works', 'ఎలా పనిచేస్తుందో చూడండి'],
  },
  {
    key: 'aggregator',
    href: '/home/aggregator',
    emoji: '📦',
    title: ["I'm an Aggregator", 'నేను అగ్రిగేటర్‌ని'],
    blurb: ['Buy in bulk from farmers and resell on Go Grameen.', 'రైతుల నుండి బల్క్‌గా కొని గో గ్రామీణ్‌లో అమ్మండి.'],
    cta: ['See plans & offers', 'ప్లాన్లు & ఆఫర్లు చూడండి'],
  },
]

export default function RoleSelect({ plans = [] }: { plans?: PlanRow[] }) {
  const { L } = useLang()
  // null until mounted: the server's clock and cache must not decide whether an
  // offer is still running.
  const [teaser, setTeaser] = useState<ReturnType<typeof plansTeaser> | undefined>(undefined)
  useEffect(() => { setTeaser(plansTeaser(plans)) }, [plans])

  const badge = (key: Role['key']) => {
    if (key === 'farmer') return { text: L('Free, always', 'ఎప్పటికీ ఉచితం'), tone: 'bg-green-600 text-white' }
    if (key !== 'aggregator' || teaser === undefined) return null
    if (!teaser) return { text: L('Plans coming soon', 'ప్లాన్లు త్వరలో'), tone: 'bg-gray-200 text-gray-700' }
    if (teaser.bestSavingPct > 0) {
      return {
        text: L(`🔥 Save up to ${teaser.bestSavingPct}%`, `🔥 ${teaser.bestSavingPct}% వరకు ఆదా`),
        tone: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white',
      }
    }
    return teaser.fromPrice === 0
      ? { text: L('Free plan available', 'ఉచిత ప్లాన్ ఉంది'), tone: 'bg-green-600 text-white' }
      : { text: L(`Plans from ${inr(teaser.fromPrice)}${teaser.fromPer.en}`, `${inr(teaser.fromPrice)}${teaser.fromPer.te} నుండి`), tone: 'bg-sky-600 text-white' }
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {ROLES.map((r, i) => {
        const b = badge(r.key)
        return (
          <Link
            key={r.key}
            href={r.href}
            className="gghome-card gghome-rise group relative flex flex-col gap-2 rounded-2xl border border-green-900/10 bg-white p-4 text-left shadow-sm backdrop-blur-sm transition hover:border-lime-600/50 hover:bg-lime-50 dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:hover:border-lime-300/50 dark:hover:bg-white/10"
            style={{ animationDelay: `${0.05 * i}s` }}
          >
            {b && (
              <span className={`absolute -top-2.5 right-3 rounded-full px-2.5 py-0.5 text-[11px] font-black shadow ${b.tone}`}>{b.text}</span>
            )}
            <span className="flex items-center gap-3">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-lime-100 text-2xl ring-1 ring-lime-600/20 dark:bg-lime-300/15 dark:ring-lime-300/25"
                aria-hidden
              >
                {r.emoji}
              </span>
              <span className="min-w-0">
                <span className="block font-extrabold leading-tight text-green-950 dark:text-white">{L(r.title[0], r.title[1])}</span>
                <span className="block text-sm leading-snug text-green-900/65 dark:text-lime-100/60">{L(r.blurb[0], r.blurb[1])}</span>
              </span>
            </span>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-bold text-green-800 dark:text-lime-300">
              {L(r.cta[0], r.cta[1])}
              <span aria-hidden className="transition group-hover:translate-x-1">→</span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}

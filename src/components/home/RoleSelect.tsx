'use client'

import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'

/* "Who are you?" — the landing page's way into the public selling surfaces.
 *
 * Mirrors RoleGateModal's buyer/farmer split, plus the aggregator entry that
 * already exists in GlobalNav's switch menu.
 *
 * Two roles are deliberately absent. Moderator is staff-only and has no
 * business on a public marketing page. Delivery rider was removed at the
 * client's request — riders are recruited, not signed up off a landing page.
 * Both still reach their own logins directly (/moderator/login, /rider). */

type Role = {
  href: string
  emoji: string
  title: [string, string]
  blurb: [string, string]
}

const ROLES: Role[] = [
  {
    href: '/consumer',
    emoji: '🛒',
    title: ["I'm a Buyer", 'నేను కొనుగోలుదారుని'],
    blurb: ['Browse today’s harvests and order direct.', 'నేటి కోతలు చూసి నేరుగా ఆర్డర్ చేయండి.'],
  },
  {
    href: '/farmer/login',
    emoji: '🧑‍🌾',
    title: ["I'm a Farmer", 'నేను రైతుని'],
    blurb: ['List your harvest. Keep the whole price.', 'మీ కోత నమోదు చేయండి. పూర్తి ధర మీదే.'],
  },
  {
    href: '/aggregator/login',
    emoji: '📦',
    title: ["I'm an Aggregator", 'నేను అగ్రిగేటర్‌ని'],
    blurb: ['Sell for many farmers — each one named.', 'రైతుల తరఫున అమ్మండి — ప్రతి పేరు కనిపిస్తుంది.'],
  },
]

export default function RoleSelect() {
  const { L } = useLang()

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {ROLES.map((r, i) => (
        <Link
          key={r.href}
          href={r.href}
          /* Three cards in a two-column grid leaves an odd one out, so the last
             one spans the full width rather than sitting in a lopsided gap. */
          className="gghome-card gghome-rise group flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur-sm transition hover:border-lime-300/50 hover:bg-white/10 sm:last:col-span-2"
          style={{ animationDelay: `${0.05 * i}s` }}
        >
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-lime-300/15 text-2xl ring-1 ring-lime-300/25"
            aria-hidden
          >
            {r.emoji}
          </span>
          <span className="min-w-0">
            <span className="block font-extrabold text-white">{L(r.title[0], r.title[1])}</span>
            <span className="block text-sm text-lime-100/60 leading-snug">{L(r.blurb[0], r.blurb[1])}</span>
          </span>
          <span
            className="ml-auto shrink-0 text-lime-300/50 transition group-hover:translate-x-1 group-hover:text-lime-300"
            aria-hidden
          >
            →
          </span>
        </Link>
      ))}
    </div>
  )
}

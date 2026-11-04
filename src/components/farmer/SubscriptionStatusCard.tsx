'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import Icon from '@/components/home/Icon'
import { accessOf, type SubscriptionRow } from '@/lib/subscriptionPlans'
import { standingOf, type Standing } from '@/lib/subscriptionLifecycle'

/* The aggregator dashboard's plan strip (Phase 4) and the way into the bulk
 * market (Phase 5): what they can do now and
 * the one thing to do next — renew when ending or ended, choose a plan when
 * they have none. Stays out of the way when all is fine (one quiet line), and
 * shows nothing at all for farmers (they are free) or before the subscription
 * migration (the API answers configured: false). */

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

export default function SubscriptionStatusCard() {
  const { L } = useLang()
  const [subs, setSubs] = useState<SubscriptionRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/aggregator/subscription', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.configured) setSubs((j.subscriptions ?? []) as SubscriptionRow[]) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!subs) return null
  const now = new Date()
  const s: Standing = standingOf(subs, now)
  const a = accessOf(subs, now)

  const tone =
    s.state === 'expired' ? { bg: '#f8e7de', ink: '#6e2c12', bar: '#b4532a' }
    : s.state === 'ending' || s.state === 'none' ? { bg: '#fdf4df', ink: '#6b4a07', bar: '#d99a1e' }
    : { bg: '#e5ecf3', ink: '#27486a', bar: '#27486a' }

  const line =
    s.state === 'forever' ? L('Your plan: free forever', 'మీ ప్లాన్: ఎప్పటికీ ఉచితం')
    : s.state === 'active' ? L(`Your plan is active until ${fmt(s.endsAt)}`, `మీ ప్లాన్ ${fmt(s.endsAt)} వరకు ఉంది`)
    : s.state === 'ending' ? L(`Your plan ends on ${fmt(s.endsAt)} — renew to keep going`, `మీ ప్లాన్ ${fmt(s.endsAt)}న ముగుస్తుంది — కొనసాగించడానికి రీన్యూ చేయండి`)
    : s.state === 'expired' ? L(`Your plan ended on ${fmt(s.endedAt)} — renew now`, `మీ ప్లాన్ ${fmt(s.endedAt)}న ముగిసింది — ఇప్పుడే రీన్యూ చేయండి`)
    : L('Choose a plan to buy in bulk and sell on Go Grameen', 'బల్క్‌గా కొనడానికి, గో గ్రామీణ్‌లో అమ్మడానికి ప్లాన్ ఎంచుకోండి')

  const cta =
    s.state === 'ending' || s.state === 'expired' ? L('Renew', 'రీన్యూ')
    : s.state === 'none' ? L('See plans', 'ప్లాన్లు చూడండి')
    : L('Manage', 'నిర్వహించు')

  return (
    <div className="space-y-2">
    <Link
      href="/aggregator/subscription"
      className="flex items-center gap-3 rounded-2xl border-l-4 p-4 shadow-sm"
      style={{ background: tone.bg, borderColor: tone.bar, color: tone.ink }}
    >
      <Icon name={s.state === 'expired' || s.state === 'ending' ? 'bell' : 'tag'} className="h-6 w-6 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold leading-snug">{line}</span>
        <span className="mt-0.5 block text-[11px] font-semibold opacity-80">
          {L('Buying', 'కొనుగోలు')} {a.buying ? '✓' : '✕'} · {L('Selling', 'అమ్మకం')} {a.selling ? '✓' : '✕'}
        </span>
      </span>
      <span className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-extrabold text-white" style={{ background: tone.bar }}>{cta}</span>
    </Link>
    {/* The bulk market (Phase 5) — open to every aggregator; a Buying plan
        unlocks seller contacts and ordering. */}
    <Link href="/aggregator/market" className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/10">
      <Icon name="box" className="h-6 w-6 shrink-0 text-[#27486a]" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-[#27486a]">{L('Bulk market', 'బల్క్ మార్కెట్')}</span>
        <span className="block text-[11px] text-black/55">{L('Buy bulk lots from farmers and other aggregators', 'రైతులు, ఇతర అగ్రిగేటర్ల నుండి బల్క్ లాట్‌లు కొనండి')}</span>
      </span>
      <Icon name="arrow" className="h-5 w-5 shrink-0 text-black/35" />
    </Link>
    </div>
  )
}

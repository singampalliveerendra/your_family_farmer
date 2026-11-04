'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import PlanCard from '@/components/PlanCard'
import { planPrice, sortPlans, type PlanRow } from '@/lib/subscriptionPlans'

/* The live plans on /home/aggregator — exactly what the moderator set on
 * /moderator/subscriptions, in their order. Sorted and priced in the browser
 * (not on the cached server page), so an offer that ended a minute ago already
 * shows the actual price again. Until a moderator adds a plan: "coming soon".
 * Subscribing online is Phase 4; until then the card leads to signup and says
 * a moderator can switch the plan on. */

export default function AggregatorPlans({ plans }: { plans: PlanRow[] }) {
  const { lang, L } = useLang()
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => { setNow(new Date()) }, [])
  const list = now ? sortPlans(plans, now) : []
  // The biggest saving gets the "best value" outline.
  const best = list.reduce<{ id: string | null; pct: number }>((b, p) => {
    const pct = now ? planPrice(p, now).savingsPct : 0
    return pct > b.pct ? { id: p.id, pct } : b
  }, { id: null, pct: 0 }).id

  return (
    <section id="plans" aria-labelledby="plans-h" className="scroll-mt-4">
      <h2 id="plans-h" className="text-xl font-black">{L('Plans & offers', 'ప్లాన్లు & ఆఫర్లు')}</h2>
      <p className="mt-1 text-sm text-green-900/70">
        {L('Prices are set by Go Grameen and may change. Offers end on the date shown.', 'ధరలు గో గ్రామీణ్ నిర్ణయిస్తుంది, మారవచ్చు. ఆఫర్లు చూపిన తేదీకి ముగుస్తాయి.')}
      </p>
      {!now ? (
        <div className="mt-4 h-40 animate-pulse rounded-3xl bg-white/70" />
      ) : list.length === 0 ? (
        <div className="mt-4 rounded-3xl border-2 border-dashed border-green-900/15 bg-white p-6 text-center">
          <p className="text-3xl" aria-hidden>🏷️</p>
          <p className="mt-2 font-extrabold">{L('Plans coming soon', 'ప్లాన్లు త్వరలో')}</p>
          <p className="mt-1 text-sm text-green-900/70">{L('Create your account now — we will tell you when plans open.', 'ఇప్పుడే ఖాతా తెరవండి — ప్లాన్లు మొదలవగానే మీకు చెబుతాం.')}</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {list.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              lang={lang === 'te' ? 'te' : 'en'}
              now={now}
              highlight={p.id === best}
              footer={
                <Link
                  href="/aggregator/signup"
                  className="flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-green-800 text-sm font-extrabold text-white active:bg-green-900"
                >
                  {L('Create account to subscribe', 'సబ్‌స్క్రైబ్ చేయడానికి ఖాతా తెరవండి')}
                </Link>
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}

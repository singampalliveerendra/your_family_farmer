'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import PlanCard from '@/components/PlanCard'
import Icon from '@/components/home/Icon'
import { SectionTitle } from '@/components/home/RoleExplainer'
import { PLAN_COMPARE } from '@/lib/roleContent'
import { PLAN_KIND_LABELS, planPrice, sortPlans, type PlanRow } from '@/lib/subscriptionPlans'

/* The live plans on /home/aggregator — exactly what the moderator set on
 * /moderator/subscriptions, in their order — and a table of what each kind of
 * plan unlocks. Sorted and priced in the browser (not on the cached server
 * page), so an offer that ended a minute ago already shows the actual price.
 * Until a moderator adds a plan: "coming soon". Subscribing happens after
 * login, on /aggregator/subscription. */

export default function AggregatorPlans({ plans }: { plans: PlanRow[] }) {
  const { lang, L } = useLang()
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => { setNow(new Date()) }, [])
  const list = now ? sortPlans(plans, now) : []
  const best = list.reduce<{ id: string | null; pct: number }>((b, p) => {
    const pct = now ? planPrice(p, now).savingsPct : 0
    return pct > b.pct ? { id: p.id, pct } : b
  }, { id: null, pct: 0 }).id
  const lg = lang === 'te' ? 'te' : 'en'

  return (
    <section id="plans" aria-labelledby="plans-h" className="scroll-mt-4">
      <SectionTitle id="plans-h" kicker={L('Subscription', 'సబ్‌స్క్రిప్షన్')}>{L('Plans & offers', 'ప్లాన్లు & ఆఫర్లు')}</SectionTitle>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-black/65">
        {L('Pick the plan that fits how you work. Offers end on the date shown, then the regular price applies.', 'మీ పనికి తగిన ప్లాన్ ఎంచుకోండి. ఆఫర్లు చూపిన తేదీకి ముగుస్తాయి, తర్వాత సాధారణ ధర.')}
      </p>

      {!now ? (
        <div className="mt-5 h-48 animate-pulse rounded-2xl bg-black/5" />
      ) : list.length === 0 ? (
        <div className="mt-5 rounded-2xl border-2 border-dashed border-black/15 bg-white px-5 py-8 text-center">
          <Icon name="tag" className="mx-auto h-8 w-8 text-black/35" />
          <p className="mt-2 font-bold">{L('Plans coming soon', 'ప్లాన్లు త్వరలో')}</p>
          <p className="mt-1 text-sm text-black/60">{L('Create your account now — we will tell you when plans open.', 'ఇప్పుడే ఖాతా తెరవండి — ప్లాన్లు మొదలవగానే మీకు చెబుతాం.')}</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              lang={lg}
              now={now}
              highlight={p.id === best}
              footer={
                <Link
                  href="/aggregator/subscription"
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#27486a] text-sm font-bold text-white active:bg-[#1d3651]"
                >
                  {L('Choose this plan', 'ఈ ప్లాన్ ఎంచుకోండి')} <Icon name="arrow" className="h-4 w-4" />
                </Link>
              }
            />
          ))}
        </div>
      )}
      {list.length > 0 && (
        <p className="mt-3 text-xs text-black/55">
          {L('You will log in or create your account first, then pay securely online.', 'ముందుగా లాగిన్ అవ్వండి లేదా ఖాతా తెరవండి, తర్వాత ఆన్‌లైన్‌లో సురక్షితంగా చెల్లించండి.')}
        </p>
      )}

      {/* What each kind unlocks — scrolls sideways on the smallest phones. */}
      <div className="mt-8 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/10">
        <table className="w-full min-w-[340px] text-sm">
          <caption className="px-4 pt-4 text-left text-[13px] font-bold text-black/70">{L('What each plan unlocks', 'ఏ ప్లాన్‌తో ఏమి వస్తుంది')}</caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-black/55">
              <th className="px-4 py-3 text-left font-bold" scope="col"><span className="sr-only">{L('Feature', 'సౌకర్యం')}</span></th>
              {(['buying', 'selling'] as const).map((k) => (
                <th key={k} scope="col" className="px-2 py-3 text-center font-bold">{PLAN_KIND_LABELS[k][lg]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLAN_COMPARE.map((r) => (
              <tr key={r.label[0]} className="border-t border-black/10">
                <th scope="row" className="px-4 py-3 text-left font-medium leading-snug">{L(r.label[0], r.label[1])}</th>
                {([r.buying, r.selling] as const).map((on, i) => (
                  <td key={i} className="px-2 py-3 text-center">
                    {on ? (
                      <Icon name="check" className="mx-auto h-5 w-5 text-[#2f6f4f]" strokeWidth={2.6} />
                    ) : (
                      <span className="text-black/25" aria-label={L('Not included', 'లేదు')}>—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

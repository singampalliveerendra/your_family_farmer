'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { requireFarmerSession } from '@/lib/farmer-auth-client'
import LanguageToggle from '@/components/LanguageToggle'
import BackButton from '@/components/BackButton'
import PlanCard from '@/components/PlanCard'
import Icon from '@/components/home/Icon'
import { PLAN_KIND_LABELS, accessOf, inr, isPlanKind, planPrice, sortPlans, type PlanKind, type PlanRow, type SubscriptionRow } from '@/lib/subscriptionPlans'
import { currentCoverEnd, standingOf, type StartMode } from '@/lib/subscriptionLifecycle'
import { hasReceipt } from '@/lib/subscriptionReceipt'
import { paySubscription, startSubscription } from '@/lib/subscriptionCheckout'

/* /aggregator/subscription — the aggregator's plan screen (Phase 4):
 *   where they stand (Buying / Selling, until when, ending soon, ended),
 *   the plans on offer with Subscribe, a "start now or after the current plan"
 *   choice when they already hold one (no refunds, no part payments — decision
 *   2026-11-04), payment through Cashfree, and every past plan with its
 *   receipt. A ₹0 plan starts at once. The server re-prices every purchase;
 *   nothing on this screen decides what is charged. */

type Sub = SubscriptionRow & { amount_paid?: number | string | null; receipt_no?: string | null; created_at?: string; plan_name?: string | null }
type Phase = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'done'; subscriptionId: string } | { kind: 'error'; text: string }

const SLATE = '#27486a'
const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : ''

export default function AggregatorSubscriptionPage() {
  const { lang, L } = useLang()
  const lg = lang === 'te' ? 'te' : 'en'
  const [state, setState] = useState<'loading' | 'ready' | 'notAggregator' | 'off'>('loading')
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [subs, setSubs] = useState<Sub[]>([])
  const [ask, setAsk] = useState<{ plan: PlanRow; currentEnd: string } | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const load = useCallback(async () => {
    const r = await fetch('/api/aggregator/subscription', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null)
    if (r?.status === 401) { setState('notAggregator'); return }
    const j = r ? await r.json().catch(() => null) : null
    if (!j) { setState('off'); return }
    setPlans((j.plans ?? []) as PlanRow[])
    setSubs((j.subscriptions ?? []) as Sub[])
    setState(j.configured === false ? 'off' : 'ready')
  }, [])

  useEffect(() => {
    void (async () => {
      const id = await requireFarmerSession()
      if (id) await load()
    })()
  }, [load])

  const now = new Date()
  const access = accessOf(subs, now)
  const standing = standingOf(subs, now)
  const list = sortPlans(plans, now)

  const choose = (plan: PlanRow) => {
    if (!isPlanKind(plan.kind)) return
    const cover = currentCoverEnd(subs, plan.kind as PlanKind, now)
    if (cover.endsAt) setAsk({ plan, currentEnd: cover.endsAt })
    else void buy(plan, 'now')
  }

  const buy = async (plan: PlanRow, mode: StartMode) => {
    setAsk(null)
    setPhase({ kind: 'busy', text: L('Starting…', 'మొదలవుతోంది…') })
    const s = await startSubscription(plan.id, mode)
    if (!s.ok) { setPhase({ kind: 'error', text: s.error }); return }
    if (s.free) { await load(); setPhase({ kind: 'done', subscriptionId: s.subscriptionId }); return }
    setPhase({ kind: 'busy', text: L('Opening secure payment…', 'సురక్షిత చెల్లింపు తెరుస్తోంది…') })
    const out = await paySubscription(s, () => setPhase({ kind: 'busy', text: L('Confirming your payment…', 'మీ చెల్లింపు ధృవీకరిస్తోంది…') }))
    await load()
    if (out.kind === 'active') setPhase({ kind: 'done', subscriptionId: out.subscriptionId })
    else if (out.kind === 'unpaid') setPhase({ kind: 'error', text: L('Payment was not completed. No money was taken — you can try again.', 'చెల్లింపు పూర్తి కాలేదు. డబ్బు తీసుకోలేదు — మళ్లీ ప్రయత్నించవచ్చు.') })
    else if (out.kind === 'processing') setPhase({ kind: 'error', text: L('Your bank is still confirming. If money was taken, your plan starts by itself within a few minutes — please check back.', 'మీ బ్యాంక్ ఇంకా ధృవీకరిస్తోంది. డబ్బు తీసుకుంటే, కొన్ని నిమిషాల్లో మీ ప్లాన్ దానంతటదే మొదలవుతుంది — మళ్లీ చూడండి.') })
    else setPhase({ kind: 'error', text: out.error })
  }

  if (state === 'notAggregator') {
    return (
      <main className="min-h-screen bg-[#f7f4ec] px-4 py-16 text-center text-[#1d2a20]">
        <p className="brand-wordmark text-2xl font-bold">{L('Plans are for aggregators', 'ప్లాన్లు అగ్రిగేటర్ల కోసం')}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-black/65">{L('Farmers never pay — your account is free, always.', 'రైతులు ఎప్పుడూ చెల్లించరు — మీ ఖాతా ఎప్పటికీ ఉచితం.')}</p>
        <Link href="/aggregator/login?next=/aggregator/subscription" className="mt-6 inline-flex min-h-[48px] items-center rounded-xl px-5 font-bold text-white" style={{ background: SLATE }}>
          {L('Log in as aggregator', 'అగ్రిగేటర్‌గా లాగిన్')}
        </Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f7f4ec] pb-24 text-[#1d2a20]">
      <header className="px-4 pb-8 pt-4 text-white" style={{ background: SLATE }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <BackButton fallback="/aggregator/dashboard" className="!text-white/80" />
          <LanguageToggle size="sm" />
        </div>
        <div className="mx-auto mt-5 max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">{L('Aggregator', 'అగ్రిగేటర్')}</p>
          <h1 className="brand-wordmark mt-1 text-3xl font-bold">{L('Your plan', 'మీ ప్లాన్')}</h1>
        </div>
      </header>

      <div className="mx-auto -mt-4 max-w-3xl space-y-8 px-4">
        {state === 'loading' ? (
          <div className="h-32 animate-pulse rounded-2xl bg-white" />
        ) : state === 'off' ? (
          <div className="rounded-2xl bg-white p-5 text-sm ring-1 ring-black/10">{L('Plans are not open yet. Please check back soon.', 'ప్లాన్లు ఇంకా మొదలవలేదు. త్వరలో మళ్లీ చూడండి.')}</div>
        ) : (
          <>
            {/* Where they stand */}
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/10" aria-label={L('Plan status', 'ప్లాన్ స్థితి')}>
              <div className="flex flex-wrap gap-2">
                <Unlock on={access.buying} label={L('Buying', 'కొనుగోలు')} />
                <Unlock on={access.selling} label={L('Selling', 'అమ్మకం')} />
              </div>
              <p className="mt-3 text-[15px] font-bold leading-snug">
                {standing.state === 'forever' && L('Free forever — nothing to pay.', 'ఎప్పటికీ ఉచితం — చెల్లించాల్సింది ఏమీ లేదు.')}
                {standing.state === 'active' && L(`Active until ${fmt(standing.endsAt)} · ${standing.daysLeft} days left`, `${fmt(standing.endsAt)} వరకు · ${standing.daysLeft} రోజులు మిగిలాయి`)}
                {standing.state === 'none' && L('You have no plan yet. Choose one below.', 'మీకు ఇంకా ప్లాన్ లేదు. కింద ఒకటి ఎంచుకోండి.')}
              </p>
              <Link href="/aggregator/market" className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: SLATE }}>
                <Icon name="box" className="h-4 w-4" /> {L('Open the bulk market', 'బల్క్ మార్కెట్ తెరవండి')} <Icon name="arrow" className="h-4 w-4" />
              </Link>
              {standing.state === 'ending' && (
                <p className="mt-3 border-l-4 border-[#d99a1e] bg-[#fdf4df] px-3 py-2 text-sm font-bold text-[#6b4a07]">
                  {L(`Your plan ends on ${fmt(standing.endsAt)} (${standing.daysLeft} days). Renew below to keep going.`, `మీ ప్లాన్ ${fmt(standing.endsAt)}న ముగుస్తుంది (${standing.daysLeft} రోజులు). కొనసాగించడానికి కింద రీన్యూ చేయండి.`)}
                </p>
              )}
              {standing.state === 'expired' && (
                <p className="mt-3 border-l-4 border-[#b4532a] bg-[#f8e7de] px-3 py-2 text-sm font-bold text-[#6e2c12]">
                  {L(`Your plan ended on ${fmt(standing.endedAt)}. Your listings stay visible for 10 days after a plan ends — renew to keep them up.`, `మీ ప్లాన్ ${fmt(standing.endedAt)}న ముగిసింది. ప్లాన్ ముగిసాక 10 రోజులు మీ లిస్టింగ్‌లు కనిపిస్తాయి — కొనసాగించడానికి రీన్యూ చేయండి.`)}
                </p>
              )}
            </section>

            {/* What happened just now */}
            {phase.kind === 'busy' && (
              <p role="status" className="flex items-center gap-3 rounded-2xl bg-white p-4 text-sm font-bold ring-1 ring-black/10">
                <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-[#27486a] border-t-transparent" /> {phase.text}
              </p>
            )}
            {phase.kind === 'error' && <p role="alert" className="rounded-2xl bg-[#f8e7de] p-4 text-sm font-bold text-[#6e2c12]">{phase.text}</p>}
            {phase.kind === 'done' && (
              <div role="status" className="rounded-2xl bg-[#e7f0e9] p-4 text-sm text-[#1f4a35]">
                <p className="font-bold">{L('Your plan is active. Thank you!', 'మీ ప్లాన్ ప్రారంభమైంది. ధన్యవాదాలు!')}</p>
                <Link href={`/aggregator/subscription/receipt/${phase.subscriptionId}`} className="mt-2 inline-flex items-center gap-1.5 font-bold underline">
                  <Icon name="receipt" className="h-4 w-4" /> {L('View receipt', 'రసీదు చూడండి')}
                </Link>
              </div>
            )}

            {/* Plans */}
            <section aria-labelledby="plans">
              <h2 id="plans" className="brand-wordmark text-2xl font-bold">{L('Choose a plan', 'ప్లాన్ ఎంచుకోండి')}</h2>
              {list.length === 0 ? (
                <p className="mt-3 rounded-2xl bg-white p-5 text-sm ring-1 ring-black/10">{L('No plans are on offer right now.', 'ప్రస్తుతం ప్లాన్లు అందుబాటులో లేవు.')}</p>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {list.map((p) => {
                    const price = planPrice(p, now)
                    const coverForever = isPlanKind(p.kind) && currentCoverEnd(subs, p.kind as PlanKind, now).forever
                    return (
                      <PlanCard
                        key={p.id}
                        plan={p}
                        lang={lg}
                        now={now}
                        footer={
                          coverForever ? (
                            <p className="rounded-xl bg-[#e7f0e9] px-3 py-3 text-center text-sm font-bold text-[#1f4a35]">{L('Included free for you', 'మీకు ఉచితంగా ఉంది')}</p>
                          ) : (
                            <button
                              type="button"
                              disabled={phase.kind === 'busy'}
                              onClick={() => choose(p)}
                              className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-white disabled:opacity-50"
                              style={{ background: SLATE }}
                            >
                              {price.free ? L('Start free plan', 'ఉచిత ప్లాన్ మొదలుపెట్టండి') : L(`Pay ${inr(price.price)} & start`, `${inr(price.price)} చెల్లించి మొదలుపెట్టండి`)}
                            </button>
                          )
                        }
                      />
                    )
                  })}
                </div>
              )}
              <p className="mt-3 text-xs leading-relaxed text-black/55">
                {L('Paid securely through Cashfree (UPI, cards, net banking). No refunds or part payments. We remind you on WhatsApp 3 days before a plan ends — nothing is charged automatically.', 'క్యాష్‌ఫ్రీ ద్వారా సురక్షితంగా చెల్లించండి (UPI, కార్డులు, నెట్ బ్యాంకింగ్). రీఫండ్‌లు, పాక్షిక చెల్లింపులు లేవు. ప్లాన్ ముగియడానికి 3 రోజుల ముందు వాట్సాప్‌లో గుర్తుచేస్తాం — ఆటోమేటిక్‌గా ఏమీ వసూలు చేయం.')}
              </p>
            </section>

            {/* History */}
            {subs.filter((s) => s.status !== 'pending').length > 0 && (
              <section aria-labelledby="history">
                <h2 id="history" className="brand-wordmark text-2xl font-bold">{L('Your plans', 'మీ ప్లాన్లు')}</h2>
                <ul className="mt-3 divide-y divide-black/10 rounded-2xl bg-white ring-1 ring-black/10">
                  {subs.filter((s) => s.status !== 'pending').map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="min-w-0 text-sm">
                        <span className="block font-bold">{s.plan_name || (isPlanKind(s.kind) ? PLAN_KIND_LABELS[s.kind][lg] : s.kind)}</span>
                        <span className="block text-xs text-black/60">
                          {s.ends_at ? `${fmt(s.starts_at)} – ${fmt(s.ends_at)}` : L('No end date', 'ముగింపు లేదు')}
                          {s.status === 'cancelled' ? ` · ${L('Switched off', 'ఆపివేయబడింది')}` : ''}
                          {Number(s.amount_paid) > 0 ? ` · ${inr(Number(s.amount_paid))}` : ''}
                        </span>
                      </span>
                      {hasReceipt({ source: s.source, status: s.status, receipt_no: s.receipt_no ?? null }) && (
                        <Link href={`/aggregator/subscription/receipt/${s.id}`} className="flex shrink-0 items-center gap-1 text-sm font-bold" style={{ color: SLATE }}>
                          <Icon name="receipt" className="h-4 w-4" /> {L('Receipt', 'రసీదు')}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {/* Start now, or after the current plan? */}
      {ask && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setAsk(null)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-t-3xl bg-white p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="brand-wordmark text-xl font-bold">{L('When should it start?', 'ఎప్పటి నుండి మొదలవ్వాలి?')}</h2>
            <p className="mt-1 text-sm text-black/65">
              {L(`You already have this until ${fmt(ask.currentEnd)}.`, `మీకు ఇది ఇప్పటికే ${fmt(ask.currentEnd)} వరకు ఉంది.`)}
            </p>
            <div className="mt-4 space-y-2">
              <button type="button" onClick={() => void buy(ask.plan, 'after_current')} className="w-full rounded-xl border-2 p-4 text-left" style={{ borderColor: SLATE }}>
                <span className="block font-bold">{L(`After my current plan (from ${fmt(ask.currentEnd)})`, `ప్రస్తుత ప్లాన్ తర్వాత (${fmt(ask.currentEnd)} నుండి)`)}</span>
                <span className="block text-xs text-black/60">{L('You keep every day you have already paid for.', 'మీరు చెల్లించిన ప్రతి రోజూ మీకే.')}</span>
              </button>
              <button type="button" onClick={() => void buy(ask.plan, 'now')} className="w-full rounded-xl border-2 border-black/15 p-4 text-left">
                <span className="block font-bold">{L('Start now at the full price', 'పూర్తి ధరతో ఇప్పుడే మొదలుపెట్టండి')}</span>
                <span className="block text-xs text-black/60">{L('The days left on your current plan are not refunded.', 'ప్రస్తుత ప్లాన్‌లో మిగిలిన రోజులకు రీఫండ్ ఉండదు.')}</span>
              </button>
            </div>
            <button type="button" onClick={() => setAsk(null)} className="mt-3 min-h-[44px] w-full text-sm font-bold text-black/60">{L('Cancel', 'రద్దు')}</button>
          </div>
        </div>
      )}
    </main>
  )
}

function Unlock({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-bold ${on ? 'bg-[#e7f0e9] text-[#1f4a35]' : 'bg-black/5 text-black/45'}`}>
      <Icon name={on ? 'check' : 'lock'} className="h-4 w-4" strokeWidth={on ? 2.4 : 1.8} /> {label}
    </span>
  )
}

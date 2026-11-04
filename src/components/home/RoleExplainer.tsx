'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useLang } from '@/lib/LanguageContext'
import LanguageToggle from '@/components/LanguageToggle'
import BackButton from '@/components/BackButton'
import type { Pair, RoleContent } from '@/lib/roleContent'

/* The layout of a role explainer page (/home/farmer, /home/aggregator): what
 * the role is, its benefits, how it works, features, short terms, common
 * questions and the next step — the "introduction first, then login" rule of
 * the 2026-11-04 model. Content comes in as data (both languages), so each
 * page is just its words; an optional slot carries the aggregator's live plans.
 * Built for a 390px phone first: one column, big tap targets, no animation
 * that costs anything on 4G. */

export default function RoleExplainer({ content, children }: { content: RoleContent; children?: ReactNode }) {
  const { L } = useLang()
  const t = (p: Pair) => L(p[0], p[1])
  const c = content

  // Both places these sit are dark green, so: lime for the main step, an
  // outline for the other.
  const Ctas = ({ className = '' }: { className?: string }) => (
    <div className={`flex flex-col gap-2 sm:flex-row ${className}`}>
      {c.ctas.map((x) => (
        <Link
          key={x.href}
          href={x.href}
          className={`flex min-h-[52px] flex-1 items-center justify-center rounded-2xl px-5 text-center text-base font-extrabold ${
            x.primary ? 'bg-lime-300 text-green-950 shadow-lg active:bg-lime-400' : 'border-2 border-white/80 text-white active:bg-white/10'
          }`}
        >
          {t(x.label)}
        </Link>
      ))}
    </div>
  )

  return (
    <main className="min-h-screen bg-[#f6f9f0] pb-16 text-green-950">
      <header className="bg-green-900 px-4 pb-10 pt-5 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <BackButton fallback="/home" className="!text-green-200" />
          <LanguageToggle size="sm" />
        </div>
        <div className="mx-auto mt-6 max-w-3xl">
          <span className="inline-flex rounded-full bg-lime-300 px-3 py-1 text-xs font-black text-green-950">{t(c.badge)}</span>
          <h1 className="mt-3 text-3xl font-black leading-tight sm:text-5xl">{t(c.title)}</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-green-100">{t(c.intro)}</p>
          <Ctas className="mt-6" />
        </div>
      </header>

      <div className="mx-auto -mt-5 max-w-3xl space-y-8 px-4">
        {/* Benefits */}
        <section aria-labelledby="benefits" className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 id="benefits" className="text-xl font-black">{L('What you get', 'మీకు లభించేవి')}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {c.benefits.map((b) => (
              <div key={b.title[0]} className="flex gap-3 rounded-2xl border border-green-900/10 p-3">
                <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime-100 text-xl">{b.icon}</span>
                <span className="min-w-0">
                  <span className="block font-extrabold leading-tight">{t(b.title)}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-green-900/70">{t(b.body)}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Plans or anything else the page adds */}
        {children}

        {/* How it works */}
        <section aria-labelledby="how">
          <h2 id="how" className="text-xl font-black">{L('How it works', 'ఎలా పనిచేస్తుంది')}</h2>
          <ol className="mt-4 space-y-3">
            {c.steps.map((s, i) => (
              <li key={s.title[0]} className="flex gap-3 rounded-2xl bg-white p-4 shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-800 text-sm font-black text-white">{i + 1}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-extrabold leading-tight">
                    {t(s.title)}
                    {s.soon && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">{L('Opening soon', 'త్వరలో')}</span>}
                  </span>
                  <span className="mt-0.5 block text-sm leading-snug text-green-900/70">{t(s.body)}</span>
                </span>
              </li>
            ))}
          </ol>
          {c.stepsNote && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{t(c.stepsNote)}</p>}
        </section>

        {/* Features */}
        {c.features && c.features.length > 0 && (
          <section aria-labelledby="features" className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 id="features" className="text-xl font-black">{L('Features', 'సౌకర్యాలు')}</h2>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {c.features.map((f) => (
                <li key={f[0]} className="flex gap-2 text-sm leading-snug">
                  <span aria-hidden className="font-black text-green-600">✓</span>
                  <span>{t(f)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Terms */}
        <section aria-labelledby="terms" className="rounded-3xl border-2 border-green-900/10 bg-white p-5">
          <h2 id="terms" className="text-xl font-black">{L('Good to know (terms)', 'తెలుసుకోవాల్సినవి (నిబంధనలు)')}</h2>
          <ul className="mt-3 space-y-2">
            {c.terms.map((x) => (
              <li key={x[0]} className="flex gap-2 text-sm leading-snug">
                <span aria-hidden className="text-green-700">•</span>
                <span>{t(x)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Common questions — <details>, so it works before the page hydrates. */}
        <section aria-labelledby="faq">
          <h2 id="faq" className="text-xl font-black">{L('Common questions', 'సాధారణ ప్రశ్నలు')}</h2>
          <div className="mt-3 space-y-2">
            {c.faqs.map((f) => (
              <details key={f.q[0]} className="group rounded-2xl bg-white p-4 shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-extrabold">
                  {t(f.q)}
                  <span aria-hidden className="text-green-700 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-green-900/75">{t(f.a)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-green-900 p-6 text-center text-white">
          <h2 className="text-2xl font-black">{L('Ready to start?', 'మొదలుపెడదామా?')}</h2>
          <Ctas className="mt-4" />
          <Link href="/home" className="mt-4 inline-block text-sm font-bold text-green-200 underline">
            {L('Back to all choices', 'అన్ని ఎంపికలకు తిరిగి')}
          </Link>
        </section>
      </div>
    </main>
  )
}

'use client'

import Link from 'next/link'
import Image from 'next/image'
import type { CSSProperties, ReactNode } from 'react'
import { useLang } from '@/lib/LanguageContext'
import LanguageToggle from '@/components/LanguageToggle'
import BackButton from '@/components/BackButton'
import Icon from '@/components/home/Icon'
import { ROLE_ACCENT, type Pair, type RoleContent } from '@/lib/roleContent'

/* The layout of a role explainer page (/home/consumer, /home/farmer,
 * /home/aggregator): what the role is, three facts at a glance, benefits, how
 * it works, features, terms, questions and the next step — "introduction
 * first, then login" (model agreed 2026-11-04).
 *
 * Design: a paper-coloured page, one accent colour per role (leaf / soil /
 * slate) used sparingly, real farm photos, line icons, and turmeric kept for
 * prices and offers only — so an offer is the loudest thing on the page.
 * Mobile first (390px): one column, 48px+ tap targets, and the main button
 * stays reachable in a bar at the bottom of the screen. */

type Shot = { id: string; name: string; image_url: string }

export default function RoleExplainer({
  content,
  photos = [],
  children,
  banner,
}: {
  content: RoleContent
  photos?: Shot[]
  /** Plans, or anything else the page adds — shown before the benefits. */
  children?: ReactNode
  /** A highlight right under the heading (the aggregator's subscription, 2026-11-05). */
  banner?: ReactNode
}) {
  const { L } = useLang()
  const t = (p: Pair) => L(p[0], p[1])
  const c = content
  const accent = ROLE_ACCENT[c.role]
  const primary = c.ctas.find((x) => x.primary) ?? c.ctas[0]
  const style = { '--ink': accent.ink, '--tint': accent.tint } as CSSProperties

  return (
    <main style={style} className="min-h-screen bg-[#f7f4ec] pb-28 text-[#1d2a20] sm:pb-16">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <header className="relative overflow-hidden bg-[var(--ink)] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-4">
          <BackButton fallback="/home" className="!text-white/80" />
          <LanguageToggle size="sm" />
        </div>
        <div className="mx-auto grid max-w-5xl gap-6 px-4 pb-6 pt-6 md:grid-cols-[1.15fr_.85fr] md:items-end">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
              Go Grameen · {t(accent.label)}
            </p>
            <h1 className="brand-wordmark mt-3 text-[2rem] font-bold leading-[1.1] sm:text-5xl">{t(c.title)}</h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/85">{t(c.intro)}</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {c.ctas.map((x) => (
                <Link
                  key={x.href}
                  href={x.href}
                  className={`flex min-h-[50px] items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-bold transition ${
                    x.primary ? 'bg-white text-[var(--ink)] active:bg-white/90' : 'border border-white/50 text-white active:bg-white/10'
                  }`}
                >
                  {t(x.label)}
                  {x.primary && <Icon name="arrow" className="h-4 w-4" />}
                </Link>
              ))}
            </div>
          </div>
          {photos.length >= 3 && (
            <div className="grid grid-cols-3 gap-2 md:grid-cols-2" aria-hidden>
              {photos.slice(0, 4).map((p, i) => (
                <div key={p.id} className={`relative aspect-[4/5] overflow-hidden rounded-lg ring-1 ring-white/15 ${i === 3 ? 'hidden md:block' : ''}`}>
                  <Image src={p.image_url} alt="" fill sizes="(max-width: 768px) 30vw, 200px" className="object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="mx-auto max-w-5xl px-4 pb-5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold ring-1 ring-white/25">
            <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.4} /> {t(c.badge)}
          </span>
        </p>
      </header>

      {banner && <div className="mx-auto -mt-2 max-w-5xl px-4 pb-4">{banner}</div>}

      {/* ── At a glance ──────────────────────────────────────── */}
      <section aria-label={L('At a glance', 'ఒక్క చూపులో')} className="border-b border-black/10 bg-white">
        <dl className="mx-auto grid max-w-5xl grid-cols-3 divide-x divide-black/10">
          {c.glance.map((g) => (
            <div key={g.value[0] + g.label[0]} className="px-3 py-4 sm:px-6">
              <dt className="sr-only">{t(g.label)}</dt>
              <dd>
                <span className="brand-wordmark block text-2xl font-bold leading-none text-[var(--ink)] sm:text-3xl">{t(g.value)}</span>
                <span className="mt-1.5 block text-[12px] leading-snug text-black/60 sm:text-sm">{t(g.label)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mx-auto max-w-5xl space-y-12 px-4 pt-10">
        {/* Plans, or anything else the page adds — moved above the benefits
            (client, 2026-11-05: the subscription must be seen first). */}
        {children}

        {/* ── Benefits ─────────────────────────────────────── */}
        <section aria-labelledby="benefits">
          <SectionTitle id="benefits" kicker={L('Why join', 'ఎందుకు చేరాలి')}>{L('What you get', 'మీకు లభించేవి')}</SectionTitle>
          <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
            {c.benefits.map((b) => (
              <li key={b.title[0]} className="flex gap-3.5">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--tint)] text-[var(--ink)]">
                  <Icon name={b.icon} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold leading-tight">{t(b.title)}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-black/65">{t(b.body)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>


        {/* ── How it works ─────────────────────────────────── */}
        <section aria-labelledby="how">
          <SectionTitle id="how" kicker={L('Step by step', 'దశలవారీగా')}>{L('How it works', 'ఎలా పనిచేస్తుంది')}</SectionTitle>
          <ol className="relative mt-6 space-y-6 before:absolute before:bottom-3 before:left-[17px] before:top-3 before:w-px before:bg-black/15">
            {c.steps.map((s, i) => (
              <li key={s.title[0]} className="relative flex gap-4">
                <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--ink)] bg-[#f7f4ec] text-sm font-bold text-[var(--ink)]">
                  {i + 1}
                </span>
                <span className="min-w-0 pt-1">
                  <span className="flex flex-wrap items-center gap-2 text-[15px] font-bold leading-tight">
                    {t(s.title)}
                    {s.soon && (
                      <span className="rounded-md bg-black/5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black/55">{L('Opening soon', 'త్వరలో')}</span>
                    )}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-black/65">{t(s.body)}</span>
                </span>
              </li>
            ))}
          </ol>
          {c.stepsNote && (
            <p className="mt-5 border-l-4 border-[#d99a1e] bg-[#fdf4df] px-4 py-3 text-sm font-medium text-[#6b4a07]">{t(c.stepsNote)}</p>
          )}
        </section>

        {/* ── Features ─────────────────────────────────────── */}
        {c.features && c.features.length > 0 && (
          <section aria-labelledby="features">
            <SectionTitle id="features" kicker={L('In the app', 'యాప్‌లో')}>{L('Features', 'సౌకర్యాలు')}</SectionTitle>
            <ul className="mt-4 grid grid-cols-1 border-t border-black/10 sm:grid-cols-2 sm:gap-x-8">
              {c.features.map((f) => (
                <li key={f[0]} className="flex gap-3 border-b border-black/10 py-3 text-sm leading-snug">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink)]" strokeWidth={2.4} />
                  <span>{t(f)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Terms ────────────────────────────────────────── */}
        <section aria-labelledby="terms" className="rounded-2xl bg-white p-5 ring-1 ring-black/10 sm:p-7">
          <SectionTitle id="terms" kicker={L('Plain and simple', 'సూటిగా, సులభంగా')}>{L('Terms', 'నిబంధనలు')}</SectionTitle>
          <ol className="mt-4 space-y-3">
            {c.terms.map((x, i) => (
              <li key={x[0]} className="flex gap-3 text-sm leading-relaxed">
                <span className="w-5 shrink-0 text-right font-bold tabular-nums text-[var(--ink)]">{i + 1}.</span>
                <span>{t(x)}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Questions — <details>, so it works before hydration ── */}
        <section aria-labelledby="faq">
          <SectionTitle id="faq" kicker={L('Asked often', 'తరచుగా అడిగేవి')}>{L('Common questions', 'సాధారణ ప్రశ్నలు')}</SectionTitle>
          <div className="mt-4 divide-y divide-black/10 border-y border-black/10">
            {c.faqs.map((f) => (
              <details key={f.q[0]} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-bold">
                  {t(f.q)}
                  <span aria-hidden className="text-xl leading-none text-[var(--ink)] transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-black/70">{t(f.a)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-[var(--ink)] px-5 py-8 text-center text-white">
          <h2 className="brand-wordmark text-2xl font-bold">{L('Ready to start?', 'మొదలుపెడదామా?')}</h2>
          <div className="mx-auto mt-5 flex max-w-md flex-col gap-2">
            {c.ctas.map((x) => (
              <Link
                key={x.href}
                href={x.href}
                className={`flex min-h-[50px] items-center justify-center rounded-xl px-5 text-[15px] font-bold ${
                  x.primary ? 'bg-white text-[var(--ink)]' : 'border border-white/50 text-white'
                }`}
              >
                {t(x.label)}
              </Link>
            ))}
          </div>
          <Link href="/home" className="mt-5 inline-block text-sm font-semibold text-white/75 underline underline-offset-4">
            {L('See the other ways to use Go Grameen', 'గో గ్రామీణ్‌ను వాడే ఇతర దారులు చూడండి')}
          </Link>
        </section>
      </div>

      {/* The main step, always one thumb away on a phone. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/10 bg-white/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur sm:hidden">
        <Link href={primary.href} className="flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-[var(--ink)] text-[15px] font-bold text-white">
          {t(primary.label)} <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </div>
    </main>
  )
}

export function SectionTitle({ id, kicker, children }: { id: string; kicker: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ink)]">{kicker}</p>
      <h2 id={id} className="brand-wordmark mt-1 text-2xl font-bold leading-tight sm:text-3xl">{children}</h2>
    </div>
  )
}

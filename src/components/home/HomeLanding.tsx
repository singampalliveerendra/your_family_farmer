'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useLang } from '@/lib/LanguageContext'
import { SproutMark } from '@/components/BrandLogo'
import LanguageToggle from '@/components/LanguageToggle'
import HomeInstallCta from '@/components/home/HomeInstallCta'
import RoleSelect from '@/components/home/RoleSelect'

/* The body of /home.
 *
 * A client island rather than part of the server page, because the landing page
 * carries the language chooser: the visitor picks English or Telugu here,
 * BEFORE they continue into the app, so every word on this page has to switch
 * with the toggle. The install CTA and the role list were already client
 * components for the same reason.
 *
 * It still server-renders — this is SSR + hydration, not client-only fetching —
 * so the first paint and the 10-minute cache in page.tsx are unaffected. Only
 * the photos come from the server, as props. */

type Shot = { id: string; name: string; image_url: string }

// [English, తెలుగు] throughout, matching RoleSelect.
type Pair = [string, string]

const FEATURES: { icon: string; title: Pair; body: Pair }[] = [
  {
    icon: '🌾',
    title: ['Straight from the farm', 'నేరుగా పొలం నుండి'],
    body: [
      'You buy from the grower. Nobody stands in between taking a cut.',
      'పండించిన రైతు నుండే మీరు కొంటారు. మధ్యలో ఎవరూ కమీషన్ తీసుకోరు.',
    ],
  },
  {
    icon: '⏱️',
    title: ['Harvested-today clock', 'నేటి కోత గడియారం'],
    body: [
      'Every listing shows when it was actually picked. Freshness you can check, not a claim.',
      'ప్రతి ఉత్పత్తికి కోసిన సమయం కనిపిస్తుంది. తాజాదనం అనేది మాట కాదు — మీరే చూడొచ్చు.',
    ],
  },
  {
    icon: '🧑‍🌾',
    title: ['The farmer is named', 'రైతు పేరు కనిపిస్తుంది'],
    body: [
      'Even when an aggregator sells it, the grower’s name travels with the produce.',
      'అగ్రిగేటర్ అమ్మినా, పండించిన రైతు పేరు ఉత్పత్తితో పాటే వస్తుంది.',
    ],
  },
  {
    icon: '🚙',
    title: ['Pickup or delivery', 'మీరే తీసుకెళ్లండి లేదా డెలివరీ'],
    body: [
      'Collect from the farm, or have a local rider bring it to your door.',
      'పొలం నుండి తీసుకోండి, లేదా స్థానిక రైడర్ మీ ఇంటికి తెస్తారు.',
    ],
  },
  {
    icon: '🔒',
    title: ['Pay securely', 'సురక్షితమైన చెల్లింపు'],
    body: [
      'UPI and cards through Razorpay. Refunds handled automatically if an order is declined.',
      'రేజర్‌పే ద్వారా UPI, కార్డులు. ఆర్డర్ తిరస్కరిస్తే రీఫండ్ ఆటోమేటిక్‌గా వస్తుంది.',
    ],
  },
  {
    icon: '🗣️',
    title: ['English & తెలుగు', 'English & తెలుగు'],
    body: [
      'The whole app switches language in one tap.',
      'ఒక్క ట్యాప్‌తో యాప్ మొత్తం భాష మారుతుంది.',
    ],
  },
]

const STEPS: { n: string; title: Pair; body: Pair }[] = [
  {
    n: '01',
    title: ['Install in one tap', 'ఒక్క ట్యాప్‌లో ఇన్‌స్టాల్'],
    body: [
      'No Play Store, no 50 MB download. It installs from the browser in seconds.',
      'ప్లే స్టోర్ అవసరం లేదు, 50 MB డౌన్‌లోడ్ లేదు. బ్రౌజర్ నుండే సెకన్లలో ఇన్‌స్టాల్ అవుతుంది.',
    ],
  },
  {
    n: '02',
    title: ['See today’s harvest', 'నేటి కోత చూడండి'],
    body: [
      'Real produce, real farms near you, with the picking time on every card.',
      'మీ దగ్గరి నిజమైన పొలాలు, నిజమైన ఉత్పత్తులు — ప్రతి కార్డుపై కోసిన సమయం.',
    ],
  },
  {
    n: '03',
    title: ['Order direct', 'నేరుగా ఆర్డర్ చేయండి'],
    body: [
      'Pick up from the farm or get it delivered. The farmer gets paid, not a middleman.',
      'పొలం నుండి తీసుకోండి లేదా డెలివరీ పొందండి. డబ్బు రైతుకు చేరుతుంది, మధ్యవర్తికి కాదు.',
    ],
  },
]

export default function HomeLanding({
  shots,
  installs,
}: {
  shots: Shot[]
  /** Devices that have installed the app — the badge beside Download. */
  installs: number | null
}) {
  const { L } = useLang()

  return (
    <main className="gghome relative min-h-screen overflow-x-hidden bg-[#04140b] text-white">
      {/* Scoped to .gghome and prefixed, so nothing here can reach any other
          page's styles. Keyframes only — layout stays in Tailwind. */}
      <style>{`
        @keyframes gghome-rise { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: none } }
        @keyframes gghome-float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-16px) } }
        @keyframes gghome-drift { 0%, 100% { transform: translate(0, 0) scale(1) } 50% { transform: translate(4%, -6%) scale(1.12) } }
        @keyframes gghome-sheen { from { background-position: 0% 50% } to { background-position: 200% 50% } }
        .gghome-rise  { animation: gghome-rise .7s cubic-bezier(.2,.7,.3,1) both }
        .gghome-float { animation: gghome-float 7s ease-in-out infinite }
        .gghome-blob  { animation: gghome-drift 18s ease-in-out infinite }
        .gghome-grad  {
          background: linear-gradient(100deg, #d9f99d, #4ade80, #a3e635, #d9f99d);
          background-size: 200% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: gghome-sheen 7s linear infinite;
        }
        .gghome-card { transition: transform .25s ease, border-color .25s ease, background-color .25s ease }
        .gghome-card:hover { transform: translateY(-3px) }
        .gghome-grid {
          background-image:
            linear-gradient(rgba(163,230,53,.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(163,230,53,.07) 1px, transparent 1px);
          background-size: 46px 46px;
          mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%);
        }
        /* Anyone who has asked the OS for less motion gets a still page. */
        @media (prefers-reduced-motion: reduce) {
          .gghome-rise, .gghome-float, .gghome-blob, .gghome-grad { animation: none !important }
          .gghome-card:hover { transform: none }
        }
      `}</style>

      {/* ── Ambient background ─────────────────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="gghome-grid absolute inset-x-0 top-0 h-[70vh]" />
        <div className="gghome-blob absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="gghome-blob absolute -right-20 top-40 h-96 w-96 rounded-full bg-lime-400/15 blur-3xl" style={{ animationDelay: '3s' }} />
        <div className="gghome-blob absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-teal-400/10 blur-3xl" style={{ animationDelay: '6s' }} />
      </div>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        {/* min-w-0 + truncate: at 390px the wordmark gives way before the
            Download pill does, so the CTA can never be pushed off-screen. */}
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-green-500 to-green-700 ring-1 ring-white/15">
            <SproutMark className="h-5 w-5 text-[#f4f7ec]" />
          </span>
          <span className="brand-wordmark truncate text-[15px] font-bold leading-none">Go Grameen</span>
        </div>
        {/* Download is what the page is for, so it takes the loud pill up here
            too. "Open the app" drops to a quiet secondary link and hides below
            sm, so the row still fits at 390px — which is also why the language
            toggle runs at its `sm` size here. */}
        <div className="flex shrink-0 items-center gap-2">
          <LanguageToggle size="sm" />
          <Link
            href="/consumer"
            className="hidden rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-lime-100 backdrop-blur-sm transition hover:border-lime-300/50 hover:text-white sm:inline-flex"
          >
            {L('Open the app →', 'యాప్ తెరవండి →')}
          </Link>
          <HomeInstallCta size="compact" />
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pt-10 pb-16 sm:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <span className="gghome-rise inline-flex items-center gap-2 rounded-full border border-lime-300/25 bg-lime-300/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-lime-200">
              <span className="h-1.5 w-1.5 rounded-full bg-lime-300" />
              {L('Farm direct · Harvested today', 'నేరుగా పొలం నుండి · నేడే కోత')}
            </span>

            <h1 className="gghome-rise brand-wordmark mt-5 text-4xl font-bold leading-[1.05] sm:text-6xl" style={{ animationDelay: '.08s' }}>
              {L('Real food.', 'నిజమైన ఆహారం.')}
              <br />
              {L('Real farmers.', 'నిజమైన రైతులు.')}
              <br />
              <span className="gghome-grad">{L('No middlemen.', 'మధ్యవర్తులు లేరు.')}</span>
            </h1>

            <p className="gghome-rise mt-5 max-w-md text-base leading-relaxed text-lime-100/70 sm:text-lg" style={{ animationDelay: '.16s' }}>
              {L(
                'Go Grameen connects farmers directly to consumers.',
                'గో గ్రామీణ్ రైతులను నేరుగా వినియోగదారులతో కలుపుతుంది.',
              )}{' '}
              {L(
                'Harvested today, priced by the farmer, delivered to you.',
                'నేడే కోత, ధర రైతుదే, నేరుగా మీ ఇంటికి.',
              )}
            </p>

            <div className="gghome-rise mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center" style={{ animationDelay: '.24s' }}>
              <HomeInstallCta count={installs} />
              <Link
                href="/consumer"
                className="w-full rounded-2xl border border-white/15 px-6 py-4 text-center text-sm font-bold text-white transition hover:border-lime-300/50 hover:bg-white/5 sm:w-auto"
              >
                {L('Browse today’s harvest', 'నేటి కోతలు చూడండి')}
              </Link>
            </div>
          </div>

          {/* Photo cluster — real listings, or nothing at all. */}
          {shots.length > 0 && (
            <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
              <div className="grid grid-cols-2 gap-3">
                {shots.slice(0, 4).map((s, i) => (
                  <div
                    key={s.id}
                    className={`gghome-float relative aspect-square overflow-hidden rounded-3xl border border-white/10 shadow-2xl ${i % 2 ? 'mt-6' : ''}`}
                    style={{ animationDelay: `${i * 0.9}s` }}
                  >
                    <Image
                      src={s.image_url}
                      alt={s.name}
                      fill
                      sizes="(max-width: 640px) 45vw, 22vw"
                      className="object-cover"
                      priority={i < 2}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2.5">
                      <p className="truncate text-[11px] font-bold text-white">{s.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Pull quote ─────────────────────────────────────────────── */}
      <section className="relative z-10 border-y border-white/10 bg-black/20 py-14 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <p className="brand-wordmark text-2xl font-bold leading-snug sm:text-4xl">
            {L('“The farmer sets the price.', '“ధరను రైతే నిర్ణయిస్తారు.')}
            <br className="hidden sm:block" />{' '}
            <span className="gghome-grad">
              {L('Nobody takes a cut in between.”', 'మధ్యలో ఎవరూ కమీషన్ తీసుకోరు.”')}
            </span>
          </p>
        </div>
      </section>

      {/* ── Who are you ────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-4xl px-4 py-16">
        <h2 className="brand-wordmark text-center text-2xl font-bold sm:text-3xl">
          {L('Where would you like to start?', 'మీరు ఎక్కడ మొదలుపెడతారు?')}
        </h2>
        <p className="mx-auto mt-2 mb-8 max-w-md text-center text-sm text-lime-100/60">
          {L('One app, three ways in. You can switch any time.', 'ఒకే యాప్, మూడు దారులు. ఎప్పుడైనా మారవచ్చు.')}
        </p>
        <RoleSelect />
      </section>

      {/* ── Features ───────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 py-16">
        <h2 className="brand-wordmark text-center text-2xl font-bold sm:text-3xl">
          {L('Built for how villages actually sell', 'గ్రామాలు నిజంగా అమ్మే విధానానికి తగ్గట్టు')}
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div
              key={f.title[0]}
              className="gghome-card gghome-rise rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm hover:border-lime-300/40"
              style={{ animationDelay: `${0.05 * i}s` }}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime-300/15 text-xl ring-1 ring-lime-300/25" aria-hidden>
                {f.icon}
              </span>
              <h3 className="mt-4 font-extrabold text-white">{L(f.title[0], f.title[1])}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-lime-100/60">{L(f.body[0], f.body[1])}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────── */}
      <section className="relative z-10 border-y border-white/10 bg-black/20 py-16 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="brand-wordmark text-center text-2xl font-bold sm:text-3xl">
            {L('Three taps to fresh food', 'మూడు ట్యాప్‌లలో తాజా ఆహారం')}
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-white/10 bg-white/5 p-6">
                <span className="brand-wordmark block text-4xl font-bold text-lime-300/30">{s.n}</span>
                <h3 className="mt-2 font-extrabold text-white">{L(s.title[0], s.title[1])}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-lime-100/60">{L(s.body[0], s.body[1])}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Harvest strip ──────────────────────────────────────────── */}
      {shots.length > 0 && (
        <section className="relative z-10 mx-auto max-w-6xl px-4 py-16">
          <h2 className="brand-wordmark text-center text-2xl font-bold sm:text-3xl">
            {L('On the app right now', 'ఇప్పుడు యాప్‌లో ఉన్నవి')}
          </h2>
          <p className="mt-2 text-center text-sm text-lime-100/60">
            {L('Real listings from real farms — not stock photos.', 'నిజమైన పొలాల నుండి నిజమైన ఉత్పత్తులు — స్టాక్ ఫోటోలు కాదు.')}
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {shots.map((s) => (
              <Link
                key={s.id}
                href="/consumer"
                className="gghome-card group relative aspect-square overflow-hidden rounded-2xl border border-white/10"
              >
                <Image
                  src={s.image_url}
                  alt={s.name}
                  fill
                  sizes="(max-width: 640px) 45vw, 16vw"
                  className="object-cover transition duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2">
                  <p className="truncate text-[11px] font-bold text-white">{s.name}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Closing CTA ────────────────────────────────────────────── */}
      {/* id is the target the header pill uses on iOS, where there is no
          install dialog and the manual steps have to be reachable. */}
      <section id="install" className="relative z-10 mx-auto max-w-4xl px-4 pb-20 scroll-mt-20">
        <div className="relative overflow-hidden rounded-3xl border border-lime-300/25 bg-gradient-to-br from-green-900/80 to-emerald-950/80 p-8 text-center backdrop-blur-sm sm:p-14">
          <div aria-hidden className="gghome-blob pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-lime-400/20 blur-3xl" />
          <SproutMark className="mx-auto h-10 w-10 text-lime-300" />
          {/* Telugu puts the verb last, so the sentence is split into three
              slots and the trailing one is empty in English. */}
          <h2 className="brand-wordmark mt-4 text-3xl font-bold leading-tight sm:text-4xl">
            {L('Put the farm', 'పొలాన్ని')}{' '}
            <span className="gghome-grad">{L('on your home screen', 'మీ హోమ్ స్క్రీన్‌లో')}</span>
            {L('', ' పెట్టుకోండి')}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-lime-100/70">
            {L(
              'No Play Store. No download. It installs straight from your browser and opens like any other app.',
              'ప్లే స్టోర్ అవసరం లేదు. డౌన్‌లోడ్ లేదు. బ్రౌజర్ నుండే ఇన్‌స్టాల్ అయి మిగతా యాప్‌ల లాగే తెరుచుకుంటుంది.',
            )}
          </p>
          <div className="mt-8 flex justify-center">
            <HomeInstallCta count={installs} />
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/10 px-4 py-10 text-center">
        <div className="mt-1 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-semibold text-lime-100/60">
          <Link href="/consumer" className="hover:text-lime-300">{L('Browse harvests', 'కోతలు చూడండి')}</Link>
          <Link href="/farmer/login" className="hover:text-lime-300">{L('Farmer login', 'రైతు లాగిన్')}</Link>
          <Link href="/aggregator/login" className="hover:text-lime-300">{L('Aggregator login', 'అగ్రిగేటర్ లాగిన్')}</Link>
        </div>

        {/* Contact. Real mailto:/tel: links, not plain text — on a phone the
            number has to be one tap to dial, which is the whole point of
            putting it here. */}
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <a
            href="mailto:gograameen@zohomail.in"
            className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-lime-100 transition hover:border-lime-300/50 hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
                 strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-lime-300" aria-hidden>
              <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
              <path d="m3 7 8.2 5.6a1.5 1.5 0 0 0 1.6 0L21 7" />
            </svg>
            gograameen@zohomail.in
          </a>

          <a
            href="tel:+917893074271"
            className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-lime-100 transition hover:border-lime-300/50 hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
                 strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-lime-300" aria-hidden>
              <path d="M6.2 3.5h3l1.5 4-2 1.4a12.5 12.5 0 0 0 6.4 6.4l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 4.2 5.7a2 2 0 0 1 2-2.2Z" />
            </svg>
            7893074271
          </a>
        </div>

        <p className="mt-7 text-xs text-lime-100/40">
          Go Grameen · Your Family Farmer
        </p>
      </footer>
    </main>
  )
}

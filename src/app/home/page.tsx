import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { SproutMark } from '@/components/BrandLogo'
import HomeInstallCta from '@/components/home/HomeInstallCta'
import RoleSelect from '@/components/home/RoleSelect'

/* /home — the public landing page.
 *
 * Deliberately a NEW route, not a change to `/`, which still redirects to
 * /consumer. Nothing that exists is rerouted, so no buyer, farmer or rider
 * flow moves. The page can be linked or QR'd for promotion on its own.
 *
 * Photography is the real catalogue out of Supabase Storage rather than stock
 * imagery: those are the actual farms, and next.config.ts only whitelists the
 * Supabase hosts for next/image anyway, so an external stock URL would 400.
 *
 * Server component: the copy and the photos are static enough to cache, so the
 * page ships almost no JS. Only the install CTA and the role list are client
 * islands, because they need the install prompt and the language toggle. */

export const metadata: Metadata = {
  title: 'Go Grameen — Natural harvests, straight from the farmer',
  description:
    'Buy natural harvests directly from the farmers who grow them. No middlemen, no Play Store — install Go Grameen straight from your browser.',
}

// Photos change only when the catalogue does; ten minutes keeps the landing
// page fast without going stale for a day.
export const revalidate = 600

type Shot = { id: string; name: string; image_url: string }

async function farmShots(limit = 6): Promise<Shot[]> {
  try {
    const { data } = await supabase
      .from('produce_listings')
      .select('id, name, image_url')
      .not('image_url', 'is', null)
      .in('status', ['available', 'sold_out'])
      .order('created_at', { ascending: false })
      .limit(limit)
    return ((data ?? []) as Shot[]).filter((r) => !!r.image_url)
  } catch {
    // A marketing page must never 500 because the catalogue hiccuped — the
    // photo sections simply don't render.
    return []
  }
}

const FEATURES: { icon: string; title: string; body: string }[] = [
  { icon: '🌾', title: 'Straight from the farm', body: 'You buy from the grower. Nobody stands in between taking a cut.' },
  { icon: '⏱️', title: 'Harvested-today clock', body: 'Every listing shows when it was actually picked. Freshness you can check, not a claim.' },
  { icon: '🧑‍🌾', title: 'The farmer is named', body: 'Even when an aggregator sells it, the grower’s name travels with the produce.' },
  { icon: '🚙', title: 'Pickup or delivery', body: 'Collect from the farm, or have a local rider bring it to your door.' },
  { icon: '🔒', title: 'Pay securely', body: 'UPI and cards through Razorpay. Refunds handled automatically if an order is declined.' },
  { icon: '🗣️', title: 'English & తెలుగు', body: 'The whole app switches language in one tap.' },
]

const STEPS: { n: string; title: string; body: string }[] = [
  { n: '01', title: 'Install in one tap', body: 'No Play Store, no 50 MB download. It installs from the browser in seconds.' },
  { n: '02', title: 'See today’s harvest', body: 'Real produce, real farms near you, with the picking time on every card.' },
  { n: '03', title: 'Order direct', body: 'Pick up from the farm or get it delivered. The farmer gets paid, not a middleman.' },
]

export default async function HomePage() {
  const shots = await farmShots(6)

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
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-gradient-to-br from-green-500 to-green-700 ring-1 ring-white/15">
            <SproutMark className="h-5 w-5 text-[#f4f7ec]" />
          </span>
          <span className="brand-wordmark text-[15px] font-bold leading-none">Go Grameen</span>
        </div>
        {/* Download is what the page is for, so it takes the loud pill up here
            too. "Open the app" drops to a quiet secondary link and hides below
            sm, so the row still fits at 390px. */}
        <div className="flex items-center gap-2">
          <Link
            href="/consumer"
            className="hidden rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-lime-100 backdrop-blur-sm transition hover:border-lime-300/50 hover:text-white sm:inline-flex"
          >
            Open the app →
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
              Natural farming · Farm direct
            </span>

            <h1 className="gghome-rise brand-wordmark mt-5 text-4xl font-bold leading-[1.05] sm:text-6xl" style={{ animationDelay: '.08s' }}>
              Real food.
              <br />
              Real farmers.
              <br />
              <span className="gghome-grad">No middlemen.</span>
            </h1>

            <p className="gghome-rise mt-5 max-w-md text-base leading-relaxed text-lime-100/70 sm:text-lg" style={{ animationDelay: '.16s' }}>
              Go Grameen connects natural farmers straight to the people who eat their food.
              Harvested today, priced by the farmer, delivered to you.
            </p>

            <div className="gghome-rise mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center" style={{ animationDelay: '.24s' }}>
              <HomeInstallCta />
              <Link
                href="/consumer"
                className="w-full rounded-2xl border border-white/15 px-6 py-4 text-center text-sm font-bold text-white transition hover:border-lime-300/50 hover:bg-white/5 sm:w-auto"
              >
                Browse today’s harvest
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
            “The farmer sets the price.
            <br className="hidden sm:block" />{' '}
            <span className="gghome-grad">Nobody takes a cut in between.”</span>
          </p>
        </div>
      </section>

      {/* ── Who are you ────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-4xl px-4 py-16">
        <h2 className="brand-wordmark text-center text-2xl font-bold sm:text-3xl">Where would you like to start?</h2>
        <p className="mx-auto mt-2 mb-8 max-w-md text-center text-sm text-lime-100/60">
          One app, four ways in. You can switch any time.
        </p>
        <RoleSelect />
      </section>

      {/* ── Features ───────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 py-16">
        <h2 className="brand-wordmark text-center text-2xl font-bold sm:text-3xl">Built for how villages actually sell</h2>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="gghome-card gghome-rise rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm hover:border-lime-300/40"
              style={{ animationDelay: `${0.05 * i}s` }}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime-300/15 text-xl ring-1 ring-lime-300/25" aria-hidden>
                {f.icon}
              </span>
              <h3 className="mt-4 font-extrabold text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-lime-100/60">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────── */}
      <section className="relative z-10 border-y border-white/10 bg-black/20 py-16 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="brand-wordmark text-center text-2xl font-bold sm:text-3xl">Three taps to fresh food</h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-white/10 bg-white/5 p-6">
                <span className="brand-wordmark block text-4xl font-bold text-lime-300/30">{s.n}</span>
                <h3 className="mt-2 font-extrabold text-white">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-lime-100/60">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Harvest strip ──────────────────────────────────────────── */}
      {shots.length > 0 && (
        <section className="relative z-10 mx-auto max-w-6xl px-4 py-16">
          <h2 className="brand-wordmark text-center text-2xl font-bold sm:text-3xl">On the app right now</h2>
          <p className="mt-2 text-center text-sm text-lime-100/60">Real listings from real farms — not stock photos.</p>
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
          <h2 className="brand-wordmark mt-4 text-3xl font-bold leading-tight sm:text-4xl">
            Put the farm <span className="gghome-grad">on your home screen</span>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-lime-100/70">
            No Play Store. No download. It installs straight from your browser and opens like any other app.
          </p>
          <div className="mt-8 flex justify-center">
            <HomeInstallCta />
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/10 px-4 py-8 text-center">
        <p className="text-xs text-lime-100/40">
          Go Grameen · Your Family Farmer
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-semibold text-lime-100/60">
          <Link href="/consumer" className="hover:text-lime-300">Browse harvests</Link>
          <Link href="/farmer/login" className="hover:text-lime-300">Farmer login</Link>
          <Link href="/aggregator/login" className="hover:text-lime-300">Aggregator login</Link>
        </div>
      </footer>
    </main>
  )
}

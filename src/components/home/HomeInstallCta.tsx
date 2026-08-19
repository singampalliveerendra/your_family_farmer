'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { useInstallState, runInstall, reportInstall, DownloadIcon } from '@/lib/installPrompt'
import { writeEntryRole, type EntryRole } from '@/lib/entryRole'

/* The landing page's call to action.
 *
 * Tapping Download opens a chooser first — Consumer or Farmer/Aggregator — and
 * the answer is remembered in a cookie so `/`, the PWA's start_url, opens the
 * installed app straight onto that surface.
 *
 * Note this is ONE app, not two. A PWA has a single manifest and a single
 * start_url, so the choice cannot mint two separate icons in the drawer; it
 * decides where the one icon lands. Either way they can still switch roles from
 * the app's own menu afterwards.
 *
 * The install dialog is raised from the chooser button's own click, which keeps
 * it inside a user gesture — Chrome refuses prompt() outside one.
 *
 * Unlike the pill and ball on /consumer this is ALWAYS visible: the page exists
 * to promote the install, so it must never render as an empty hole. It falls
 * back to "Open App" for anyone already installed. */

/* Below this the badge stays hidden. At 1 it appears with the first real
 * install and only ever hides on zero — "0 downloads" is the one number worth
 * withholding. Raise it if you would rather wait for a rounder figure. */
const MIN_TO_SHOW = 1

/** Indian grouping — 1,20,000, not 120,000. */
function formatCount(n: number): string {
  return n.toLocaleString('en-IN')
}

type Props = {
  size?: 'lg' | 'compact'
  /** Devices that have installed the app; null when the count is unavailable. */
  count?: number | null
}

export default function HomeInstallCta({ size = 'lg', count = null }: Props) {
  const { L } = useLang()
  const { canPrompt, iosHint } = useInstallState()
  const [chooser, setChooser] = useState(false)
  // iOS has no dialog to raise, so after choosing we keep the sheet open and
  // show the manual Add-to-Home-Screen steps instead.
  const [chosen, setChosen] = useState<EntryRole | null>(null)

  // Starts at the server's figure and moves the moment this visitor installs,
  // so they see their own install land instead of waiting out the page's
  // ten-minute revalidate.
  const [live, setLive] = useState<number | null>(count)

  const compact = size === 'compact'
  const offersInstall = canPrompt || iosHint
  // The header pill has no room for it at 390px, so the badge rides the big
  // CTA only.
  const showCount = !compact && live != null && live >= MIN_TO_SHOW

  const shell =
    `inline-flex items-center justify-center gap-2 font-extrabold ` +
    `bg-lime-300 text-green-950 shadow-[0_10px_40px_-10px_rgba(163,230,53,0.7)] ` +
    `active:bg-lime-400 transition ` +
    (compact ? 'px-4 py-2 text-xs rounded-full' : 'w-full sm:w-auto px-8 py-4 text-base rounded-2xl')

  const choose = async (role: EntryRole) => {
    writeEntryRole(role)
    if (canPrompt) {
      setChooser(false)
      // Only an ACCEPTED prompt is an install — Chrome's dialog still has a
      // Cancel, and the badge says "downloads", so a tap must not count.
      if (await runInstall()) {
        // Idempotent, and it beats waiting for `appinstalled` to land.
        const total = await reportInstall()
        if (total != null) setLive(total)
      }
      return
    }
    setChosen(role)
  }

  const label = canPrompt
    ? L('Download App', 'యాప్ డౌన్‌లోడ్ చేయండి')
    : iosHint
      ? L('Add to Home Screen', 'హోమ్ స్క్రీన్‌కు జోడించండి')
      : L('Open App', 'యాప్ తెరవండి')

  const countBadge = showCount ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-lime-300/20 bg-lime-300/10 px-3.5 py-1.5 text-xs font-semibold text-lime-100/75">
      <DownloadIcon className="h-3.5 w-3.5 shrink-0 text-lime-300" />
      <span className="text-sm font-extrabold text-lime-200">{formatCount(live!)}</span>
      {live === 1 ? L('download', 'డౌన్‌లోడ్') : L('downloads', 'డౌన్‌లోడ్‌లు')}
    </span>
  ) : null

  return (
    <>
      <div className={compact ? '' : 'w-full sm:w-auto'}>
        {offersInstall ? (
          <button onClick={() => { setChosen(null); setChooser(true) }} className={shell}>
            <DownloadIcon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
            {compact ? L('Download App', 'డౌన్‌లోడ్') : label}
          </button>
        ) : (
          // Already installed, or a browser that never offers a prompt. `/`
          // honours whatever they picked before, so it is the right target.
          <Link href="/" className={shell}>
            <DownloadIcon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
            {compact ? L('Open App', 'తెరవండి') : label}
          </Link>
        )}

        {/* Under the button, centred on it: the count reads as proof of the
            thing the button does, and stacking keeps the 390px row intact
            whichever language the labels are in. */}
        {countBadge && <div className="mt-3 flex justify-center">{countBadge}</div>}

        {!compact && offersInstall && (
          <p className="mt-2 text-center text-xs text-lime-200/70">
            {L('Free · No Play Store · Installs in seconds', 'ఉచితం · ప్లే స్టోర్ అవసరం లేదు')}
          </p>
        )}
      </div>

      {/* ── Chooser sheet ─────────────────────────────────────────── */}
      {chooser && (
        <div
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setChooser(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={L('Choose how you will use the app', 'మీరు యాప్‌ను ఎలా వాడతారు')}
            className="w-full max-w-md rounded-t-3xl border border-lime-300/20 bg-[#081a10] p-5 text-left shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {chosen ? (
              /* iOS follow-up: the choice is saved, now the manual steps. */
              <>
                <h3 className="brand-wordmark text-xl font-bold text-white">
                  {L('Almost there', 'దాదాపు పూర్తయింది')}
                </h3>
                <p className="mt-1.5 text-sm text-lime-100/70">
                  {chosen === 'seller'
                    ? L('The app will open on the farmer login.', 'యాప్ రైతు లాగిన్‌తో తెరుచుకుంటుంది.')
                    : L('The app will open on today’s harvests.', 'యాప్ నేటి కోతలతో తెరుచుకుంటుంది.')}
                </p>
                <ol className="mt-4 space-y-2 text-sm text-white">
                  <li className="rounded-xl border border-white/10 bg-white/5 p-3">
                    1. {L('Tap the Share button', 'షేర్ బటన్ నొక్కండి')} <span aria-hidden>⬆️</span>
                  </li>
                  <li className="rounded-xl border border-white/10 bg-white/5 p-3">
                    2. {L('Choose “Add to Home Screen”', '“Add to Home Screen” ఎంచుకోండి')}
                  </li>
                </ol>
                <button
                  onClick={() => setChooser(false)}
                  className="mt-4 w-full rounded-2xl bg-lime-300 py-3 text-sm font-extrabold text-green-950"
                >
                  {L('Got it', 'సరే')}
                </button>
              </>
            ) : (
              <>
                <h3 className="brand-wordmark text-xl font-bold text-white">
                  {L('How will you use Go Grameen?', 'మీరు గో గ్రామీణ్ ఎలా వాడతారు?')}
                </h3>
                <p className="mt-1.5 text-sm text-lime-100/70">
                  {L('The app will open straight to your screen.', 'యాప్ నేరుగా మీ స్క్రీన్‌ను చూపుతుంది.')}
                </p>

                <div className="mt-5 space-y-3">
                  <button
                    onClick={() => { void choose('consumer') }}
                    className="flex w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-lime-300/50 hover:bg-white/10"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime-300/15 text-xl ring-1 ring-lime-300/25" aria-hidden>🛒</span>
                    <span className="min-w-0">
                      <span className="block font-extrabold text-white">{L('Download as Consumer', 'కొనుగోలుదారుగా')}</span>
                      <span className="block text-xs text-lime-100/60">{L('Browse and buy fresh harvests', 'తాజా కోతలు కొనండి')}</span>
                    </span>
                  </button>

                  <button
                    onClick={() => { void choose('seller') }}
                    className="flex w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-lime-300/50 hover:bg-white/10"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime-300/15 text-xl ring-1 ring-lime-300/25" aria-hidden>🧑‍🌾</span>
                    <span className="min-w-0">
                      <span className="block font-extrabold text-white">{L('Download as Farmer / Aggregator', 'రైతు / అగ్రిగేటర్‌గా')}</span>
                      <span className="block text-xs text-lime-100/60">{L('List and sell your harvest', 'మీ కోత అమ్మండి')}</span>
                    </span>
                  </button>
                </div>

                <p className="mt-4 text-center text-xs text-lime-100/45">
                  {L('You can switch anytime from the app menu.', 'ఎప్పుడైనా యాప్ మెనూ నుండి మార్చవచ్చు.')}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

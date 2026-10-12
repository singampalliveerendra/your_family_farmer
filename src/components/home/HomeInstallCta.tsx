'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { useInstallState, runInstall, reportInstall, useSafariHandoff, DownloadIcon } from '@/lib/installPrompt'
import { writeEntryRole, type EntryRole } from '@/lib/entryRole'
import { inAppName, safariUrl, handoffPath } from '@/lib/iosInstall'

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
  /** Reopen the Add-to-Home-Screen steps for someone arriving from "Open in
   *  Safari". /home mounts several of these buttons; exactly one sets this. */
  resumeHandoff?: boolean
}

export default function HomeInstallCta({ size = 'lg', count = null, resumeHandoff = false }: Props) {
  const { L } = useLang()
  const { canPrompt, iosHint, openInSafari } = useInstallState()
  const [chooser, setChooser] = useState(false)
  // iOS has no dialog to raise, so after choosing we keep the sheet open and
  // show the manual Add-to-Home-Screen steps instead.
  const [chosen, setChosen] = useState<EntryRole | null>(null)
  const [copied, setCopied] = useState(false)

  // Landed here from "Open in Safari": the role came across in the URL (the
  // in-app browser's cookie did not), so pick up at the Share step.
  const handoff = useSafariHandoff()
  const [handoffClosed, setHandoffClosed] = useState(false)
  const resumed = resumeHandoff && !handoffClosed ? handoff : null
  const sheetOpen = chooser || resumed != null
  const step = chosen ?? resumed
  const close = () => { setChooser(false); setHandoffClosed(true) }
  // The sheet never renders on the server, so reading the UA here is safe.
  const inApp = openInSafari && typeof navigator !== 'undefined' ? inAppName(navigator.userAgent) : null

  const copyLink = async (role: EntryRole) => {
    try {
      await navigator.clipboard.writeText(window.location.origin + handoffPath(role))
      setCopied(true)
    } catch { /* clipboard blocked — the ••• route below still works */ }
  }

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
    `bg-lime-400 text-green-950 shadow-[0_10px_30px_-12px_rgba(77,124,15,0.5)] dark:bg-lime-300 dark:shadow-[0_10px_40px_-10px_rgba(163,230,53,0.7)] ` +
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
    setCopied(false)
    setChosen(role)
  }

  const label = canPrompt
    ? L('Download App', 'యాప్ డౌన్‌లోడ్ చేయండి')
    : iosHint
      ? L('Add to Home Screen', 'హోమ్ స్క్రీన్‌కు జోడించండి')
      : L('Open App', 'యాప్ తెరవండి')

  const countBadge = showCount ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-lime-600/25 bg-lime-100 px-3.5 py-1.5 text-xs font-semibold text-green-900/80 dark:border-lime-300/20 dark:bg-lime-300/10 dark:text-lime-100/75">
      <DownloadIcon className="h-3.5 w-3.5 shrink-0 text-lime-700 dark:text-lime-300" />
      <span className="text-sm font-extrabold text-green-800 dark:text-lime-200">{formatCount(live!)}</span>
      {live === 1 ? L('download', 'డౌన్‌లోడ్') : L('downloads', 'డౌన్‌లోడ్‌లు')}
    </span>
  ) : null

  return (
    <>
      <div className={compact ? '' : 'w-full sm:w-auto'}>
        {offersInstall ? (
          <button onClick={() => { setChosen(null); setHandoffClosed(true); setChooser(true) }} className={shell}>
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
          <p className="mt-2 text-center text-xs text-green-800/80 dark:text-lime-200/70">
            {L('Free · No Play Store · Installs in seconds', 'ఉచితం · ప్లే స్టోర్ అవసరం లేదు')}
          </p>
        )}
      </div>

      {/* ── Chooser sheet ─────────────────────────────────────────── */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={L('Choose how you will use the app', 'మీరు యాప్‌ను ఎలా వాడతారు')}
            className="w-full max-w-md rounded-t-3xl border border-green-900/10 bg-white p-5 text-left shadow-2xl dark:border-lime-300/20 dark:bg-[#081a10] sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {step ? (
              /* iOS follow-up: the choice is saved, now the manual steps. Inside
                 WhatsApp/Instagram/Chrome the Share menu has no Add to Home
                 Screen, so getting into Safari comes first. */
              <>
                <h3 className="brand-wordmark text-xl font-bold text-green-950 dark:text-white">
                  {openInSafari
                    ? L('Open in Safari first', 'ముందుగా Safari లో తెరవండి')
                    : L('Add to Home Screen', 'హోమ్ స్క్రీన్‌కు జోడించండి')}
                </h3>
                <p className="mt-1.5 text-sm text-green-900/70 dark:text-lime-100/70">
                  {openInSafari
                    ? inApp
                      ? L(`You are in ${inApp}’s browser. Only Safari can add Go Grameen to your Home Screen.`,
                          `మీరు ${inApp} బ్రౌజర్‌లో ఉన్నారు. Safari మాత్రమే గో గ్రామీణ్‌ను హోమ్ స్క్రీన్‌కు జోడించగలదు.`)
                      : L('Only Safari can add Go Grameen to your Home Screen.',
                          'Safari మాత్రమే గో గ్రామీణ్‌ను హోమ్ స్క్రీన్‌కు జోడించగలదు.')
                    : step === 'seller'
                      ? L('The app will open on the farmer login.', 'యాప్ రైతు లాగిన్‌తో తెరుచుకుంటుంది.')
                      : L('The app will open on today’s harvests.', 'యాప్ నేటి కోతలతో తెరుచుకుంటుంది.')}
                </p>

                {openInSafari && (
                  <div className="mt-4 space-y-2">
                    <a
                      href={safariUrl(typeof window === 'undefined' ? '' : window.location.origin, step)}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-lime-400 py-3 text-sm font-extrabold text-green-950 dark:bg-lime-300"
                    >
                      <span aria-hidden>🧭</span> {L('Open in Safari', 'Safari లో తెరవండి')}
                    </a>
                    <button
                      onClick={() => { void copyLink(step) }}
                      className="w-full rounded-2xl border border-green-900/15 py-3 text-sm font-bold text-green-900 dark:border-white/15 dark:text-lime-100"
                    >
                      {copied
                        ? L('Link copied — paste it in Safari', 'లింక్ కాపీ అయింది — Safari లో పేస్ట్ చేయండి')
                        : L('Copy link', 'లింక్ కాపీ చేయండి')}
                    </button>
                    <p className="text-center text-xs text-green-900/60 dark:text-lime-100/55">
                      {L('Or tap ••• at the top → “Open in Safari” / “Open in browser”',
                         'లేదా పైన ••• నొక్కి → “Open in Safari” / “Open in browser” ఎంచుకోండి')}
                    </p>
                  </div>
                )}

                {openInSafari && (
                  <p className="mt-5 text-xs font-bold uppercase tracking-wide text-green-900/55 dark:text-lime-100/50">
                    {L('Then, in Safari', 'తర్వాత, Safari లో')}
                  </p>
                )}
                <ol className={`${openInSafari ? 'mt-2' : 'mt-4'} list-inside list-decimal space-y-2 text-sm text-green-950 dark:text-white`}>
                  <li className="rounded-xl border border-green-900/10 bg-lime-50/70 p-3 dark:border-white/10 dark:bg-white/5">
                    {L('Tap the Share button', 'షేర్ బటన్ నొక్కండి')} <span aria-hidden>⬆️</span>
                    <span className="block text-xs text-green-900/60 dark:text-lime-100/55">
                      {L('Bottom of the screen on iPhone, top on iPad', 'iPhone లో స్క్రీన్ కింద, iPad లో పైన')}
                    </span>
                  </li>
                  <li className="rounded-xl border border-green-900/10 bg-lime-50/70 p-3 dark:border-white/10 dark:bg-white/5">
                    {L('Scroll down, choose “Add to Home Screen”', 'కిందకు స్క్రోల్ చేసి “Add to Home Screen” ఎంచుకోండి')} <span aria-hidden>➕</span>
                  </li>
                  <li className="rounded-xl border border-green-900/10 bg-lime-50/70 p-3 dark:border-white/10 dark:bg-white/5">
                    {L('Tap “Add” at the top right', 'పైన కుడివైపు “Add” నొక్కండి')}
                    <span className="block text-xs text-green-900/60 dark:text-lime-100/55">
                      {L('Go Grameen appears on your Home Screen as an app.', 'గో గ్రామీణ్ మీ హోమ్ స్క్రీన్‌పై యాప్‌గా కనిపిస్తుంది.')}
                    </span>
                  </li>
                </ol>
                <button
                  onClick={close}
                  className={openInSafari
                    ? 'mt-4 w-full py-2 text-sm font-bold text-green-900/60 dark:text-lime-100/60'
                    : 'mt-4 w-full rounded-2xl bg-lime-400 py-3 text-sm font-extrabold text-green-950 dark:bg-lime-300'}
                >
                  {openInSafari ? L('Close', 'మూసివేయండి') : L('Got it', 'సరే')}
                </button>
              </>
            ) : (
              <>
                <h3 className="brand-wordmark text-xl font-bold text-green-950 dark:text-white">
                  {L('How will you use Go Grameen?', 'మీరు గో గ్రామీణ్ ఎలా వాడతారు?')}
                </h3>
                <p className="mt-1.5 text-sm text-green-900/70 dark:text-lime-100/70">
                  {L('The app will open straight to your screen.', 'యాప్ నేరుగా మీ స్క్రీన్‌ను చూపుతుంది.')}
                </p>

                <div className="mt-5 space-y-3">
                  <button
                    onClick={() => { void choose('consumer') }}
                    className="flex w-full items-center gap-3.5 rounded-2xl border border-green-900/10 bg-white p-4 text-left shadow-sm transition hover:border-lime-600/50 hover:bg-lime-50 dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:hover:border-lime-300/50 dark:hover:bg-white/10"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime-100 text-xl ring-1 ring-lime-600/20 dark:bg-lime-300/15 dark:ring-lime-300/25" aria-hidden>🛒</span>
                    <span className="min-w-0">
                      <span className="block font-extrabold text-green-950 dark:text-white">{L('Download as Consumer', 'కొనుగోలుదారుగా')}</span>
                      <span className="block text-xs text-green-900/65 dark:text-lime-100/60">{L('Browse and buy fresh harvests', 'తాజా కోతలు కొనండి')}</span>
                    </span>
                  </button>

                  <button
                    onClick={() => { void choose('seller') }}
                    className="flex w-full items-center gap-3.5 rounded-2xl border border-green-900/10 bg-white p-4 text-left shadow-sm transition hover:border-lime-600/50 hover:bg-lime-50 dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:hover:border-lime-300/50 dark:hover:bg-white/10"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime-100 text-xl ring-1 ring-lime-600/20 dark:bg-lime-300/15 dark:ring-lime-300/25" aria-hidden>🧑‍🌾</span>
                    <span className="min-w-0">
                      <span className="block font-extrabold text-green-950 dark:text-white">{L('Download as Farmer / Aggregator', 'రైతు / అగ్రిగేటర్‌గా')}</span>
                      <span className="block text-xs text-green-900/65 dark:text-lime-100/60">{L('List and sell your harvest', 'మీ కోత అమ్మండి')}</span>
                    </span>
                  </button>
                </div>

                <p className="mt-4 text-center text-xs text-green-900/50 dark:text-lime-100/45">
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

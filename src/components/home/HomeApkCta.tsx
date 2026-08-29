'use client'

import { useEffect, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { DownloadIcon, reportInstall } from '@/lib/installPrompt'
import { APK_URL, APK_FILENAME, APK_VERSION, APK_SIZE_LABEL } from '@/lib/apkRelease'

/* Direct APK download — the Android app, not the browser install.
 *
 * Separate from HomeInstallCta on purpose. That one raises Chrome's PWA
 * prompt and mints a WebAPK; this one hands over a real signed .apk the
 * client can put on phones before there is any Play Store listing. They are
 * different products with different install flows, so they get different
 * buttons rather than one button that guesses.
 *
 * The instructions sheet is NOT optional polish. Sideloading an APK trips two
 * scary Android dialogs in a row — Chrome's "this type of file can harm your
 * device" and then "your phone isn't allowed to install unknown apps" — and a
 * farmer who hits those with no warning simply stops. Telling them what is
 * coming BEFORE they tap is the difference between an install and a bounce,
 * so the sheet opens on the same click that starts the download.
 */

export default function HomeApkCta() {
  const { L } = useLang()
  const [sheet, setSheet] = useState(false)
  const [android, setAndroid] = useState(true)

  // An APK is useless on iOS or a laptop. Detect after mount rather than
  // during render: the page is server-rendered, and the server has no UA to
  // branch on without opting the whole route out of its 10-minute cache.
  // Defaults to true so Android — the case that matters — never flashes the
  // wrong copy while hydrating.
  useEffect(() => {
    setAndroid(/Android/i.test(navigator.userAgent))
  }, [])

  const start = () => {
    setSheet(true)
    // A download is what the badge on this page counts, and reportInstall is
    // idempotent per device, so an APK download lands in the same figure as a
    // PWA install. Fire and forget — a marketing number must never delay or
    // block the file the visitor actually asked for.
    void reportInstall()
  }

  const STEPS: [string, string][] = [
    [
      'Tap Download. If Chrome warns about the file, choose “Download anyway”.',
      'డౌన్‌లోడ్ నొక్కండి. క్రోమ్ హెచ్చరిస్తే “Download anyway” ఎంచుకోండి.',
    ],
    [
      'Open the downloaded file from Downloads.',
      'డౌన్‌లోడ్స్‌లో ఉన్న ఫైల్‌ను తెరవండి.',
    ],
    [
      'Allow installs from this source, then tap Install.',
      'ఈ మూలం నుండి ఇన్‌స్టాల్‌కు అనుమతి ఇచ్చి, Install నొక్కండి.',
    ],
  ]

  return (
    <>
      <a
        href={APK_URL}
        download={APK_FILENAME}
        onClick={start}
        className="inline-flex w-full items-center justify-center gap-2.5 rounded-2xl border border-lime-600/40 bg-white px-8 py-4 text-base font-extrabold text-green-900 shadow-sm backdrop-blur-sm transition hover:border-lime-600 hover:bg-lime-50 active:bg-lime-100 dark:border-lime-300/40 dark:bg-lime-300/10 dark:text-lime-100 dark:shadow-none dark:hover:border-lime-300 dark:hover:bg-lime-300/20 dark:active:bg-lime-300/25 sm:w-auto"
      >
        <DownloadIcon className="h-5 w-5 shrink-0" />
        <span className="min-w-0">
          {android
            ? L('Download Android app', 'ఆండ్రాయిడ్ యాప్ డౌన్‌లోడ్')
            : L('Download the APK', 'APK డౌన్‌లోడ్ చేయండి')}
        </span>
        <span className="shrink-0 text-xs font-bold text-green-800/70 dark:text-lime-200/60">{APK_SIZE_LABEL}</span>
      </a>

      <p className="mt-2 text-center text-xs text-green-800/70 dark:text-lime-200/60">
        {android
          ? L(
              `Android · v${APK_VERSION} · Not on the Play Store yet`,
              `ఆండ్రాయిడ్ · v${APK_VERSION} · ఇంకా ప్లే స్టోర్‌లో లేదు`,
            )
          : L(
              'Android only — open this page on an Android phone.',
              'ఆండ్రాయిడ్ మాత్రమే — ఈ పేజీని ఆండ్రాయిడ్ ఫోన్‌లో తెరవండి.',
            )}
      </p>

      {/* ── Install steps ─────────────────────────────────────────── */}
      {sheet && (
        <div
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setSheet(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={L('How to install', 'ఎలా ఇన్‌స్టాల్ చేయాలి')}
            className="w-full max-w-md rounded-t-3xl border border-green-900/10 bg-white p-5 text-left shadow-2xl dark:border-lime-300/20 dark:bg-[#081a10] sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="brand-wordmark text-xl font-bold text-green-950 dark:text-white">
              {L('Downloading…', 'డౌన్‌లోడ్ అవుతోంది…')}
            </h3>
            <p className="mt-1.5 text-sm text-green-900/70 dark:text-lime-100/70">
              {L('Three steps to finish the install.', 'ఇన్‌స్టాల్ పూర్తి చేయడానికి మూడు దశలు.')}
            </p>

            <ol className="mt-4 space-y-2 text-sm text-green-950 dark:text-white">
              {STEPS.map((s, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded-xl border border-green-900/10 bg-lime-50/70 p-3 leading-snug dark:border-white/10 dark:bg-white/5"
                >
                  <span className="shrink-0 font-extrabold text-lime-700 dark:text-lime-300">{i + 1}.</span>
                  <span className="min-w-0">{L(s[0], s[1])}</span>
                </li>
              ))}
            </ol>

            {/* The warning is the whole reason people abandon a sideload, so
                it gets named and explained rather than left to surprise them. */}
            <p className="mt-4 rounded-xl border border-lime-600/20 bg-lime-50 p-3 text-xs leading-relaxed text-green-900/75 dark:border-lime-300/15 dark:bg-lime-300/5 dark:text-lime-100/70">
              <span className="font-bold text-green-800 dark:text-lime-200">
                {L('Why the warning?', 'హెచ్చరిక ఎందుకు?')}
              </span>{' '}
              {L(
                'Android shows it for every app that does not come from the Play Store. This file is signed by Go Grameen.',
                'ప్లే స్టోర్ నుండి రాని ప్రతి యాప్‌కు ఆండ్రాయిడ్ ఇది చూపుతుంది. ఈ ఫైల్‌పై గో గ్రామీణ్ సంతకం ఉంది.',
              )}
            </p>

            <button
              onClick={() => setSheet(false)}
              className="mt-4 w-full rounded-2xl bg-lime-400 py-3 text-sm font-extrabold text-green-950 dark:bg-lime-300"
            >
              {L('Got it', 'సరే')}
            </button>

            {/* Chrome occasionally swallows a download that starts behind a
                dialog; a second, explicit tap always works. */}
            <a
              href={APK_URL}
              download={APK_FILENAME}
              className="mt-2 block text-center text-xs font-semibold text-green-800/75 underline underline-offset-2 dark:text-lime-200/60"
            >
              {L('Download didn’t start? Tap here.', 'డౌన్‌లోడ్ మొదలవలేదా? ఇక్కడ నొక్కండి.')}
            </a>
          </div>
        </div>
      )}
    </>
  )
}

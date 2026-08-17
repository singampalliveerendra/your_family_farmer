'use client'

import Link from 'next/link'
import { useLang } from '@/lib/LanguageContext'
import { useInstallState, runInstall, DownloadIcon } from '@/lib/installPrompt'

/* The landing page's primary call to action.
 *
 * Unlike the pill and the ball on /consumer, this one is ALWAYS visible — it is
 * the reason the page exists, so it must never render as an empty hole. It just
 * changes what it does:
 *
 *   Chrome, installable   → raises the real install dialog
 *   iOS Safari            → Share → Add to Home Screen steps
 *   already installed /   → sends them into the app instead, which is the
 *   no prompt available      thing the button was promising anyway
 */
export default function HomeInstallCta({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const { L } = useLang()
  const { canPrompt, iosHint } = useInstallState()

  const cls =
    size === 'lg'
      ? 'w-full sm:w-auto px-8 py-4 text-base'
      : 'w-full sm:w-auto px-6 py-3.5 text-sm'

  const shell =
    `gghome-cta inline-flex items-center justify-center gap-2.5 rounded-2xl font-extrabold ` +
    `bg-lime-300 text-green-950 shadow-[0_10px_40px_-10px_rgba(163,230,53,0.7)] ` +
    `active:bg-lime-400 transition ${cls}`

  if (canPrompt) {
    return (
      <div className="w-full sm:w-auto">
        <button onClick={() => { void runInstall() }} className={shell}>
          <DownloadIcon className="h-5 w-5" />
          {L('Download App', 'యాప్ డౌన్‌లోడ్ చేయండి')}
        </button>
        <p className="mt-2 text-center text-xs text-lime-200/70">
          {L('Free · No Play Store · Installs in seconds', 'ఉచితం · ప్లే స్టోర్ అవసరం లేదు')}
        </p>
      </div>
    )
  }

  if (iosHint) {
    return (
      <div className="w-full sm:w-auto">
        <div className={`${shell} cursor-default`}>
          <DownloadIcon className="h-5 w-5" />
          {L('Add to Home Screen', 'హోమ్ స్క్రీన్‌కు జోడించండి')}
        </div>
        <p className="mt-2 text-center text-xs text-lime-200/80">
          {L('Tap Share ⬆️ then "Add to Home Screen"', 'షేర్ ⬆️ నొక్కి "Add to Home Screen" ఎంచుకోండి')}
        </p>
      </div>
    )
  }

  // Already installed, or a browser that never offers it. Never a dead button.
  return (
    <div className="w-full sm:w-auto">
      <Link href="/consumer" className={shell}>
        <DownloadIcon className="h-5 w-5" />
        {L('Open the App', 'యాప్ తెరవండి')}
      </Link>
      <p className="mt-2 text-center text-xs text-lime-200/70">
        {L('Works in your browser — nothing to download', 'బ్రౌజర్‌లోనే పనిచేస్తుంది')}
      </p>
    </div>
  )
}

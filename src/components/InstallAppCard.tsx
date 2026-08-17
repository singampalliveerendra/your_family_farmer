'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLang } from '@/lib/LanguageContext'

/* "Download Go Grameen App" — the one-tap entry to installing the PWA.
 *
 * There is no file to download and no APK: Chrome mints the app itself from
 * /manifest.webmanifest. The button says "Download" anyway because that is the
 * word a buyer understands — "install this website" means nothing to them.
 *
 * The card exists because the real install lives behind Chrome's ⋮ menu, which
 * nobody finds. `beforeinstallprompt` lets the page raise that same dialog from
 * a button we control.
 *
 * Renders NOTHING unless an install is genuinely possible — already-installed
 * users, desktop browsers that never fire the event, and in-app browsers all
 * see an unchanged page. */

// Not in TS's lib.dom yet — Chromium-only.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'yff_install_card_dismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari's own flag — it does not implement display-mode.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function wasDismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

/* The server has no window, so anything derived from it must render as absent
   first and appear only after hydration — otherwise React reports a mismatch.
   useSyncExternalStore is the supported way to say that: a server snapshot of
   false, a client snapshot of true, and no setState in an effect. */
const neverChanges = () => () => {}
const onClient = () => true
const onServer = () => false

export default function InstallAppCard() {
  const { L } = useLang()
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const hydrated = useSyncExternalStore(neverChanges, onClient, onServer)

  useEffect(() => {
    // iOS never fires beforeinstallprompt and installed apps never fire it
    // again, so neither case needs a listener at all.
    if (isStandalone() || isIOS()) return

    const onPrompt = (e: Event) => {
      // Without this Chrome shows its own mini-infobar and withholds the event.
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setPrompt(null)

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // iOS gets manual instructions instead of a button that cannot work there.
  const iosHint = hydrated && isIOS() && !isStandalone()

  const install = async () => {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    // The event is single-use: Chrome will fire a fresh one if they change
    // their mind later, so drop this one either way.
    setPrompt(null)
    if (outcome === 'accepted') hide()
  }

  const hide = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
  }

  if (!hydrated || dismissed || wasDismissed()) return null
  if (!prompt && !iosHint) return null

  return (
    <div className="relative rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm">
      <button
        onClick={hide}
        aria-label={L('Dismiss', 'మూసివేయండి')}
        className="absolute top-2 right-2 h-8 w-8 rounded-full text-green-700 text-lg leading-none active:bg-green-100"
      >
        ×
      </button>

      <div className="flex items-start gap-3 pr-8">
        <span className="text-2xl leading-none" aria-hidden>📲</span>
        <div className="min-w-0">
          <h3 className="text-green-900 font-extrabold text-base leading-tight">
            {L('Download Go Grameen App', 'గో గ్రామీణ్ యాప్ డౌన్‌లోడ్ చేసుకోండి')}
          </h3>
          <p className="text-green-800 text-sm mt-1 leading-snug">
            {iosHint
              ? L('Tap Share, then "Add to Home Screen".', 'షేర్ నొక్కి, "Add to Home Screen" ఎంచుకోండి.')
              : L('Add it to your phone. No Play Store needed.', 'మీ ఫోన్‌లో పెట్టుకోండి. ప్లే స్టోర్ అవసరం లేదు.')}
          </p>
        </div>
      </div>

      {iosHint ? (
        <ol className="mt-3 text-sm text-green-900 space-y-1 list-decimal list-inside">
          <li>{L('Tap the Share button below', 'కింద ఉన్న షేర్ బటన్ నొక్కండి')} <span aria-hidden>⬆️</span></li>
          <li>{L('Choose "Add to Home Screen"', '"Add to Home Screen" ఎంచుకోండి')}</li>
        </ol>
      ) : (
        <button
          onClick={install}
          className="mt-4 w-full bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm active:bg-green-800"
        >
          {L('Download App', 'యాప్ డౌన్‌లోడ్ చేయండి')}
        </button>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLang } from '@/lib/LanguageContext'

/* Floating "install the app" ball — an AssistiveTouch-style bubble parked on
 * the left edge, which opens a small popover with the Download button.
 *
 * A ball rather than a card in the page: the install offer should follow the
 * buyer while they browse, not scroll away after two swipes.
 *
 * LEFT edge on purpose. CartFab is `fixed right-4 z-[60]` at the same height,
 * so the right side is taken; this sits at the mirrored offset on `z-[55]`, one
 * layer below, so the cart and every modal keep winning any overlap.
 *
 * There is no APK and nothing downloads — Chrome mints the app from
 * /manifest.webmanifest. "Download" is simply the word buyers understand.
 *
 * Renders NOTHING unless installing is genuinely possible, so already-installed
 * users, desktop browsers and anyone who dismissed it see an unchanged page. */

// Not in TS's lib.dom yet — Chromium-only.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'yff_install_card_dismissed'

// Matches CartFab's own offset so the two balls sit level.
const BOTTOM = 'max(24px, env(safe-area-inset-bottom, 24px))'

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
   first and appear only after hydration. useSyncExternalStore is the supported
   way to say that — not a setState in an effect, which React 19 flags. */
const neverChanges = () => () => {}
const onClient = () => true
const onServer = () => false

export default function InstallAppFab() {
  const { L } = useLang()
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [open, setOpen] = useState(false)

  const hydrated = useSyncExternalStore(neverChanges, onClient, onServer)

  useEffect(() => {
    // iOS never fires beforeinstallprompt, and an installed app never fires it
    // again — neither case needs a listener.
    if (isStandalone() || isIOS()) return

    const onPrompt = (e: Event) => {
      // Without this Chrome shows its own mini-infobar and withholds the event.
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => { setPrompt(null); setOpen(false) }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // iOS gets manual steps instead of a button that cannot work there.
  const iosHint = hydrated && isIOS() && !isStandalone()

  const install = async () => {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    // Single-use event: Chrome fires a fresh one if they change their mind.
    setPrompt(null)
    setOpen(false)
    if (outcome === 'accepted') hide()
  }

  const hide = () => {
    setDismissed(true)
    setOpen(false)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
  }

  if (!hydrated || dismissed || wasDismissed()) return null
  if (!prompt && !iosHint) return null

  return (
    <>
      {/* Tap-away layer. Only mounted while open, so it never intercepts taps
          on the page underneath the rest of the time. */}
      {open && (
        <div
          className="fixed inset-0 z-[54]"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <div className="fixed left-3 z-[55] flex flex-col items-start gap-2" style={{ bottom: BOTTOM }}>
        {/* ── The popover ─────────────────────────────── */}
        {open && (
          <div
            role="dialog"
            aria-label={L('Download Go Grameen App', 'గో గ్రామీణ్ యాప్ డౌన్‌లోడ్')}
            className="w-60 rounded-2xl border border-green-200 bg-white p-3.5 shadow-2xl"
          >
            <div className="flex items-start gap-2">
              <span className="text-xl leading-none" aria-hidden>📲</span>
              <div className="min-w-0">
                <h3 className="text-green-900 font-extrabold text-sm leading-tight">
                  {L('Download Go Grameen App', 'గో గ్రామీణ్ యాప్')}
                </h3>
                <p className="text-green-800 text-xs mt-1 leading-snug">
                  {iosHint
                    ? L('Add it to your home screen.', 'హోమ్ స్క్రీన్‌కు జోడించండి.')
                    : L('Add it to your phone. No Play Store needed.', 'మీ ఫోన్‌లో పెట్టుకోండి. ప్లే స్టోర్ అవసరం లేదు.')}
                </p>
              </div>
            </div>

            {iosHint ? (
              <ol className="mt-2.5 text-xs text-green-900 space-y-1 list-decimal list-inside">
                <li>{L('Tap Share', 'షేర్ నొక్కండి')} <span aria-hidden>⬆️</span></li>
                <li>{L('Choose "Add to Home Screen"', '"Add to Home Screen" ఎంచుకోండి')}</li>
              </ol>
            ) : (
              <button
                onClick={install}
                className="mt-3 w-full bg-green-700 text-white font-bold py-2.5 rounded-xl text-sm active:bg-green-800"
              >
                {L('Download App', 'డౌన్‌లోడ్ చేయండి')}
              </button>
            )}

            <button
              onClick={hide}
              className="mt-2 w-full text-green-700 text-xs font-semibold py-1 active:text-green-900"
            >
              {L("Don't show again", 'మళ్లీ చూపవద్దు')}
            </button>
          </div>
        )}

        {/* ── The ball ────────────────────────────────── */}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={L('Download Go Grameen App', 'గో గ్రామీణ్ యాప్ డౌన్‌లోడ్')}
          className="relative h-14 w-14 rounded-full bg-green-700 text-white shadow-2xl flex items-center justify-center text-2xl active:bg-green-800"
        >
          {/* One-shot attention ring. `pointer-events-none` so it never eats the
              tap, and it stops once opened so it isn't a permanent distraction. */}
          {!open && (
            <span
              className="absolute inset-0 rounded-full bg-green-500 opacity-60 animate-ping pointer-events-none"
              aria-hidden
            />
          )}
          <span className="relative" aria-hidden>{open ? '×' : '📲'}</span>
        </button>
      </div>
    </>
  )
}

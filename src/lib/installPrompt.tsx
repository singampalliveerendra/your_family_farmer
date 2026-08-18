'use client'

import { useSyncExternalStore } from 'react'

/* Shared install state for the PWA "Download App" surface on /home.
 *
 * Only ONE `beforeinstallprompt` event ever exists per page, so the offer
 * cannot be owned by whichever component happened to mount first — it lives
 * here, ready for any surface that wants to raise it.
 *
 * Hence a module-level store read through useSyncExternalStore: the server
 * snapshot is "nothing to offer", so the surface is absent from the server
 * render and appears after hydration, with no setState in an effect (which
 * React 19 flags as a cascading render). */

// Not in TS's lib.dom yet — Chromium-only.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'yff_install_card_dismissed'

export type InstallState = {
  /** A real Chrome install dialog is waiting to be raised. */
  canPrompt: boolean
  /** iOS: no dialog exists, the user must use Share → Add to Home Screen. */
  iosHint: boolean
}

// Same object identity every time — getSnapshot must be referentially stable
// or useSyncExternalStore re-renders forever.
const NOTHING: InstallState = { canPrompt: false, iosHint: false }

let snapshot: InstallState = NOTHING
let deferred: BeforeInstallPromptEvent | null = null
let dismissedFlag = false
let started = false
const listeners = new Set<() => void>()

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
  if (dismissedFlag) return true
  // Set by the old install ball's "Don't show again"; still honoured so anyone
  // who opted out then stays opted out.
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

function compute(): InstallState {
  if (typeof window === 'undefined') return NOTHING
  if (wasDismissed() || isStandalone()) return NOTHING
  if (isIOS()) return { canPrompt: false, iosHint: true }
  return deferred ? { canPrompt: true, iosHint: false } : NOTHING
}

function refresh() {
  const next = compute()
  if (next.canPrompt === snapshot.canPrompt && next.iosHint === snapshot.iosHint) return
  snapshot = next
  listeners.forEach((l) => l())
}

function onPrompt(e: Event) {
  // Without this Chrome shows its own mini-infobar and withholds the event.
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
  refresh()
}

function onInstalled() {
  deferred = null
  dismissedFlag = true
  refresh()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!started) {
    started = true
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeinstallprompt', onPrompt)
      window.addEventListener('appinstalled', onInstalled)
    }
    // Seed without emitting — React re-reads the snapshot right after
    // subscribing, so an emit here would be a redundant render.
    snapshot = compute()
  }
  return () => { listeners.delete(listener) }
}

const getSnapshot = () => snapshot
const getServerSnapshot = () => NOTHING

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Raise Chrome's install dialog. Resolves true if the user accepted. */
export async function runInstall(): Promise<boolean> {
  if (!deferred) return false
  const evt = deferred
  await evt.prompt()
  const { outcome } = await evt.userChoice
  // Single-use: Chrome fires a fresh event if they change their mind later.
  deferred = null
  if (outcome === 'accepted') dismissedFlag = true
  refresh()
  return outcome === 'accepted'
}

/** Shared download glyph — an arrow dropping into a tray. */
export function DownloadIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  )
}

'use client'

import { useSyncExternalStore } from 'react'
import { readEntryRole } from '@/lib/entryRole'
import type { InstallPlatform } from '@/lib/installCount'

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
  // Chrome/Android fires this once the app is really on the home screen, so
  // it is the honest moment to count a download — not the button tap, which
  // they can still back out of.
  void reportInstall()
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

/* ── Counting installs ──────────────────────────────────────────────
 *
 * The "N downloads" badge on /home is a real count of devices that
 * installed the app, so it has to be reported from the browser: the server
 * never sees an install happen.
 *
 * Two moments report, because no single one covers every platform:
 *   • `appinstalled` above — Chrome/Android, the tab that installed it
 *   • first launch in standalone mode (InstallCounter, in the root layout)
 *     — the only signal iOS gives, since Safari has no install event
 *
 * Both are funnelled through here, and a device counts at most once: the id
 * below is minted once into localStorage and is UNIQUE in the table, so even
 * a cleared browser store cannot double-count without also losing the id. */

const DEVICE_KEY = 'yff_install_device'
const REPORTED_KEY = 'yff_install_reported'
let reported = false

function deviceId(): string {
  try {
    const seen = localStorage.getItem(DEVICE_KEY)
    if (seen) return seen
    const fresh =
      crypto.randomUUID?.() ??
      // Older Android WebViews have crypto but not randomUUID.
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
    localStorage.setItem(DEVICE_KEY, fresh)
    return fresh
  } catch {
    // Private mode with storage blocked: still report, just unlinkable.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }
}

function platform(): InstallPlatform {
  if (isIOS()) return 'ios'
  return /Android/i.test(navigator.userAgent) ? 'android' : 'desktop'
}

/** Count this device's install, once. Resolves to the fresh total so the
 *  surface that raised the prompt can show the number moving, or null when
 *  there was nothing to report. Silent on failure — a marketing number is
 *  never worth interrupting someone who just installed the app. */
export async function reportInstall(): Promise<number | null> {
  if (typeof window === 'undefined' || reported) return null
  reported = true
  try {
    if (localStorage.getItem(REPORTED_KEY) === '1') return null
  } catch { /* storage blocked — fall through and report */ }

  try {
    const res = await fetch('/api/installs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId(), role: readEntryRole(), platform: platform() }),
      keepalive: true,
    })
    try { localStorage.setItem(REPORTED_KEY, '1') } catch { /* nothing to do */ }
    const body = (await res.json()) as { count?: unknown }
    return typeof body.count === 'number' ? body.count : null
  } catch {
    // Offline or blocked. Let the next launch try again.
    reported = false
    return null
  }
}

/** True once the app is running from the home screen. */
export function runningStandalone(): boolean {
  return isStandalone()
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

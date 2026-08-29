'use client'

import { useSyncExternalStore } from 'react'

/* Light/dark for the /home landing page.
 *
 * SCOPED TO /home ON PURPOSE. Every other surface in this app is light-only
 * and uses no `dark:` utilities at all, so the variant is keyed to a
 * `gg-dark` class rather than `prefers-color-scheme` (see the
 * `@custom-variant` line in globals.css). The class lands on <html> because
 * the pre-paint script in app/home/page.tsx has to set it before React
 * exists — but since nothing outside /home has a `dark:` utility to match,
 * a stale class on another route is inert.
 *
 * DEFAULT IS LIGHT, and deliberately does NOT follow the OS. The page was
 * changed to a light theme on request; honouring `prefers-color-scheme`
 * would quietly hand the old dark page back to every visitor whose phone is
 * in dark mode, which is the opposite of what was asked. Dark is opt-in via
 * the footer toggle, and then it sticks.
 *
 * A module-level store rather than component state: the toggle sits in the
 * footer but the header's language pill also has to know the theme, and
 * lifting state through the whole page for two consumers is worse than one
 * shared store. Same reasoning as `installPrompt`.
 */

export type HomeTheme = 'light' | 'dark'

/** Read by the pre-paint script too — keep the two spellings in step. */
export const THEME_KEY = 'yff_home_theme'

/** The class the `dark:` variant matches. Also duplicated in the script. */
const DARK_CLASS = 'gg-dark'

let theme: HomeTheme = 'light'
const listeners = new Set<() => void>()

/* The script has already stamped the class by the time this module runs, so
 * the DOM — not localStorage — is the source of truth on first read. That
 * keeps the store and the painted page from disagreeing. */
function readFromDom(): HomeTheme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains(DARK_CLASS) ? 'dark' : 'light'
}

if (typeof document !== 'undefined') theme = readFromDom()

export function getHomeTheme(): HomeTheme {
  return theme
}

export function setHomeTheme(next: HomeTheme) {
  if (next === theme) return
  theme = next
  document.documentElement.classList.toggle(DARK_CLASS, next === 'dark')
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch {
    // Private mode, or storage disabled. The toggle still works for this
    // visit; it just will not be remembered, which is not worth an error.
  }
  listeners.forEach((l) => l())
}

export function toggleHomeTheme() {
  setHomeTheme(theme === 'dark' ? 'light' : 'dark')
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** The server has no class to read, so it always renders the light page —
 *  which is the default anyway, so there is nothing to reconcile. */
export function useHomeTheme(): HomeTheme {
  return useSyncExternalStore(subscribe, getHomeTheme, () => 'light')
}

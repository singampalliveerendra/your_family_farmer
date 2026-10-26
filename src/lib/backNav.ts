/* The app-wide Back button's memory.
 *
 * Back should return to the page the user actually came from — the browser's
 * own history — not to a fixed parent page. But history.back() on the first
 * page of a visit (opened from a WhatsApp link, the home-screen icon, a fresh
 * tab) would leave the app or do nothing. So we keep our own list of the in-app
 * pages visited in this tab, and Back only uses the browser's history when
 * there is an in-app page behind the current one; otherwise it goes to the
 * page's fallback (its natural parent).
 *
 * Pure functions only, so the rules are testable; NavHistoryTracker records the
 * visits and BackButton reads them.
 */

export const BACK_STACK_KEY = 'yff_back_stack'

// Long enough for any real session; stops sessionStorage growing forever.
const MAX_DEPTH = 50

/**
 * The stack after the app moved to `path`.
 *
 * - `path` is the page just behind the top → the user went back: pop.
 * - The browser history grew → a normal link / router.push: push.
 * - Otherwise (router.replace, a redirect, or a forward step after going back)
 *   → the top entry is swapped, the depth stays the same.
 */
export function nextBackStack(stack: string[], path: string, historyGrew: boolean): string[] {
  if (stack.length === 0) return [path]
  const top = stack[stack.length - 1]
  if (top === path) return stack
  if (stack.length > 1 && stack[stack.length - 2] === path) return stack.slice(0, -1)
  if (historyGrew) return [...stack, path].slice(-MAX_DEPTH)
  return [...stack.slice(0, -1), path]
}

/** True when there is an in-app page behind the current one. */
export function canGoBack(stack: string[]): boolean {
  return stack.length > 1
}

/**
 * A hard page load starts a fresh stack unless it came from inside the app (a
 * reload, or a full-page navigation between two of our own pages). A visit that
 * arrives from another site must not "go back" to the pages of an older visit
 * in this tab — history.back() would land on the other site.
 */
export function isSameOriginReferrer(referrer: string, origin: string): boolean {
  if (!referrer) return false
  try {
    return new URL(referrer).origin === origin
  } catch {
    return false
  }
}

export function readBackStack(): string[] {
  try {
    const raw = sessionStorage.getItem(BACK_STACK_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

export function writeBackStack(stack: string[]): void {
  try { sessionStorage.setItem(BACK_STACK_KEY, JSON.stringify(stack)) } catch { /* blocked */ }
}

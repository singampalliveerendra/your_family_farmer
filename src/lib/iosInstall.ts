import type { EntryRole } from '@/lib/entryRole'

/* Everything the iOS install flow needs to know about the browser it is in.
 *
 * iOS has no install dialog and cannot sideload an APK. The ONLY way onto the
 * home screen is Safari → Share → Add to Home Screen, and that menu item does
 * not exist inside WhatsApp's or Instagram's built-in browser. So the flow is:
 *
 *   in-app browser  →  "Open in Safari"  →  Share → Add to Home Screen → Add
 *
 * Pure functions over the user-agent string so the detection can be tested
 * without a browser. */

/** iPhone, iPod or iPad. iPadOS 13+ Safari claims to be a Mac ("desktop-class
 *  browsing"), so an iPad is told apart from a real Mac by its touch screen —
 *  no Mac has more than one touch point. */
export function isIOSDevice(ua: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return /Macintosh/.test(ua) && maxTouchPoints > 1
}

/* Apps that open links in their own WebView. Their share sheets have no
 * "Add to Home Screen". Checked before the Safari token below, because most of
 * them copy Safari's UA and only append their own name. */
const IN_APP: [RegExp, string][] = [
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FBIOS|FB_IAB/, 'Facebook'],
  [/WhatsApp/i, 'WhatsApp'],
  [/Snapchat/i, 'Snapchat'],
  [/\bLine\//, 'LINE'],
  [/Twitter/i, 'X'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/GSA\//, 'Google'],
]

// Third-party iOS browsers. They are WebKit underneath and some can add to the
// home screen on iOS 16.4+, but the button lives somewhere different in each —
// one set of steps for Safari is clearer than four.
const OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo/

export type IOSBrowser = 'safari' | 'in-app' | 'other'

export function iosBrowser(ua: string): IOSBrowser {
  if (IN_APP.some(([re]) => re.test(ua))) return 'in-app'
  if (OTHER_BROWSER.test(ua)) return 'other'
  // Real Safari always carries "Safari/". A bare WKWebView (an app we did not
  // list) does not — treat it as in-app, since it has no Add to Home Screen.
  return /Safari\//.test(ua) ? 'safari' : 'in-app'
}

/** "Instagram", "WhatsApp" … for the "You're in X's browser" line; null when
 *  the app is not one we can name. */
export function inAppName(ua: string): string | null {
  return IN_APP.find(([re]) => re.test(ua))?.[1] ?? null
}

/* ── Handing over to Safari ─────────────────────────────────────────
 *
 * The Consumer/Farmer choice lives in a cookie, and an in-app browser does NOT
 * share its cookie jar with Safari. So the choice rides in the URL instead, and
 * /home in Safari writes the cookie and reopens the steps where they left off. */

const HANDOFF_FLAG = 'install'
const HANDOFF_VALUE = 'ios'
const HANDOFF_ROLE = 'role'

/** The /home URL Safari should open, carrying the role across. */
export function handoffPath(role: EntryRole): string {
  return `/home?${HANDOFF_FLAG}=${HANDOFF_VALUE}&${HANDOFF_ROLE}=${role}`
}

/** `x-safari-https://…` opens the URL in Safari from inside another app's
 *  WebView (iOS 17+). Older iOS ignores it, which is why the sheet also offers
 *  Copy link and the ••• → Open in Safari route. */
export function safariUrl(origin: string, role: EntryRole): string {
  return `x-safari-${origin}${handoffPath(role)}`
}

/** The role carried by a handoff URL, or null when this is an ordinary visit. */
export function readHandoff(search: string): EntryRole | null {
  const q = new URLSearchParams(search)
  if (q.get(HANDOFF_FLAG) !== HANDOFF_VALUE) return null
  const role = q.get(HANDOFF_ROLE)
  return role === 'seller' || role === 'consumer' ? role : null
}

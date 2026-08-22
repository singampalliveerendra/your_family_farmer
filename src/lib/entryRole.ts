/* Which surface the app should open on.
 *
 * A PWA has exactly ONE manifest and ONE start_url, so choosing "consumer" or
 * "farmer" at install time cannot produce two separate app icons. What it can
 * do is remember the choice and have `/` — the start_url — send them straight
 * to the right place, so the installed app opens on their own surface.
 *
 * A COOKIE, not localStorage: `/` is a server component, and the server cannot
 * read localStorage. Same reasoning and same shape as the `yff_lang` cookie the
 * LanguageProvider writes for server routes.
 *
 * The installed app runs on the same origin as the tab that installed it, so
 * the cookie written just before the install prompt is still there the first
 * time the app is opened. */

export const ENTRY_COOKIE = 'yff_entry'

export type EntryRole = 'consumer' | 'seller'

const DESTINATIONS: Record<EntryRole, string> = {
  consumer: '/consumer',
  // Both kinds of seller start here: the dashboard reads account_type and
  // forwards an aggregator to /aggregator/dashboard on its own.
  seller: '/farmer/dashboard',
}

// Farmers and aggregators share SellerLoginForm behind /farmer/login, which is
// also where an aggregator can switch across.
export const SELLER_LOGIN = '/farmer/login'

/**
 * Where `/` should send someone, given the raw cookie value.
 *
 * `/` is the installed app's start_url, so this runs on EVERY launch. Sending
 * sellers to the login page unconditionally is what made the app ask for a
 * password every single time it was opened, even though the `yff_farmer`
 * cookie is good for 30 days. Pass whether that cookie is live and a signed-in
 * seller opens on their dashboard; only a genuinely logged-out one sees a form.
 */
export function entryDestination(raw: string | undefined, sellerSignedIn = false): string {
  if (raw !== 'seller') return DESTINATIONS.consumer
  return sellerSignedIn ? DESTINATIONS.seller : SELLER_LOGIN
}

/** Remember the choice before raising the install prompt. Client-only. */
export function writeEntryRole(role: EntryRole) {
  if (typeof document === 'undefined') return
  // A year, matching yff_lang. Lax so it survives the launch of the installed
  // app, which is a top-level same-site navigation.
  document.cookie = `${ENTRY_COOKIE}=${role}; path=/; max-age=31536000; SameSite=Lax`
}

/** Read the remembered choice in the browser. Client-only; null when they
 *  never chose (a straight install from the browser menu, say). */
export function readEntryRole(): EntryRole | null {
  if (typeof document === 'undefined') return null
  const hit = document.cookie.match(new RegExp(`(?:^|; )${ENTRY_COOKIE}=([^;]*)`))
  const raw = hit?.[1]
  return raw === 'seller' || raw === 'consumer' ? raw : null
}

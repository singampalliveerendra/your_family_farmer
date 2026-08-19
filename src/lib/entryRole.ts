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
  // Farmers and aggregators share SellerLoginForm behind /farmer/login, which
  // is also where an aggregator can switch across.
  seller: '/farmer/login',
}

/** Where `/` should send someone, given the raw cookie value. */
export function entryDestination(raw: string | undefined): string {
  return raw === 'seller' ? DESTINATIONS.seller : DESTINATIONS.consumer
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

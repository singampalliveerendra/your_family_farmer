import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ENTRY_COOKIE, entryDestination } from '@/lib/entryRole'
import { FARMER_SESSION_COOKIE_NAME, verifyFarmerSessionToken } from '@/lib/farmer-session'

/* gogrameen.in — the front door.
 *
 * A plain visitor lands on /home, the promo page. But `/` is ALSO the PWA's
 * start_url, and an installed app must never open on a marketing page telling
 * its own user to install it. Two signals separate the cases:
 *
 *   ?pwa=1        the manifest's start_url carries it, so it is only ever
 *                 present when the installed app launches itself
 *   yff_entry     set when they chose Consumer or Farmer at install time
 *
 * Either one means "this person already has the app", and they go straight to
 * their surface. The cookie is what covers existing installs, whose WebAPK
 * still has the old parameter-less start_url baked in until Chrome refreshes
 * the manifest.
 *
 * Everyone else — first visit, a shared link, a QR code — gets /home. */
export const dynamic = 'force-dynamic'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ pwa?: string }>
}) {
  const [store, params] = await Promise.all([cookies(), searchParams])
  const entry = store.get(ENTRY_COOKIE)?.value

  // Is the seller still signed in? Verifying the token here — rather than
  // letting the dashboard find out on the client — means a logged-out seller
  // goes straight to the login form instead of loading the whole dashboard
  // bundle first only to be bounced off it. Signature check only, no DB round
  // trip: /api/auth/me revalidates against `farmers` a moment later anyway.
  const sellerSignedIn =
    verifyFarmerSessionToken(store.get(FARMER_SESSION_COOKIE_NAME)?.value) !== null

  if (params.pwa === '1' || entry) redirect(entryDestination(entry, sellerSignedIn))
  redirect('/home')
}

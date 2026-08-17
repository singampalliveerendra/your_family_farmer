import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ENTRY_COOKIE, entryDestination } from '@/lib/entryRole'

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

  if (params.pwa === '1' || entry) redirect(entryDestination(entry))
  redirect('/home')
}

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ENTRY_COOKIE, entryDestination } from '@/lib/entryRole'

/* The PWA's start_url. Sends people to the surface they picked when they
 * installed (see src/lib/entryRole.ts) so the app opens on their own screen
 * rather than always on the buyer catalogue.
 *
 * Anyone without the cookie — every existing user, and anyone arriving from a
 * plain link — still lands on /consumer exactly as before. */
export const dynamic = 'force-dynamic'

export default async function Home() {
  const store = await cookies()
  redirect(entryDestination(store.get(ENTRY_COOKIE)?.value))
}

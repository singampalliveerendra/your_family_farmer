import type { Metadata } from 'next'
import { farmShots } from '@/lib/farmShots'
import { installCount } from '@/lib/installCount'
import HomeLanding from '@/components/home/HomeLanding'
import { activePlans } from '@/lib/publicPlans'

/* /home — the public landing page.
 *
 * Deliberately a NEW route, not a change to `/`, which still redirects to
 * /consumer. Nothing that exists is rerouted, so no buyer, farmer or rider
 * flow moves. The page can be linked or QR'd for promotion on its own.
 *
 * Photography is the real catalogue out of Supabase Storage rather than stock
 * imagery: those are the actual farms, and next.config.ts only whitelists the
 * Supabase hosts for next/image anyway, so an external stock URL would 400.
 *
 * This file stays a server component so the catalogue query and the 10-minute
 * cache stay on the server; all of the markup and copy lives in HomeLanding,
 * which is a client island because the page carries the language chooser and
 * every word on it has to switch with the toggle. Metadata cannot switch —
 * it is baked at build time — so the tab title and description stay English. */

export const metadata: Metadata = {
  title: 'Go Grameen — Fresh harvests, straight from the farmer',
  description:
    'Buy harvests directly from the farmers who grow them. No middlemen, no Play Store — install Go Grameen straight from your browser.',
}

// Photos change only when the catalogue does; ten minutes keeps the landing
// page fast without going stale for a day.
export const revalidate = 600

export default async function HomePage() {
  // Both are cheap and independent, and both are covered by `revalidate`
  // above — so the download count is at most ten minutes behind, which is
  // the right trade for a marketing number that must not cost a query on
  // every visit.
  const [shots, installs, plans] = await Promise.all([farmShots(6), installCount(), activePlans()])
  return (
    <>
      {/* Restores a saved dark-mode choice BEFORE the first paint.
          Without this the page always paints light — the server has no way to
          know the preference — and anyone who chose dark gets a white flash on
          every visit. It has to be inline and synchronous for that reason; an
          effect runs after the browser has already painted.
          Keys are duplicated from src/lib/homeTheme.ts, which cannot be
          imported here: this string is executed by the browser, not bundled. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{if(localStorage.getItem('yff_home_theme')==='dark')" +
            "document.documentElement.classList.add('gg-dark')}catch(e){}",
        }}
      />
      <HomeLanding shots={shots} installs={installs} plans={plans} />
    </>
  )
}

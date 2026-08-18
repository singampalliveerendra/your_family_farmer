import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import HomeLanding from '@/components/home/HomeLanding'

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

type Shot = { id: string; name: string; image_url: string }

async function farmShots(limit = 6): Promise<Shot[]> {
  try {
    const { data } = await supabase
      .from('produce_listings')
      .select('id, name, image_url')
      .not('image_url', 'is', null)
      .in('status', ['available', 'sold_out'])
      .order('created_at', { ascending: false })
      .limit(limit)
    return ((data ?? []) as Shot[]).filter((r) => !!r.image_url)
  } catch {
    // A marketing page must never 500 because the catalogue hiccuped — the
    // photo sections simply don't render.
    return []
  }
}

export default async function HomePage() {
  const shots = await farmShots(6)
  return <HomeLanding shots={shots} />
}

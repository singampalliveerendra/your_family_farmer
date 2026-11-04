import { supabase } from '@/lib/supabase'
import { readWithSaleMode } from '@/lib/wholesaleVisibility'

/* Real produce photos for the public pages (/home and the role explainers):
 * the actual farms, out of Supabase Storage, rather than stock imagery —
 * next.config.ts only whitelists the Supabase hosts for next/image anyway.
 * Household-facing, so wholesale-only produce never appears. Never throws: a
 * marketing page must not 500 because the catalogue hiccuped — the photos
 * just don't render. */

export type Shot = { id: string; name: string; image_url: string }

export async function farmShots(limit = 6): Promise<Shot[]> {
  try {
    const { data } = await readWithSaleMode((withMode) => {
      const q = supabase
        .from('produce_listings')
        .select('id, name, image_url')
        .not('image_url', 'is', null)
        .in('status', ['available', 'sold_out'])
      return (withMode ? q.neq('sale_mode', 'wholesale') : q)
        .order('created_at', { ascending: false })
        .limit(limit)
    })
    return ((data ?? []) as Shot[]).filter((r) => !!r.image_url)
  } catch {
    return []
  }
}

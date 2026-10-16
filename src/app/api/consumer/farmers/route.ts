import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { CONSUMER_VISIBLE_STATUSES } from '@/lib/produceStatus'
import { pickGrowText } from '@/lib/farmersTab'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET — the buyer's Farmers tab: every active farmer with their follower and
// live-listing counts. The same for every visitor, so Vercel's CDN serves it
// for a minute from one run. Who THIS buyer follows is personal and comes from
// /api/consumer/follows instead — mixing it in here would make the response
// uncacheable (or worse, cache one buyer's follows for everyone).
// Explicit columns only: `farmers` carries the password hash and bank details,
// and this response is public.
const LIST_CACHE = 'public, s-maxage=60, stale-while-revalidate=300'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: farmers, error } = await supabase
    .from('farmers')
    .select('id, slug, name, village, district, photo_url, account_type, rating_avg, lat, lng, location_name, story_quote, how_we_aggregate')
    .eq('active', true)
    .not('slug', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (farmers ?? []).map((f) => f.id as string)

  // Best-effort counts: a missing table or a failed read leaves them at 0.
  const [followsRes, listingsRes] = await Promise.all([
    ids.length ? supabase.from('farmer_follows').select('farmer_id').in('farmer_id', ids) : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from('produce_listings').select('farmer_id, how_we_grow, created_at').in('farmer_id', ids).in('status', [...CONSUMER_VISIBLE_STATUSES]).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  const tally = (rows: Array<{ farmer_id: string }> | null | undefined) => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) m.set(r.farmer_id, (m.get(r.farmer_id) ?? 0) + 1)
    return m
  }
  const followers = tally(followsRes.data as Array<{ farmer_id: string }> | null)
  const listings = tally(listingsRes.data as Array<{ farmer_id: string }> | null)

  // "How we grow" is written per produce; newest wins (rows come newest first).
  const growByFarmer = new Map<string, string>()
  for (const r of (listingsRes.data ?? []) as Array<{ farmer_id: string; how_we_grow?: string | null }>) {
    const text = r.how_we_grow?.trim()
    if (text && !growByFarmer.has(r.farmer_id)) growByFarmer.set(r.farmer_id, text)
  }

  return NextResponse.json({
    farmers: (farmers ?? []).map(({ story_quote, how_we_aggregate, ...f }) => ({
      ...f,
      follower_count: followers.get(f.id as string) ?? 0,
      listing_count: listings.get(f.id as string) ?? 0,
      ...pickGrowText({
        produce: growByFarmer.get(f.id as string),
        story: story_quote as string | null,
        aggregate: how_we_aggregate as string | null,
        isAggregator: f.account_type === 'aggregator',
      }),
    })),
  }, { headers: { 'Cache-Control': LIST_CACHE } })
}

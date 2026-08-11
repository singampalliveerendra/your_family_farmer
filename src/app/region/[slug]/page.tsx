import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { CONSUMER_VISIBLE_STATUSES } from '@/lib/produceStatus'
import RegionTopBar from '@/components/region/RegionTopBar'
import RegionHero from '@/components/region/RegionHero'
import RegionContent from '@/components/region/RegionContent'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data: region } = await supabase
    .from('regions')
    .select('name, district')
    .eq('slug', slug)
    .single()

  if (!region) return { title: 'Region not found' }

  return {
    title: `Natural Farmers in ${region.name} — YourFamilyFarmer`,
    description: `Find natural farmers near ${region.name}, ${region.district}. Buy fresh produce directly with no middlemen.`,
  }
}

export default async function RegionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const { data: region } = await supabase
    .from('regions')
    .select('*')
    .eq('slug', slug)
    .eq('active', true)
    .single()

  if (!region) notFound()

  const { data: farmers } = await supabase
    .from('farmers')
    .select('*')
    .eq('region_slug', slug)
    .eq('active', true)
    .order('created_at', { ascending: true })

  const farmerIds = (farmers ?? []).map((f) => f.id)

  const { data: produce } = farmerIds.length
    ? await supabase
        .from('produce_listings')
        .select('*')
        .in('farmer_id', farmerIds)
        .in('status', CONSUMER_VISIBLE_STATUSES)
        .order('created_at', { ascending: false })
    : { data: [] }

  // Follower counts per farmer → rank the farmers list by popularity. Best-effort:
  // an absent farmer_follows table just leaves every count at 0.
  const followerCounts = new Map<string, number>()
  if (farmerIds.length) {
    const { data: follows } = await supabase
      .from('farmer_follows')
      .select('farmer_id')
      .in('farmer_id', farmerIds)
    for (const row of follows ?? []) {
      followerCounts.set(row.farmer_id, (followerCounts.get(row.farmer_id) ?? 0) + 1)
    }
  }
  const farmersWithFollowers = (farmers ?? []).map((f) => ({
    ...f,
    follower_count: followerCounts.get(f.id) ?? 0,
  }))

  return (
    <main className="min-h-screen bg-gray-50">
      <RegionTopBar region={region} />
      {/* The hero stat counts what a buyer can actually order today, so the
          sold-out listings we now render below are excluded from it. */}
      <RegionHero
        region={region}
        farmerCount={farmers?.length ?? 0}
        produceCount={(produce ?? []).filter((p) => p.status === 'available').length}
      />
      <RegionContent farmers={farmersWithFollowers} produce={produce ?? []} />
    </main>
  )
}

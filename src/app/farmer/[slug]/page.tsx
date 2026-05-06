import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'
import { Suspense } from 'react'
import TopNav from '@/components/farmer/TopNav'
import FarmCover from '@/components/farmer/FarmCover'
import TrustStrip from '@/components/farmer/TrustStrip'
import TabSection from '@/components/farmer/TabSection'
import { CartFab } from '@/components/consumer/Cart'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const { data: farmer } = await supabase
    .from('farmers')
    .select('id, name, village, district, story_quote')
    .eq('slug', slug)
    .single()

  if (!farmer) return { title: 'Farmer not found' }

  const { data: firstPhoto } = await supabase
    .from('media')
    .select('url')
    .eq('farmer_id', farmer.id)
    .eq('type', 'photo')
    .order('sort_order', { ascending: true })
    .limit(1)
    .single()

  const title = `${farmer.name} — Natural farmer in ${farmer.village}`
  const description =
    farmer.story_quote ??
    `Buy natural produce directly from ${farmer.name}, ${farmer.village}, ${farmer.district}. No middlemen. No chemicals.`

  return {
    title: `${farmer.name}'s Farm — YourFamilyFarmer`,
    description,
    openGraph: {
      title,
      description,
      siteName: 'YourFamilyFarmer',
      ...(firstPhoto?.url ? { images: [{ url: firstPhoto.url, width: 1200, height: 630, alt: `${farmer.name}'s farm` }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(firstPhoto?.url ? { images: [firstPhoto.url] } : {}),
    },
  }
}

export default async function FarmerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const { data: farmer } = await supabase
    .from('farmers')
    .select('*')
    .eq('slug', slug)
    .eq('active', true)
    .single()

  if (!farmer) notFound()

  const { data: produce } = await supabase
    .from('produce_listings')
    .select('*')
    .eq('farmer_id', farmer.id)
    .order('created_at', { ascending: false })

  const { data: reviews } = await supabase
    .from('reviews')
    .select('*')
    .eq('farmer_id', farmer.id)
    .eq('approved', true)
    .order('created_at', { ascending: false })

  const { data: media } = await supabase
    .from('media')
    .select('*')
    .eq('farmer_id', farmer.id)
    .order('sort_order', { ascending: true })

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      <TopNav regionSlug={farmer.region_slug} />
      <FarmCover farmer={farmer} />
      <TrustStrip farmer={farmer} produceCount={produce?.length ?? 0} />
      <Suspense fallback={null}>
        <TabSection
          farmer={farmer}
          produce={produce ?? []}
          reviews={reviews ?? []}
          media={media ?? []}
        />
      </Suspense>
      <CartFab />
    </main>
  )
}

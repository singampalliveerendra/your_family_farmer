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

  // Verified per-order buyer feedback (the ⭐ button consumers tap on their
  // orders) lives in produce_reviews, tied to a listing. Only feedback on a
  // completed order is approved/public. Surface it on the farmer's profile too —
  // tagged with the produce it was about — so consumer feedback isn't invisible
  // here, and fold it into the same Reviews tab + star average as written reviews.
  const { data: produceReviews } = await supabase
    .from('produce_reviews')
    .select('id, reviewer_name, star_rating, review_text, created_at, produce_listing_id')
    .eq('farmer_id', farmer.id)
    .eq('approved', true)
    .order('created_at', { ascending: false })

  // Resolve the produce names with a separate query rather than a PostgREST
  // embedded join (produce_reviews → produce_listings). That relationship isn't
  // in the schema cache, so embedding it made the whole produce_reviews query
  // error out and return null — which silently hid ALL verified buyer feedback
  // from the profile (showing "No reviews yet" and a 0 rating even when approved
  // reviews existed).
  const listingIds = [
    ...new Set((produceReviews ?? []).map((r) => r.produce_listing_id).filter(Boolean) as string[]),
  ]
  const { data: listingNames } = listingIds.length
    ? await supabase.from('produce_listings').select('id, name').in('id', listingIds)
    : { data: [] as { id: string; name: string }[] }
  const nameById = new Map((listingNames ?? []).map((l) => [l.id, l.name]))

  const mappedProduceReviews = (produceReviews ?? []).map((r) => ({
    id: r.id,
    reviewer_name: r.reviewer_name,
    star_rating: r.star_rating,
    review_text: r.review_text,
    produce_ordered: r.produce_listing_id ? nameById.get(r.produce_listing_id) ?? null : null,
    created_at: r.created_at,
  }))

  // Both sources, newest first — one combined list for the Reviews tab.
  const allReviews = [...(reviews ?? []), ...mappedProduceReviews].sort(
    (a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime(),
  )

  // Per-listing rating summary so the Produce tab can show each produce's own
  // verified buyer feedback (avg stars, count, latest snippet) on its card —
  // produceReviews is already ordered newest-first, so the first hit per listing
  // is the latest review.
  const reviewAcc = new Map<string, { sum: number; count: number; latest: { name: string; text: string | null; stars: number } | null }>()
  for (const r of produceReviews ?? []) {
    if (!r.produce_listing_id) continue
    const cur = reviewAcc.get(r.produce_listing_id) ?? { sum: 0, count: 0, latest: null }
    cur.sum += (r.star_rating as number) ?? 0
    cur.count += 1
    if (!cur.latest) cur.latest = { name: r.reviewer_name, text: r.review_text, stars: (r.star_rating as number) ?? 0 }
    reviewAcc.set(r.produce_listing_id, cur)
  }
  const produceReviewSummary: Record<string, { avg: number; count: number; latest: { name: string; text: string | null; stars: number } | null }> = {}
  reviewAcc.forEach((v, k) => {
    produceReviewSummary[k] = { avg: Math.round((v.sum / v.count) * 10) / 10, count: v.count, latest: v.latest }
  })

  // Star rating shown in the trust strip reflects all real feedback (written
  // reviews + verified order feedback). Falls back to the stored value if there
  // are no reviews yet.
  const ratingAvg =
    allReviews.length > 0
      ? Math.round(
          (allReviews.reduce((sum, r) => sum + ((r.star_rating as number) ?? 0), 0) / allReviews.length) * 10,
        ) / 10
      : (farmer.rating_avg ?? 0)

  const { data: media } = await supabase
    .from('media')
    .select('*')
    .eq('farmer_id', farmer.id)
    .order('sort_order', { ascending: true })

  // Real "Buyers" stat — distinct consumers who ordered from this farmer.
  // farmers.buyer_count is never maintained (always 0); orders are RLS-locked,
  // so we read it through the farmer_buyer_count SECURITY DEFINER function.
  const { data: buyerCount } = await supabase.rpc('farmer_buyer_count', { p_farmer_id: farmer.id })
  const realBuyerCount = typeof buyerCount === 'number' ? buyerCount : (farmer.buyer_count ?? 0)

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      <TopNav regionSlug={farmer.region_slug} />
      <FarmCover farmer={farmer} />
      {/* Count only live listings — a produce the farmer has suspended (or that
          is still "coming soon") must not inflate the public "Produce now" stat. */}
      <TrustStrip
        farmer={{ ...farmer, rating_avg: ratingAvg, buyer_count: realBuyerCount }}
        produceCount={(produce ?? []).filter((p) => (p as { status?: string }).status === 'available').length}
      />
      <Suspense fallback={null}>
        <TabSection
          farmer={farmer}
          produce={produce ?? []}
          reviews={allReviews}
          produceReviews={produceReviewSummary}
          media={media ?? []}
        />
      </Suspense>
      <CartFab />
    </main>
  )
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  // Anti-spam: 5 reviews per phone per day, 20 per IP per day.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`review:ip:${ip}`, 20, 24 * 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many reviews from this network.' }, { status: 429 })
  }

  try {
    const body = await req.json()
    const farmer_id: unknown = body.farmer_id
    const reviewer_name: unknown = body.reviewer_name
    const reviewer_phone: unknown = body.reviewer_phone
    const star_rating: unknown = body.star_rating
    const review_text: unknown = body.review_text
    const produce_ordered: unknown = body.produce_ordered

    if (typeof farmer_id !== 'string' || !UUID_RE.test(farmer_id)) {
      return NextResponse.json({ error: 'Invalid farmer id.' }, { status: 400 })
    }
    if (typeof reviewer_name !== 'string' || !reviewer_name.trim()) {
      return NextResponse.json({ error: 'Reviewer name is required.' }, { status: 400 })
    }
    if (typeof star_rating !== 'number' || star_rating < 1 || star_rating > 5) {
      return NextResponse.json({ error: 'Rating must be 1-5.' }, { status: 400 })
    }

    // Phone is required so each reviewer is uniquely identifiable for the
    // duplicate-check below. Without it any troll can flood reviews.
    const phoneDigits = reviewer_phone ? String(reviewer_phone).replace(/\D/g, '').slice(-10) : ''
    if (phoneDigits.length !== 10) {
      return NextResponse.json({ error: 'Enter your phone to submit a review.' }, { status: 400 })
    }

    // Per-phone burst guard — same phone can submit at most 5 reviews / day total.
    if (!rateLimit(`review:phone:${phoneDigits}`, 5, 24 * 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'You\'ve submitted too many reviews recently.' }, { status: 429 })
    }

    const trimmedName = reviewer_name.trim().slice(0, 80)
    const trimmedText = typeof review_text === 'string' ? review_text.trim().slice(0, 1000) : ''
    const trimmedProduce = typeof produce_ordered === 'string' ? produce_ordered.trim().slice(0, 100) : ''

    // Require service role — never fall back to anon (would mask RLS misconfig
    // and let the route silently break in production).
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      console.error('[YFF reviews] SUPABASE_SERVICE_ROLE_KEY missing')
      return NextResponse.json({ error: 'Reviews service is misconfigured.' }, { status: 500 })
    }
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('farmer_id', farmer_id)
      .eq('reviewer_phone', phoneDigits)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ error: 'already_reviewed' }, { status: 409 })
    }

    const insertPayload: Record<string, unknown> = {
      farmer_id,
      reviewer_name: trimmedName,
      reviewer_phone: phoneDigits,
      star_rating,
      review_text: trimmedText || null,
      produce_ordered: trimmedProduce || null,
      approved: true,
    }

    const { data: review, error } = await supabase
      .from('reviews')
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: allReviews } = await supabase
      .from('reviews')
      .select('star_rating')
      .eq('farmer_id', farmer_id)
      .eq('approved', true)

    if (allReviews && allReviews.length > 0) {
      const avg =
        allReviews.reduce((sum: number, r: { star_rating: number }) => sum + r.star_rating, 0) /
        allReviews.length
      await supabase
        .from('farmers')
        .update({
          rating_avg: Math.round(avg * 10) / 10,
          buyer_count: allReviews.length,
        })
        .eq('id', farmer_id)
    }

    return NextResponse.json({ review })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

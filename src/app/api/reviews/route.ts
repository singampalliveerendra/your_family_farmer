import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { farmer_id, reviewer_name, reviewer_phone, star_rating, review_text, produce_ordered } = body

    if (!farmer_id || !reviewer_name?.trim() || !star_rating) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (star_rating < 1 || star_rating > 5) {
      return NextResponse.json({ error: 'Invalid rating' }, { status: 400 })
    }

    const phone = reviewer_phone ? String(reviewer_phone).replace(/\D/g, '').slice(-10) : null

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Check for an existing review from the same phone on this farmer
    if (phone) {
      const { data: existing } = await supabase
        .from('reviews')
        .select('id')
        .eq('farmer_id', farmer_id)
        .eq('reviewer_phone', phone)
        .maybeSingle()
      if (existing) {
        return NextResponse.json({ error: 'already_reviewed' }, { status: 409 })
      }
    }

    const insertPayload: Record<string, unknown> = {
      farmer_id,
      reviewer_name: reviewer_name.trim(),
      star_rating,
      review_text: review_text?.trim() || null,
      produce_ordered: produce_ordered?.trim() || null,
      approved: true,
    }
    if (phone) insertPayload.reviewer_phone = phone

    const { data: review, error } = await supabase
      .from('reviews')
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Recalculate rating_avg and buyer_count from all approved reviews
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

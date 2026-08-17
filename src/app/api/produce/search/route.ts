import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { purchaseCountsFor } from '@/lib/purchaseCounts'
import { CONSUMER_VISIBLE_STATUSES } from '@/lib/produceStatus'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  vegetables: [
    'tomato', 'capsicum', 'brinjal', 'eggplant', 'bean', 'pea', 'pumpkin',
    'gourd', 'onion', 'potato', 'garlic', 'carrot', 'radish', 'cucumber',
    'okra', 'ladyfinger', 'drumstick', 'ridge gourd', 'bottle gourd', 'chilli',
    'pepper', 'bitter gourd', 'cluster bean', 'snake gourd',
  ],
  fruits: [
    'mango', 'banana', 'papaya', 'guava', 'pomegranate', 'orange', 'lime',
    'lemon', 'coconut', 'tamarind', 'jackfruit', 'sapota', 'fig', 'grapes',
    'watermelon', 'muskmelon', 'pineapple', 'custard apple',
  ],
  grains: [
    'rice', 'wheat', 'jowar', 'bajra', 'ragi', 'maize', 'corn', 'dal',
    'lentil', 'chickpea', 'groundnut', 'sesame', 'turmeric', 'ginger',
    'pulses', 'toor', 'moong', 'urad', 'chana',
  ],
  leafy: [
    'spinach', 'methi', 'fenugreek', 'coriander', 'mint', 'curry',
    'amaranth', 'sorrel', 'moringa', 'drumstick leaves', 'palak',
  ],
  spices: [
    'turmeric', 'ginger', 'chilli', 'pepper', 'cardamom', 'clove',
    'cinnamon', 'cumin', 'coriander seed', 'mustard', 'fenugreek seed',
    'tamarind', 'curry leaf', 'garlic', 'nutmeg', 'fennel', 'asafoetida',
  ],
  // 'other' is a catch-all with no keyword guesses — it matches only listings
  // the farmer explicitly tagged as 'other'.
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''
  const method = searchParams.get('method') ?? ''
  const category = searchParams.get('category') ?? ''

  const { data: produce } = await supabase
    .from('produce_listings')
    // Sold-out produce still answers "does this farmer grow tomatoes?", so it
    // stays searchable and renders greyed rather than vanishing from results.
    .select('*')
    .in('status', CONSUMER_VISIBLE_STATUSES)
    .order('created_at', { ascending: false })

  let filtered = produce ?? []

  if (q) {
    const query = q.toLowerCase()
    filtered = filtered.filter(
      (p) =>
        p.name?.toLowerCase().includes(query) ||
        p.variety?.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query)
    )
  }

  if (method && method !== 'all') {
    filtered = filtered.filter((p) =>
      p.method?.toLowerCase().includes(method.toLowerCase())
    )
  }

  if (category && category !== 'all') {
    const keywords = CATEGORY_KEYWORDS[category] ?? []
    // Prefer the farmer's explicit category (#9); only fall back to guessing from
    // the crop name for older listings that don't have a category set yet.
    filtered = filtered.filter((p) =>
      p.category
        ? p.category === category
        : keywords.some((kw) => p.name?.toLowerCase().includes(kw))
    )
  }

  if (!filtered.length) return NextResponse.json([])

  const farmerIds = [...new Set(filtered.map((p) => p.farmer_id))]

  const { data: farmers } = await supabase
    .from('farmers')
    .select('id, name, village, slug, phone, method, pickup_locations, pickup_slots, pickup_location_phones, account_type')
    .in('id', farmerIds)
    .eq('active', true)

  const farmerMap = Object.fromEntries((farmers ?? []).map((f) => [f.id, f]))

  const result = filtered
    .map((p) => ({ ...p, farmer: farmerMap[p.farmer_id] ?? null }))
    .filter((p) => p.farmer !== null)

  // Popularity count so the "sort by Purchases" option works while searching too.
  const counts = await purchaseCountsFor(result.map((p) => p.id as string))
  const withCounts = result.map((p) => ({ ...p, purchase_count: counts[p.id as string] ?? 0 }))

  return NextResponse.json(withCounts)
}

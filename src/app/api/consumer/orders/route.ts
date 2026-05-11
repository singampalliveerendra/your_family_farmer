import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ orders: [] }, { status: 200 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: orders, error } = await supabase
    .from('orders')
    .select(
      'id, produce_name, quantity, unit, total_price, pickup_location, status, payment_method, payment_status, decline_reason, payment_proof_path, created_at, farmer_id',
    )
    .eq('consumer_id', session.consumerId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Manual join — orders.farmer_id has no FK constraint, so PostgREST can't
  // embed the farmer resource for us. One extra query keeps it simple.
  const farmerIds = [...new Set((orders ?? []).map((o) => o.farmer_id).filter(Boolean))]
  let farmerMap: Record<string, { name: string; slug: string; village: string; phone: string | null; upi_id: string | null }> = {}
  if (farmerIds.length > 0) {
    const { data: farmers } = await supabase
      .from('farmers')
      .select('id, name, slug, village, phone, upi_id')
      .in('id', farmerIds)
    farmerMap = Object.fromEntries(
      (farmers ?? []).map((f) => [
        f.id,
        { name: f.name, slug: f.slug, village: f.village, phone: f.phone ?? null, upi_id: (f.upi_id as string | null) ?? null },
      ]),
    )
  }

  const enriched = (orders ?? []).map((o) => ({ ...o, farmer: farmerMap[o.farmer_id] ?? null }))
  return NextResponse.json({ orders: enriched })
}

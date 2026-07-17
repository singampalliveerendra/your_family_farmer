import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/farmer/orders/riders            → every assigned rider, keyed by order id
// GET /api/farmer/orders/riders?orderId=…  → just that order's rider
//
// The farmer's browser cannot read `delivery_boys` directly: that table is
// service-role only (RLS on, zero policies) precisely so the anon key — which
// ships to every visitor — can't enumerate every rider's phone number. So the
// contact comes through here instead, the same way the consumer's order route
// does it. Two rules keep the exposure minimal:
//   1. only orders belonging to the logged-in farmer are considered, and
//   2. only riders actually assigned to those orders are returned, name+phone
//      only — never the rider list, never other columns.
export async function GET(req: NextRequest) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const orderId = req.nextUrl.searchParams.get('orderId')
  if (orderId && !UUID_RE.test(orderId)) {
    return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let q = supabase
    .from('orders')
    .select('id, delivery_boy_id')
    .eq('farmer_id', session.farmerId)
    .not('delivery_boy_id', 'is', null)
  if (orderId) q = q.eq('id', orderId)

  const { data: orders, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const riderIds = [...new Set((orders ?? [])
    .map((o) => o.delivery_boy_id)
    .filter((v): v is string => !!v))]
  if (riderIds.length === 0) return NextResponse.json({ riders: {} })

  const { data: riders, error: riderErr } = await supabase
    .from('delivery_boys')
    .select('id, name, phone')
    .in('id', riderIds)
  if (riderErr) return NextResponse.json({ error: riderErr.message }, { status: 500 })

  const byRiderId = new Map(
    (riders ?? []).map((r) => [r.id as string, { name: (r.name as string | null) ?? null, phone: r.phone as string }]),
  )

  const out: Record<string, { name: string | null; phone: string }> = {}
  for (const o of orders ?? []) {
    const r = o.delivery_boy_id ? byRiderId.get(o.delivery_boy_id) : null
    if (r) out[o.id as string] = r
  }

  return NextResponse.json({ riders: out })
}

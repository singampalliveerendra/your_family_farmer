import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// GET /api/moderator/orders/lookup?code=YFF-1042
//   → resolves an order code to its buyer name + phone (zone-scoped).
// GET /api/moderator/orders/lookup?phone=9876543210
//   → resolves a phone number to the name on file (farmer in this zone first,
//     then any consumer with that number). Used by the "Log a complaint" form to
//     auto-fill "raised by". Returns 404 when nothing matches so the form can
//     quietly skip the auto-fill rather than show a hard error.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone()
  const supabase = svc()

  // ── Phone → name lookup ──
  const phoneRaw = (req.nextUrl.searchParams.get('phone') ?? '').replace(/\D/g, '').slice(-10)
  if (phoneRaw) {
    if (phoneRaw.length !== 10) return NextResponse.json({ error: 'Invalid phone.' }, { status: 400 })

    // A farmer in this zone takes priority over a consumer with the same number.
    const { data: farmer } = await supabase
      .from('farmers').select('name').eq('phone', phoneRaw).eq('region_slug', zone).maybeSingle()
    if (farmer?.name) return NextResponse.json({ name: farmer.name, role: 'farmer' })

    const { data: consumer } = await supabase
      .from('consumers_auth').select('name').eq('phone', phoneRaw).maybeSingle()
    if (consumer?.name) return NextResponse.json({ name: consumer.name, role: 'consumer' })

    return NextResponse.json({ error: 'No one found with that number.' }, { status: 404 })
  }

  // ── Order code → buyer name + phone lookup ──
  const code = (req.nextUrl.searchParams.get('code') ?? '').trim()
  if (!code) return NextResponse.json({ error: 'Order code or phone required.' }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('order_code, farmer_id, buyer_name, buyer_phone')
    .eq('order_code', code)
    .maybeSingle()
  if (!order?.farmer_id) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })

  const { data: farmer } = await supabase
    .from('farmers').select('region_slug').eq('id', order.farmer_id).maybeSingle()
  if (farmer?.region_slug !== zone) {
    return NextResponse.json({ error: 'Order not in your zone.' }, { status: 404 })
  }

  return NextResponse.json({
    order_code: order.order_code,
    buyer_name: order.buyer_name ?? null,
    buyer_phone: order.buyer_phone ?? null,
  })
}

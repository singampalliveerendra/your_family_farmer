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
// Resolves an order code to its buyer name + phone, but only for orders from a
// farmer in this moderator's zone. Used by the "Log a complaint" form to
// auto-fill "raised by" and the callback number. Returns 404 when not found so
// the form can quietly clear the auto-fill rather than show a hard error.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const code = (req.nextUrl.searchParams.get('code') ?? '').trim()
  if (!code) return NextResponse.json({ error: 'Order code required.' }, { status: 400 })

  const zone = getModeratorZone()
  const supabase = svc()

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

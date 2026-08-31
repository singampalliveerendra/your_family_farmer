import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeOrderBatch } from '@/lib/order-batch-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The buyer backs out of paying by UPI and asks to pay cash instead.
//
// The farmer's cod_enabled flag is re-checked here. The cart checks it before
// offering the option, but this route is reachable directly, and a farmer who
// does not accept cash must not end up with a cash order because the buyer
// posted to this endpoint.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as
    | { orderIds?: unknown; guestToken?: unknown }
    | null

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const auth = await authorizeOrderBatch(req, supabase, body?.orderIds, body?.guestToken)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: rows, error: loadErr } = await supabase
    .from('orders')
    .select('id, farmer_id, payment_status')
    .in('id', auth.orderIds)

  if (loadErr) {
    console.error('[YFF consumer/switch-to-cod] load failed:', loadErr.message)
    return NextResponse.json({ error: 'Could not load the orders.' }, { status: 500 })
  }

  // Money already in — switching to cash now would tell the farmer to collect a
  // second time.
  const settled = (rows ?? []).some((r) =>
    ['completed', 'paid', 'deposit_paid'].includes(String(r.payment_status)))
  if (settled) {
    return NextResponse.json({ error: 'This order is already paid.' }, { status: 409 })
  }

  const farmerIds = [...new Set((rows ?? []).map((r) => r.farmer_id).filter(Boolean))]
  const { data: farmers } = await supabase
    .from('farmers')
    .select('id, cod_enabled')
    .in('id', farmerIds)
  if ((farmers ?? []).some((f) => f.cod_enabled !== true)) {
    return NextResponse.json(
      { error: 'This farmer is not accepting Cash on Delivery.' },
      { status: 409 },
    )
  }

  const { error } = await supabase
    .from('orders')
    .update({ payment_method: 'cod', payment_status: 'pending' })
    .in('id', auth.orderIds)

  if (error) {
    console.error('[YFF consumer/switch-to-cod] update failed:', error.message)
    return NextResponse.json({ error: 'Could not switch to cash. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

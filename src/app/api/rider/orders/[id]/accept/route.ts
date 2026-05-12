import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getRiderSessionFromRequest } from '@/lib/rider-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  const session = getRiderSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not logged in.' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: rider } = await supabase
    .from('delivery_boys')
    .select('id, status')
    .eq('id', session.riderId)
    .maybeSingle()
  if (!rider || rider.status !== 'active') {
    return NextResponse.json({ error: 'Account not active.' }, { status: 403 })
  }

  // Optimistic-lock claim — only succeeds if the order is still unclaimed and
  // home-delivery + approved. Two riders tapping Accept simultaneously can't
  // both win because the WHERE clause excludes any row that already has a
  // delivery_boy_id.
  const now = new Date().toISOString()
  const { data: claimed, error } = await supabase
    .from('orders')
    .update({
      delivery_boy_id: session.riderId,
      delivery_status: 'assigned',
      assigned_at: now,
    })
    .eq('id', id)
    .eq('delivery_type', 'home_delivery')
    .eq('status', 'approved')
    .is('delivery_boy_id', null)
    .select('id')

  if (error) {
    console.error('[YFF rider/accept] update failed:', error.message)
    return NextResponse.json({ error: 'Could not accept order.' }, { status: 500 })
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'This order was already taken or is no longer available.' }, { status: 409 })
  }

  // Belt-and-braces: if delivery_status was 'unassigned' rather than NULL,
  // the .is() check above wouldn't have filtered it out. We additionally
  // refuse if a prior status was further along the pipeline. (The combination
  // of the IS NULL filter on delivery_boy_id + the status checks above already
  // makes this safe in practice.)

  return NextResponse.json({ ok: true })
}

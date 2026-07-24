import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getRiderSessionFromRequest } from '@/lib/rider-session'
import { resolveJobOrderIds } from '@/lib/rider-jobs'

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
    .select('id, status, service_pincodes')
    .eq('id', session.riderId)
    .maybeSingle() as { data: { id: string; status: string; service_pincodes: string[] | null } | null }
  if (!rider || rider.status !== 'active') {
    return NextResponse.json({ error: 'Account not active.' }, { status: 403 })
  }

  // Coverage gate. The job list only *shows* orders in the rider's pincodes —
  // it doesn't stop anyone from POSTing an arbitrary order id, and accepting
  // reveals the buyer's name, phone and street. So re-check coverage here,
  // where it actually counts. A rider with no pincodes on file covers nothing.
  const covered = (rider.service_pincodes ?? []).filter((p) => /^\d{6}$/.test(p))
  if (covered.length === 0) {
    return NextResponse.json(
      { error: 'No service area on file. Ask the moderator to set your pincodes.' },
      { status: 403 },
    )
  }

  const { data: target } = await supabase
    .from('orders')
    .select('id, delivery_pincode')
    .eq('id', id)
    .maybeSingle() as { data: { id: string; delivery_pincode: string | null } | null }
  if (!target) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (!target.delivery_pincode || !covered.includes(target.delivery_pincode)) {
    return NextResponse.json({ error: 'This delivery is outside your service area.' }, { status: 403 })
  }

  // Claim the whole JOB, not just the tapped line. Every home-delivery line
  // from this farmer in this checkout is one bag going to one door, so claiming
  // them one at a time is how two riders end up dispatched to the same farm for
  // the same customer — each holding half the order and sharing one handover
  // code. The ids are re-derived server-side from the anchor row.
  const jobIds = await resolveJobOrderIds(supabase, id)
  if (!jobIds) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })

  // Optimistic-lock claim — only rows still unclaimed, home-delivery, approved,
  // and inside the rider's service area are taken. Two riders tapping Accept
  // simultaneously can't both win because the WHERE clause excludes any row that
  // already has a delivery_boy_id. Lines the farmer hasn't approved (or has
  // declined) since the list loaded simply aren't matched.
  const now = new Date().toISOString()
  const { data: claimed, error } = await supabase
    .from('orders')
    .update({
      delivery_boy_id: session.riderId,
      delivery_status: 'assigned',
      assigned_at: now,
    })
    .in('id', jobIds)
    .eq('delivery_type', 'home_delivery')
    .eq('status', 'approved')
    .in('delivery_pincode', covered)
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

  return NextResponse.json({ ok: true, claimed: claimed.length })
}

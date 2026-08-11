import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getRiderSessionFromRequest } from '@/lib/rider-session'
import { rateLimit } from '@/lib/rate-limit'
import { cashDue } from '@/lib/payment'
import { resolveJobOrderIds } from '@/lib/rider-jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  const session = getRiderSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not logged in.' }, { status: 401 })

  // Anti-guessing: 6 OTP attempts per rider+order per 10 min. After that, the
  // rider needs to call the owner — the OTP is only 4 digits.
  if (!rateLimit(`rider-otp:${session.riderId}:${id}`, 6, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many wrong codes. Please contact the owner.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const otp = String((body && (body as { otp?: unknown }).otp) ?? '').trim()
  if (!/^\d{4}$/.test(otp)) return NextResponse.json({ error: 'Enter the 4-digit code from the customer.' }, { status: 400 })

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

  // One handover closes the whole job: every line from this farmer in this
  // checkout is in the same bag, against the same code. They also share one
  // handover_otp, since the batch was written by a single place-order call.
  const jobIds = await resolveJobOrderIds(supabase, id)
  if (!jobIds) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })

  type Row = {
    id: string; delivery_boy_id: string | null; delivery_status: string | null
    handover_otp: string | null; payment_status: string | null; cod_balance_due: number | null
  }
  const { data: rows } = await supabase
    .from('orders')
    .select('id, delivery_boy_id, delivery_status, handover_otp, payment_status, cod_balance_due')
    .in('id', jobIds) as { data: Row[] | null }

  if (!rows || rows.length === 0) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })

  const ours = rows.filter((r) => r.delivery_boy_id === session.riderId)
  if (ours.length === 0) {
    return NextResponse.json({ error: 'Not your delivery.' }, { status: 403 })
  }
  // Only the lines still awaiting handover. Anything already delivered is left
  // alone, which also makes a retry after a partial write safe.
  const pending = ours.filter((r) => r.delivery_status === 'out_for_delivery')
  if (pending.length === 0) {
    return NextResponse.json({ error: 'Mark the order as out for delivery first.' }, { status: 409 })
  }

  const expectedOtp = pending.find((r) => r.handover_otp)?.handover_otp
  if (!expectedOtp || !safeEqual(expectedOtp, otp)) {
    return NextResponse.json({ error: 'Wrong code. Ask the customer to read it again.' }, { status: 401 })
  }

  // Part-paid COD: the deposit came in online, the rest is cash at the door.
  // The rider must confirm they actually took it — the correct handover code
  // only proves they reached the right customer, not that money changed hands.
  // Collecting it flips those orders to fully paid ('completed'). The buyer
  // hands over ONE amount for the bag, so this is the sum across the job.
  const balanceDue = pending.reduce((s, r) => s + cashDue(r), 0)
  if (balanceDue > 0) {
    const collected = (body && (body as { cashCollected?: unknown }).cashCollected) === true
    if (!collected) {
      return NextResponse.json(
        { error: `Collect ₹${balanceDue} in cash from the customer, then confirm.`, cashDue: balanceDue },
        { status: 409 },
      )
    }
  }

  const now = new Date().toISOString()
  // The payment columns are written only to the rows that actually owed cash,
  // so a fully-prepaid line can never be re-stamped as cash-collected.
  const cashIds = pending.filter((r) => cashDue(r) > 0).map((r) => r.id)
  const plainIds = pending.filter((r) => cashDue(r) <= 0).map((r) => r.id)

  const markDelivered = async (ids: string[], withCash: boolean) => {
    if (ids.length === 0) return { count: 0, failed: false }
    const { data, error } = await supabase
      .from('orders')
      .update({
        delivery_status: 'delivered',
        delivered_at: now,
        ...(withCash
          ? {
            payment_status: 'completed',
            paid_at: now,
            cash_collected_at: now,
            cash_collected_by: session.riderId,
            cod_balance_due: 0,
          }
          : {}),
      })
      .in('id', ids)
      .eq('delivery_boy_id', session.riderId)
      .eq('delivery_status', 'out_for_delivery')
      .select('id')
    if (error) {
      console.error('[YFF rider/deliver] update failed:', error.message)
      return { count: 0, failed: true }
    }
    return { count: data?.length ?? 0, failed: false }
  }

  // Cash rows first: if the second write fails, the money is already recorded
  // (the thing we must never lose) and the rider can safely retry — the retry
  // skips rows that are already delivered.
  const cashRes = await markDelivered(cashIds, true)
  const plainRes = await markDelivered(plainIds, false)

  if (cashRes.failed || plainRes.failed) {
    return NextResponse.json({ error: 'Could not mark delivered.' }, { status: 500 })
  }
  const delivered = cashRes.count + plainRes.count
  if (delivered === 0) {
    return NextResponse.json({ error: 'Could not mark delivered. Refresh and try again.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, delivered })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeOrderBatch } from '@/lib/order-batch-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The buyer says they have paid the farmer by UPI, optionally quoting the UTR
// (their bank's transaction reference). This does NOT mark the order paid — it
// moves it to 'pending_confirmation' so the farmer can check their own bank and
// confirm via /api/farmer/orders/[id]/payment-status.
//
// Previously this was a direct browser write to `orders`. Two things were wrong
// with that: the update was unscoped (any order id, not just the caller's), and
// `payment_status` was writable to any value — including 'completed', which is
// the farmer's to set after seeing the money.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as
    | { orderIds?: unknown; utr?: unknown; guestToken?: unknown }
    | null

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const auth = await authorizeOrderBatch(req, supabase, body?.orderIds, body?.guestToken)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const utr = String(body?.utr ?? '').trim().slice(0, 40)
  const patch: Record<string, unknown> = { payment_status: 'pending_confirmation' }
  if (utr) patch.utr_number = utr

  // Guarded so a double-tap (or a resumed checkout screen) cannot drag an order
  // the farmer has already settled back into 'pending_confirmation'.
  const { data, error } = await supabase
    .from('orders')
    .update(patch)
    .in('id', auth.orderIds)
    .not('payment_status', 'in', '("completed","paid","deposit_paid")')
    .select('id, payment_status, utr_number')

  if (error) {
    console.error('[YFF consumer/payment-claimed] update failed:', error.message)
    return NextResponse.json({ error: 'Could not record your payment. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: data?.length ?? 0 })
}

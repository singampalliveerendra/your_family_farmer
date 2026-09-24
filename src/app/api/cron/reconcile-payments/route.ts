import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getSettlement } from '@/lib/cashfree'
import { markCashfreePaid } from '@/lib/cashfree-settle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Safety net for the rare order that stays "pending" after a payment — e.g.
// the buyer paid but both the browser /verify AND the webhook were missed.
// Runs on a Vercel cron (see vercel.json). For each pending Cashfree order
// older than 15 minutes we ask Cashfree what really happened and mark it
// paid if it settled in full.
//
// Authorised by CRON_SECRET: Vercel automatically sends it as a Bearer token,
// so external callers can't trigger it.
//
// A missing CRON_SECRET is a MISCONFIGURATION, not permission to skip the check.
// This used to be `if (secret) { ...verify... }`, which meant forgetting the env
// var silently published the endpoint — and it loops over pending orders hitting
// the Cashfree API, so an open one is both a data leak and a way to burn our
// rate limit. Fail closed instead.
const STALE_MINUTES = 15
const BATCH_LIMIT = 100

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[YFF cron/reconcile-payments] CRON_SECRET is not set — refusing to run.')
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString()

  // Pending rows that opened a Cashfree order. payment_method is 'cashfree' for
  // prepaid carts and 'cod' for a part-paid COD deposit — both are settled by
  // the same Cashfree order, so filter on the order id, not the method.
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, cashfree_order_id, created_at')
    .in('payment_status', ['pending', 'failed'])
    .not('cashfree_order_id', 'is', null)
    .lt('created_at', cutoff)
    .limit(BATCH_LIMIT)

  if (error) {
    console.error('[YFF] reconcile query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Distinct Cashfree order ids (a cart shares one across its rows).
  const cfIds = [...new Set((orders ?? []).map((o) => o.cashfree_order_id as string).filter(Boolean))]

  let reconciled = 0
  const errors: string[] = []

  for (const cfId of cfIds) {
    try {
      const s = await getSettlement(cfId)
      if (!s.paid) continue
      const err = await markCashfreePaid(supabase, { cashfreeOrderId: cfId, paymentId: s.paymentId, label: s.label })
      if (err) errors.push(`${cfId}: ${err}`)
      else reconciled += 1
    } catch (e) {
      errors.push(`${cfId}: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    checked: cfIds.length,
    reconciled,
    errors: errors.length ? errors : undefined,
  })
}

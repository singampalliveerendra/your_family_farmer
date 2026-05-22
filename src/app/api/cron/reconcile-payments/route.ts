import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { fetchOrderPayments } from '@/lib/razorpay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Safety net for the rare order that stays "pending" after a payment — e.g.
// the buyer paid but both the browser /verify AND the webhook were missed.
// Runs on a Vercel cron (see vercel.json). For each pending Razorpay order
// older than 15 minutes we ask Razorpay what really happened and mark it
// paid if a payment was captured.
//
// Authorised by CRON_SECRET: Vercel automatically sends it as a Bearer token
// when the CRON_SECRET env var is set, so external callers can't trigger it.
const STALE_MINUTES = 15
const BATCH_LIMIT = 100

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString()

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, razorpay_order_id, created_at')
    .eq('payment_method', 'razorpay')
    .eq('payment_status', 'pending')
    .not('razorpay_order_id', 'is', null)
    .lt('created_at', cutoff)
    .limit(BATCH_LIMIT)

  if (error) {
    console.error('[YFF] reconcile query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Distinct Razorpay order ids (a cart shares one across its rows).
  const orderIds = [...new Set((orders ?? []).map((o) => o.razorpay_order_id as string).filter(Boolean))]

  let reconciled = 0
  const errors: string[] = []

  for (const rzpId of orderIds) {
    try {
      const payments = await fetchOrderPayments(rzpId)
      const captured = payments.find((p) => p.status === 'captured')
      if (captured) {
        const { error: updErr } = await supabase
          .from('orders')
          .update({ payment_status: 'paid', razorpay_payment_id: captured.id })
          .eq('razorpay_order_id', rzpId)
          .neq('payment_status', 'paid')
        if (updErr) errors.push(`${rzpId}: ${updErr.message}`)
        else reconciled += 1
      }
    } catch (e) {
      errors.push(`${rzpId}: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    checked: orderIds.length,
    reconciled,
    errors: errors.length ? errors : undefined,
  })
}

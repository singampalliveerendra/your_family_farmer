import type { SupabaseClient } from '@supabase/supabase-js'
import { getSettlement, isSafeToAbandon, terminateCashfreeOrder } from '@/lib/cashfree'
import { ABANDON_REASON, markCashfreePaid } from '@/lib/cashfree-settle'
import { hasMoneyIn } from '@/lib/payment'

/* Server steps of a bulk purchase that touch the database, shared by the
 * aggregator bulk-order routes (Phase 6). Payment settling itself is the
 * shop's own markCashfreePaid — a bulk order is an ordinary orders row — so
 * the webhook and the nightly reconcile already cover it. */

/** The moderator's platform fee on bulk orders (0% unless set). Never throws. */
export async function getBulkFeePercent(supabase: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await supabase.from('platform_settings').select('bulk_fee_percent').eq('id', 1).maybeSingle()
    if (error || !data) return 0
    const n = Number((data as { bulk_fee_percent?: unknown }).bulk_fee_percent)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

type OrderRow = {
  id: string
  buyer_aggregator_id: string | null
  status: string
  payment_status: string | null
  quantity: number | null
  produce_listing_id: string | null
  harvest_id: string | null
  cashfree_order_id: string | null
}

/**
 * The aggregator closed the Cashfree checkout without paying. The same care
 * as the shop's /api/orders/abandon (the YFF-20261029-0383 lesson): ask
 * Cashfree first — record a late payment as paid, leave a payment still in
 * flight alone, terminate an open order and believe only Cashfree's state
 * afterwards — and only then cancel the unpaid row and give its stock back.
 */
export async function abandonBulkCheckout(
  supabase: SupabaseClient,
  aggregatorId: string,
  cashfreeOrderId: string,
): Promise<{ cancelled: number; paid: boolean; processing: boolean }> {
  const { data } = await supabase
    .from('orders')
    .select('id, buyer_aggregator_id, status, payment_status, quantity, produce_listing_id, harvest_id, cashfree_order_id')
    .eq('cashfree_order_id', cashfreeOrderId)
  const rows = ((data ?? []) as OrderRow[]).filter((o) => o.buyer_aggregator_id === aggregatorId)
  if (!rows.length) return { cancelled: 0, paid: false, processing: false }

  try {
    const before = await getSettlement(cashfreeOrderId)
    if (before.paid) {
      await markCashfreePaid(supabase, { cashfreeOrderId, paymentId: before.paymentId, label: before.label })
      return { cancelled: 0, paid: true, processing: false }
    }
    if (before.inFlight) return { cancelled: 0, paid: false, processing: true }
    await terminateCashfreeOrder(cashfreeOrderId)
    const after = await getSettlement(cashfreeOrderId)
    if (after.paid) {
      await markCashfreePaid(supabase, { cashfreeOrderId, paymentId: after.paymentId, label: after.label })
      return { cancelled: 0, paid: true, processing: false }
    }
    if (!isSafeToAbandon(after)) return { cancelled: 0, paid: false, processing: true }
  } catch (e) {
    // Unknown state: never cancel what might be paid. Reconcile settles it.
    console.error('[YFF bulk abandon] settlement lookup failed:', cashfreeOrderId, e)
    return { cancelled: 0, paid: false, processing: true }
  }

  let cancelled = 0
  for (const o of rows) {
    if (o.status !== 'pending' || hasMoneyIn(o.payment_status)) continue
    const { data: flipped } = await supabase
      .from('orders')
      .update({ status: 'cancelled', decline_reason: ABANDON_REASON })
      .eq('id', o.id)
      .eq('status', 'pending')
      .select('id')
    if (!Array.isArray(flipped) || !flipped.length) continue
    cancelled++
    if (o.quantity && o.quantity > 0) {
      try {
        if (o.harvest_id) await supabase.rpc('increment_harvest_stock', { p_harvest_id: o.harvest_id, p_qty: o.quantity })
        else if (o.produce_listing_id) await supabase.rpc('increment_stock', { p_listing_id: o.produce_listing_id, p_qty: o.quantity })
      } catch (e) {
        console.error('[YFF bulk abandon] restock failed:', e)
      }
    }
  }
  return { cancelled, paid: false, processing: false }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyOrdersPlaced } from '@/lib/orderNotify'
import { alertWholesaleLowStock } from '@/lib/wholesaleLowStockAlert'

// Record a confirmed Cashfree payment on every order row of its cart. Shared by
// /verify (browser), the webhook, and the reconcile cron, which can race each
// other — so both updates are guarded and running this twice changes nothing.
//
// Split by payment method because a captured payment means different things.
// On a COD order it is only the DEPOSIT: the buyer still owes cash at the door,
// so the row lands on 'deposit_paid'. A blanket 'paid' would let the rider
// close the order without collecting the balance. 'deposit_paid' becomes
// 'completed' only when the cash is taken (/api/rider/orders/[id]/deliver).
// decline_reason written by /api/orders/abandon when it cancels an unpaid
// checkout. Only rows carrying THIS reason are ever revived below — a buyer's
// own cancel or a farmer decline is never undone by a payment.
export const ABANDON_REASON = 'Payment not completed'

type RevivableRow = { id: string; quantity: number | null; harvest_id: string | null; produce_listing_id: string | null }

/**
 * Money arrived for a checkout we had already abandoned (a UPI app payment
 * that the bank confirmed after the buyer's screen closed — YFF-20261029-0383).
 * The buyer paid, so the order is real: put it back to 'pending' for the
 * farmer and take the stock the abandon released back out again.
 * Returns the ids it revived.
 */
export async function reviveAbandonedOrders(
  supabase: SupabaseClient,
  cashfreeOrderId: string,
): Promise<string[]> {
  const { data: rows, error } = await supabase
    .from('orders')
    .select('id, quantity, harvest_id, produce_listing_id')
    .eq('cashfree_order_id', cashfreeOrderId)
    .eq('status', 'cancelled')
    .eq('decline_reason', ABANDON_REASON)
  if (error) {
    console.error('[YFF cashfree-settle] revive lookup failed:', error.message)
    return []
  }

  const revived: string[] = []
  for (const row of (rows ?? []) as RevivableRow[]) {
    // Guarded on the same state so a racing caller (webhook vs verify vs
    // cron) revives — and re-reserves stock — only once.
    const { data: flipped, error: updErr } = await supabase
      .from('orders')
      .update({ status: 'pending', decline_reason: null, acknowledged_at: null })
      .eq('id', row.id)
      .eq('status', 'cancelled')
      .eq('decline_reason', ABANDON_REASON)
      .select('id')
    if (updErr) {
      console.error('[YFF cashfree-settle] revive update failed:', row.id, updErr.message)
      continue
    }
    if (!flipped || flipped.length === 0) continue
    revived.push(row.id)

    if (row.quantity != null && row.quantity > 0) {
      try {
        const { data: ok } = row.harvest_id
          ? await supabase.rpc('decrement_harvest_stock', { p_harvest_id: row.harvest_id, p_qty: row.quantity })
          : row.produce_listing_id
            ? await supabase.rpc('decrement_stock', { p_listing_id: row.produce_listing_id, p_qty: row.quantity })
            : { data: true }
        // Someone else bought the released stock meanwhile. The buyer has
        // still paid, so the order stays; the farmer can decline (refunds).
        if (ok === false) console.warn('[YFF cashfree-settle] revived order but stock is short:', row.id)
      } catch (e) {
        console.error('[YFF cashfree-settle] revive stock take-back failed:', row.id, e)
      }
    }
  }
  if (revived.length) {
    console.warn('[YFF cashfree-settle] revived abandoned orders after late payment:', cashfreeOrderId, revived)
    // The stock just taken back can push a wholesale produce below its minimum.
    const claims = ((rows ?? []) as RevivableRow[])
      .filter((r) => revived.includes(r.id) && r.produce_listing_id && r.quantity != null && r.quantity > 0)
      .map((r) => ({ listingId: r.produce_listing_id as string, harvestId: r.harvest_id, qty: r.quantity as number }))
    await alertWholesaleLowStock(supabase, claims)
  }
  return revived
}

export async function markCashfreePaid(
  supabase: SupabaseClient,
  args: { cashfreeOrderId: string; paymentId: string; label: string | null },
): Promise<string | null> {
  const now = new Date().toISOString()
  const detail = args.label ? { payment_method_detail: args.label } : {}

  // First undo any "Payment not completed" cancel on this checkout — the
  // payment we are recording proves it was completed.
  const revived = await reviveAbandonedOrders(supabase, args.cashfreeOrderId)

  const { data: codRows, error: codErr } = await supabase
    .from('orders')
    .update({ payment_status: 'deposit_paid', cod_deposit_paid_at: now, cashfree_payment_id: args.paymentId, ...detail })
    .eq('cashfree_order_id', args.cashfreeOrderId)
    .eq('payment_method', 'cod')
    .not('payment_status', 'in', '("deposit_paid","completed","paid")')
    .select('id')
  if (codErr) return codErr.message

  const { data: paidRows, error } = await supabase
    .from('orders')
    .update({ payment_status: 'paid', paid_at: now, cashfree_payment_id: args.paymentId, ...detail })
    .eq('cashfree_order_id', args.cashfreeOrderId)
    .neq('payment_method', 'cod')
    .not('payment_status', 'in', '("completed","paid")')
    .select('id')
  if (error) return error.message

  // The money is in, so the order is now real: WhatsApp the buyer and farmer.
  // Only the rows THIS call flipped — the guards above make a racing second
  // caller flip nothing — and the outbox dedupes on top of that.
  // Revived rows count too: the buyer was told "not placed", the farmer never
  // got the alert. The outbox dedupes if a row is in both lists.
  const flippedIds = [...(codRows ?? []), ...(paidRows ?? [])].map((r) => r.id as string)
  const settled = [...new Set([...revived, ...flippedIds])]
  notifyOrdersPlaced(supabase, settled)
  return null
}

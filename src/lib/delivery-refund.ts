// Server-side execution of a delivery-charge refund plan.
//
// When one order in a multi-farmer checkout is declined/cancelled, the delivery
// charge for the WHOLE checkout drops (see planDeliveryRefund in delivery-fee.ts).
// The drop is refunded from one or more orders' captured payments. The order
// being cancelled is refunded by the calling route (folded into its single
// item+platform+delivery refund); this helper issues the refunds that land on
// the OTHER (sibling) orders' payments — e.g. the residual base still sitting on
// an already-cancelled base row when the last farmer finally leaves.

import type { SupabaseClient } from '@supabase/supabase-js'
import { refundPayment } from '@/lib/razorpay'
import type { DeliveryRefundPlan, DeliveryRefundAllocation } from '@/lib/delivery-fee'

// Columns planDeliveryRefund needs from each sibling order row.
export const REFUND_ORDER_COLS =
  'id, farmer_id, status, delivery_fee, delivery_fee_refunded, payment_status, razorpay_payment_id, order_code'

/**
 * Apply the sibling parts of a delivery refund plan (every allocation EXCEPT the
 * order the caller is itself refunding). Best-effort: a gateway failure on one
 * sibling is logged and skipped so the primary decline/cancel still completes.
 *
 * @returns the current order's own allocation, so the caller can fold it into
 *          that order's single refund (amount to add + the new delivery_fee_refunded
 *          value to stamp on it). Zeroes when the plan gives the current order nothing.
 */
export async function applySiblingDeliveryRefunds(
  supabase: SupabaseClient,
  plan: DeliveryRefundPlan,
  currentOrderId: string,
): Promise<{ currentAmount: number; currentRefundedTotal: number | null }> {
  let currentAmount = 0
  let currentRefundedTotal: number | null = null

  for (const alloc of plan.allocations) {
    if (alloc.orderId === currentOrderId) {
      currentAmount = alloc.amount
      currentRefundedTotal = alloc.newRefundedTotal
      continue
    }
    await refundSibling(supabase, alloc)
  }

  return { currentAmount, currentRefundedTotal }
}

async function refundSibling(supabase: SupabaseClient, alloc: DeliveryRefundAllocation): Promise<void> {
  if (alloc.amount <= 0) return

  const rowUpdate: Record<string, unknown> = {
    delivery_fee_refunded: alloc.newRefundedTotal,
    refunded_at: new Date().toISOString(),
  }

  if (alloc.viaRazorpay && alloc.razorpayPaymentId) {
    try {
      await refundPayment({
        paymentId: alloc.razorpayPaymentId,
        amountPaise: Math.round(alloc.amount * 100),
        notes: { reason: 'delivery_charge_adjustment', order_id: alloc.orderId },
      })
    } catch (e) {
      // Don't fail the whole decline/cancel over a secondary sibling refund;
      // record nothing on the row so a later run can retry, and log it.
      console.error('[YFF] sibling delivery refund failed:', alloc.orderId, e)
      return
    }
  } else {
    // Non-Razorpay captured payment — flag for manual settlement.
    rowUpdate.refund_status = 'initiated'
  }

  const { error } = await supabase.from('orders').update(rowUpdate).eq('id', alloc.orderId)
  if (error) console.error('[YFF] sibling delivery_fee_refunded stamp failed:', alloc.orderId, error.message)
}

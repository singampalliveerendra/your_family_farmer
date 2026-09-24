import type { SupabaseClient } from '@supabase/supabase-js'

// Record a confirmed Cashfree payment on every order row of its cart. Shared by
// /verify (browser), the webhook, and the reconcile cron, which can race each
// other — so both updates are guarded and running this twice changes nothing.
//
// Split by payment method because a captured payment means different things.
// On a COD order it is only the DEPOSIT: the buyer still owes cash at the door,
// so the row lands on 'deposit_paid'. A blanket 'paid' would let the rider
// close the order without collecting the balance. 'deposit_paid' becomes
// 'completed' only when the cash is taken (/api/rider/orders/[id]/deliver).
export async function markCashfreePaid(
  supabase: SupabaseClient,
  args: { cashfreeOrderId: string; paymentId: string; label: string | null },
): Promise<string | null> {
  const now = new Date().toISOString()
  const detail = args.label ? { payment_method_detail: args.label } : {}

  const { error: codErr } = await supabase
    .from('orders')
    .update({ payment_status: 'deposit_paid', cod_deposit_paid_at: now, cashfree_payment_id: args.paymentId, ...detail })
    .eq('cashfree_order_id', args.cashfreeOrderId)
    .eq('payment_method', 'cod')
    .not('payment_status', 'in', '("deposit_paid","completed","paid")')
  if (codErr) return codErr.message

  const { error } = await supabase
    .from('orders')
    .update({ payment_status: 'paid', paid_at: now, cashfree_payment_id: args.paymentId, ...detail })
    .eq('cashfree_order_id', args.cashfreeOrderId)
    .neq('payment_method', 'cod')
    .not('payment_status', 'in', '("completed","paid")')
  return error ? error.message : null
}

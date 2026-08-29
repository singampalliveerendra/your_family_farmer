// Delivery charge for a checkout.
//
// The charge is a single figure for the WHOLE checkout, even though a
// multi-farmer cart is placed as one order batch per farmer:
//
//     delivery = farmers === 0 ? 0 : base + extra × (farmers - 1)
//
// `base` covers the rider's trip (and the first farmer's pickup); every
// additional farmer is another pickup stop, so it adds `extra`. Both figures
// are moderator-set (platform_settings.delivery_base_fee / delivery_extra_fee)
// and default to ₹30 / ₹15. The resolved rupees are stamped on orders.delivery_fee
// at placement (see src/app/api/orders/place/route.ts): `base` on the first
// farmer's batch, `extra` on each subsequent farmer's batch, so the stamped
// fees across a checkout always sum to the formula above.
//
// Refunds (farmer decline / buyer cancel) recompute how many farmers remain in
// the checkout and give back the drop — see planDeliveryRefund below.

import type { SupabaseClient } from '@supabase/supabase-js'

// Sensible ceiling for the moderator inputs — a guard against a fat-fingered
// entry, not a business rule.
export const DELIVERY_FEE_MAX = 1000

// Launch defaults, also used as the fallback when the settings row/columns
// aren't migrated yet so checkout is never blocked.
export const DEFAULT_DELIVERY_BASE_FEE = 30
export const DEFAULT_DELIVERY_EXTRA_FEE = 15

export type DeliveryCharges = { base: number; extra: number }

// Total delivery charge for a checkout with `farmerCount` participating farmers.
export function computeDeliveryTotal(farmerCount: number, { base, extra }: DeliveryCharges): number {
  if (!Number.isFinite(farmerCount) || farmerCount <= 0) return 0
  const b = Math.max(0, Math.round(base))
  const e = Math.max(0, Math.round(extra))
  return b + e * (farmerCount - 1)
}

// Read the current base + extra charges. Best-effort: if the table/columns
// don't exist yet (migration not applied) or anything fails, fall back to the
// launch defaults so checkout and refunds are never blocked.
export async function getDeliveryCharges(supabase: SupabaseClient): Promise<DeliveryCharges> {
  try {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('delivery_base_fee, delivery_extra_fee')
      .eq('id', 1)
      .maybeSingle()
    if (error) return { base: DEFAULT_DELIVERY_BASE_FEE, extra: DEFAULT_DELIVERY_EXTRA_FEE }
    const base = Number(data?.delivery_base_fee)
    const extra = Number(data?.delivery_extra_fee)
    return {
      base: Number.isFinite(base) && base >= 0 ? base : DEFAULT_DELIVERY_BASE_FEE,
      extra: Number.isFinite(extra) && extra >= 0 ? extra : DEFAULT_DELIVERY_EXTRA_FEE,
    }
  } catch {
    return { base: DEFAULT_DELIVERY_BASE_FEE, extra: DEFAULT_DELIVERY_EXTRA_FEE }
  }
}

// ── Refunds ──────────────────────────────────────────────────────────────
//
// planDeliveryRefund works out how much delivery charge to give back when one
// order in a checkout is declined/cancelled, and which orders' payments to pull
// it from. It is a pure function so the farmer-decline and buyer-cancel routes
// share exactly one implementation and can't drift.

// A status that means the order is no longer part of the delivery run.
const GONE = new Set(['declined', 'cancelled'])

// The minimum shape planDeliveryRefund needs from each sibling order row.
export type RefundOrderRow = {
  id: string
  farmer_id: string | null
  status: string | null
  delivery_fee: number | null
  delivery_fee_refunded: number | null
  payment_status: string | null
  razorpay_payment_id: string | null
}

// One refund to issue against one order's payment.
export type DeliveryRefundAllocation = {
  orderId: string
  // Rupees to refund from THIS order's captured payment.
  amount: number
  // How much of this row's delivery_fee will have been refunded after this
  // allocation (row.delivery_fee_refunded + amount) — write straight back.
  newRefundedTotal: number
  razorpayPaymentId: string | null
  // true → issue a real Razorpay refund; false → a non-Razorpay captured
  // payment, so the caller flags it for manual settlement instead.
  viaRazorpay: boolean
}

export type DeliveryRefundPlan = {
  // Total delivery rupees to refund across all allocations.
  owed: number
  allocations: DeliveryRefundAllocation[]
}

function participating(row: RefundOrderRow): boolean {
  return !GONE.has(String(row.status ?? ''))
}

// Was money actually captured for this row (so a delivery refund is possible)?
function captured(row: RefundOrderRow): { yes: boolean; viaRazorpay: boolean } {
  const s = String(row.payment_status ?? '')
  const viaRazorpay = (s === 'paid' || s === 'deposit_paid') && !!row.razorpay_payment_id
  const otherPaid = s === 'completed' || s === 'payment_claimed' || s === 'pending_confirmation'
  return { yes: viaRazorpay || otherPaid, viaRazorpay }
}

function refundableDelivery(row: RefundOrderRow): number {
  return Math.max(0, (Number(row.delivery_fee) || 0) - (Number(row.delivery_fee_refunded) || 0))
}

/**
 * Plan the delivery-charge refund for cancelling one order out of a checkout.
 *
 * @param siblings  every order row sharing the checkout_id (including the one
 *                  being cancelled), each still carrying its CURRENT status —
 *                  i.e. call this BEFORE writing the declined/cancelled status.
 * @param cancelId  the order id being declined/cancelled.
 * @param charges   the current base/extra (from getDeliveryCharges).
 *
 * Returns the rupees to give back and the per-order allocations. Item price and
 * platform fee are handled by the caller; this covers only delivery.
 */
export function planDeliveryRefund(
  siblings: RefundOrderRow[],
  cancelId: string,
  { base, extra }: DeliveryCharges,
): DeliveryRefundPlan {
  const target = siblings.find((r) => r.id === cancelId)
  if (!target) return { owed: 0, allocations: [] }

  // Farmers with at least one live order, before vs after this cancellation.
  const farmersOf = (rows: RefundOrderRow[]) =>
    new Set(rows.filter(participating).map((r) => String(r.farmer_id ?? '')))
  const before = farmersOf(siblings).size
  const after = farmersOf(siblings.filter((r) => r.id !== cancelId)).size

  // Delivery money still held (stamped but not yet refunded) across the whole
  // checkout — includes residual left on already-cancelled base rows.
  const remainingHeld = siblings.reduce((s, r) => s + refundableDelivery(r), 0)

  // How much the delivery charge drops.
  //   - farmer still has other live orders (before === after) → no drop (Case 5)
  //   - last farmer leaving → refund everything still held (base included)
  //   - a non-last farmer leaving → refund one `extra` unit
  let owed: number
  if (after === before) owed = 0
  else if (after === 0) owed = remainingHeld
  else owed = Math.min(Math.max(0, Math.round(extra)), remainingHeld)

  // Only rows whose payment was captured can actually be refunded; never plan
  // to give back more than was collected.
  const candidates = siblings
    .map((r) => ({ row: r, cap: captured(r), refundable: refundableDelivery(r) }))
    .filter((c) => c.cap.yes && c.refundable > 0)
    // Pull from the cancelled order first, then its siblings.
    .sort((a, b) => (a.row.id === cancelId ? -1 : b.row.id === cancelId ? 1 : 0))
  const allocatable = candidates.reduce((s, c) => s + c.refundable, 0)
  owed = Math.min(owed, allocatable)

  const allocations: DeliveryRefundAllocation[] = []
  let left = owed
  for (const c of candidates) {
    if (left <= 0) break
    const amount = Math.min(left, c.refundable)
    if (amount <= 0) continue
    allocations.push({
      orderId: c.row.id,
      amount,
      newRefundedTotal: (Number(c.row.delivery_fee_refunded) || 0) + amount,
      razorpayPaymentId: c.row.razorpay_payment_id,
      viaRazorpay: c.cap.viaRazorpay,
    })
    left -= amount
  }

  return { owed, allocations }
}

// ── One batch's share of the checkout charge ──────────────────────────────
//
// The batches of a multi-farmer checkout arrive as SEPARATE POSTs sharing a
// checkout_id, so when the first one lands the server genuinely cannot see the
// other farmers' lines yet. That is why a client hint exists at all. The rule
// that makes the hint safe:
//
//   the client flag may only turn the charge ON, never off.
//
// Claiming `true` costs the caller money, so it is not an attack. Claiming
// `false` was the attack — and it is now overridden the moment our own data
// (this batch's lines, or the sibling rows already written under the same
// checkout_id) says the rider is involved.
//
// Likewise `base` vs `extra` is decided by counting sibling rows, not by the
// client's old `deliveryFarmerIndex`, which could be forged to buy the cheaper
// "extra" rate on a batch that should have carried "base".
export type BatchDeliveryInputs = {
  charges: DeliveryCharges
  /** Does any line in THIS batch ship by our rider? Server-derived. */
  batchHomeDelivery: boolean
  /** Does any row already written under this checkout_id ship by our rider? */
  siblingHomeDelivery: boolean
  /** How many order rows already exist under this checkout_id. */
  siblingCount: number
  /** Did the caller send a checkout_id at all? Legacy single-farmer posts don't. */
  hasCheckoutId: boolean
  /** The client's whole-cart hint. Can only ever turn the charge ON. */
  clientChargeApplies: boolean
}

export function resolveBatchDeliveryFee({
  charges,
  batchHomeDelivery,
  siblingHomeDelivery,
  siblingCount,
  hasCheckoutId,
  clientChargeApplies,
}: BatchDeliveryInputs): number {
  const charged = batchHomeDelivery || siblingHomeDelivery || clientChargeApplies
  if (!charged) return 0
  // First batch of the checkout carries the base charge, every later one the
  // extra. Without a checkout_id there is only one batch, so it is by
  // definition the first — never the discounted "extra".
  const isFirstBatch = hasCheckoutId ? siblingCount === 0 : true
  return isFirstBatch
    ? Math.max(0, Math.round(charges.base))
    : Math.max(0, Math.round(charges.extra))
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { activationDates, subscriptionReceiptNo } from '@/lib/subscriptionLifecycle'
import { isPlanKind, unlocksSelling, type PlanKind, type SubscriptionRow } from '@/lib/subscriptionPlans'

/* Server-side steps of a subscription, shared by every path that can reach
 * them — so the browser verify, the Cashfree webhook and the nightly
 * reconcile all do exactly the same thing:
 *   settleSubscriptionPayment — Cashfree said PAID in full → the pending row
 *     becomes active (once, however many paths arrive).
 *   holdListings / releaseHolds — the moderator's "Hide listings" after a plan
 *     has been over for 10+ days, and putting them back (by hand, or by paying
 *     for selling again).
 * Never throw: callers are webhooks and crons that must answer regardless. */

export const SUB_ROW_COLUMNS =
  'id, aggregator_id, plan_id, kind, source, status, starts_at, ends_at, amount_paid, plan_name, price_actual, note, created_at, cashfree_order_id, payment_ref, payment_label, paid_at, receipt_no, duration_days, start_mode'

// Statuses a buyer can see — the only ones worth hiding. 'paused',
// 'suspended' etc. are already off the shelf and are left exactly as they are.
const HIDEABLE = ['available', 'sold_out', 'coming_soon']
const HIDDEN_STATUS = 'suspended'

export type SettleResult =
  | { ok: true; subscriptionId: string; alreadyActive: boolean }
  | { ok: false; error: string }

export async function settleSubscriptionPayment(
  supabase: SupabaseClient,
  args: { cashfreeOrderId: string; paymentId: string; label: string | null },
  now: Date = new Date(),
): Promise<SettleResult> {
  try {
    const { data: row, error } = await supabase
      .from('aggregator_subscriptions')
      .select(SUB_ROW_COLUMNS)
      .eq('cashfree_order_id', args.cashfreeOrderId)
      .maybeSingle()
    if (error || !row) return { ok: false, error: 'Subscription not found for this payment.' }
    const sub = row as SubscriptionRow & { aggregator_id: string; start_mode?: string; duration_days?: number | null }
    if (sub.status === 'active') return { ok: true, subscriptionId: sub.id, alreadyActive: true }
    if (sub.status !== 'pending') return { ok: false, error: `Subscription is ${sub.status}.` }

    const { data: others } = await supabase
      .from('aggregator_subscriptions')
      .select(SUB_ROW_COLUMNS)
      .eq('aggregator_id', sub.aggregator_id)
    const { startsAt, endsAt } = activationDates(sub, ((others ?? []) as SubscriptionRow[]).filter((s) => s.id !== sub.id), now)

    // Guarded on 'pending': when the webhook and the browser arrive together,
    // exactly one update matches.
    const { data: updated, error: upErr } = await supabase
      .from('aggregator_subscriptions')
      .update({
        status: 'active',
        starts_at: startsAt,
        ends_at: endsAt,
        paid_at: now.toISOString(),
        payment_ref: args.paymentId,
        payment_label: args.label,
        receipt_no: subscriptionReceiptNo(sub.id, now),
      })
      .eq('id', sub.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (upErr) return { ok: false, error: upErr.message }
    if (!updated) return { ok: true, subscriptionId: sub.id, alreadyActive: true }

    // Paying for selling again brings back anything a moderator hid.
    if (isPlanKind(sub.kind) && unlocksSelling(sub.kind as PlanKind) && new Date(startsAt).getTime() <= now.getTime()) {
      await releaseHolds(supabase, sub.aggregator_id)
    }
    return { ok: true, subscriptionId: sub.id, alreadyActive: false }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'settle failed' }
  }
}

/** Hide an aggregator's visible listings, remembering each one's status. */
export async function holdListings(
  supabase: SupabaseClient,
  aggregatorId: string,
  moderatorId: string | null,
): Promise<{ ok: true; held: number } | { ok: false; error: string }> {
  try {
    const { data: listings, error } = await supabase
      .from('produce_listings')
      .select('id, status')
      .eq('farmer_id', aggregatorId)
      .in('status', HIDEABLE)
    if (error) return { ok: false, error: error.message }
    const rows = (listings ?? []) as Array<{ id: string; status: string }>
    if (!rows.length) return { ok: true, held: 0 }
    const { error: hErr } = await supabase.from('subscription_listing_holds').insert(
      rows.map((l) => ({ aggregator_id: aggregatorId, listing_id: l.id, previous_status: l.status, held_by: moderatorId })),
    )
    if (hErr) return { ok: false, error: hErr.message }
    const { error: uErr } = await supabase
      .from('produce_listings')
      .update({ status: HIDDEN_STATUS })
      .in('id', rows.map((l) => l.id))
    if (uErr) return { ok: false, error: uErr.message }
    return { ok: true, held: rows.length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'hold failed' }
  }
}

/**
 * Put back what a hold took down. Only listings still at the hidden status
 * are restored — one the farmer or a moderator changed since is left alone.
 */
export async function releaseHolds(
  supabase: SupabaseClient,
  aggregatorId: string,
): Promise<{ ok: true; released: number } | { ok: false; error: string }> {
  try {
    const { data: holds, error } = await supabase
      .from('subscription_listing_holds')
      .select('id, listing_id, previous_status')
      .eq('aggregator_id', aggregatorId)
      .is('released_at', null)
    if (error) return { ok: false, error: error.message }
    const list = (holds ?? []) as Array<{ id: string; listing_id: string; previous_status: string }>
    let released = 0
    for (const h of list) {
      const { data: back } = await supabase
        .from('produce_listings')
        .update({ status: h.previous_status })
        .eq('id', h.listing_id)
        .eq('status', HIDDEN_STATUS)
        .select('id')
      if (Array.isArray(back) && back.length) released++
      await supabase.from('subscription_listing_holds').update({ released_at: new Date().toISOString() }).eq('id', h.id)
    }
    return { ok: true, released }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'release failed' }
  }
}

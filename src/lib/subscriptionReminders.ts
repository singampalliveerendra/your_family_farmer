import type { SupabaseClient } from '@supabase/supabase-js'
import { queueAndSend } from '@/lib/notify'
import { REMINDER_DAYS, reminderDue } from '@/lib/subscriptionLifecycle'
import { PLAN_KIND_LABELS, isPlanKind, type SubscriptionRow } from '@/lib/subscriptionPlans'

/* "Your plan ends in 3 days" — run once a day by /api/cron/subscription-reminders
 * (decision 2026-11-04: remind 3 days before, no auto-debit). One message per
 * subscription ever (dedupe key), never for a plan that has already been
 * renewed or sits beside free-forever.
 *
 * WhatsApp needs the Meta-approved template yff_subscription_expiring, so
 * sending is OFF unless SUBSCRIPTION_REMINDER_WHATSAPP=1 — until then this
 * still finds who is due (and returns them), it just sends nothing. The
 * dashboard banner tells the aggregator either way. */

export const reminderWhatsAppEnabled = () => process.env.SUBSCRIPTION_REMINDER_WHATSAPP === '1'
export const reminderDedupeKey = (subscriptionId: string) => `sub_expiring:${subscriptionId}`

type Send = typeof queueAndSend

const endDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

export async function sendSubscriptionReminders(
  supabase: SupabaseClient,
  opts: { now?: Date; send?: Send } = {},
): Promise<{ due: string[]; sent: number }> {
  const now = opts.now ?? new Date()
  const send = opts.send ?? queueAndSend
  try {
    const until = new Date(now.getTime() + REMINDER_DAYS * 86_400_000).toISOString()
    const { data: ending, error } = await supabase
      .from('aggregator_subscriptions')
      .select('id, aggregator_id, kind, source, status, starts_at, ends_at, plan_name')
      .eq('status', 'active')
      .gt('ends_at', now.toISOString())
      .lte('ends_at', until)
    if (error || !ending?.length) return { due: [], sent: 0 }

    const aggIds = [...new Set((ending as Array<{ aggregator_id: string }>).map((r) => r.aggregator_id))]
    const [{ data: all }, { data: people }] = await Promise.all([
      supabase.from('aggregator_subscriptions').select('id, aggregator_id, kind, source, status, starts_at, ends_at').in('aggregator_id', aggIds),
      supabase.from('farmers').select('id, phone').in('id', aggIds),
    ])
    const byAgg = new Map<string, SubscriptionRow[]>()
    for (const r of (all ?? []) as Array<SubscriptionRow & { aggregator_id: string }>) {
      byAgg.set(r.aggregator_id, [...(byAgg.get(r.aggregator_id) ?? []), r])
    }
    const phoneOf = new Map(((people ?? []) as Array<{ id: string; phone: string | null }>).map((p) => [p.id, p.phone]))

    const due: string[] = []
    let sent = 0
    for (const row of ending as Array<SubscriptionRow & { aggregator_id: string }>) {
      if (!reminderDue(row, byAgg.get(row.aggregator_id) ?? [row], now)) continue
      due.push(row.id)
      if (!reminderWhatsAppEnabled()) continue
      const kind = isPlanKind(row.kind) ? PLAN_KIND_LABELS[row.kind].en : row.kind
      await send(supabase, {
        phone: phoneOf.get(row.aggregator_id),
        event: 'aggregator_subscription_expiring',
        lang: 'en',
        body: [row.plan_name || kind, endDate(row.ends_at as string)],
        dedupeKey: reminderDedupeKey(row.id),
      })
      sent++
    }
    return { due, sent }
  } catch (e) {
    console.error('[YFF subscription reminders] failed:', e)
    return { due: [], sent: 0 }
  }
}

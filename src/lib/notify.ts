import type { SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import type { Lang } from '@/lib/serverLang'
import { normalizePhone } from '@/lib/phone'
import { sendTemplate } from '@/lib/whatsapp'

// Outbound WhatsApp notifications, as an outbox.
//
// Why an outbox and not a bare fetch at the call site: these fire inside order
// transitions a farmer or rider taps on a slow 4G phone. Meta being down, slow,
// or rate-limiting must never fail that tap or roll back the status change. So
// every message is first written to `notifications` (cheap local insert), then
// pushed with next/server after() so the HTTP response has already been sent,
// and anything still pending is retried by /api/cron/whatsapp-outbox.

/** Authentication template — the login/password-reset code. */
export const OTP_TEMPLATE = 'yff_login_otp'

/** Utility templates, one per consumer-visible order transition.
 * Names must match what is approved in WhatsApp Manager; the body parameter
 * order for each is documented in scripts/whatsapp-templates.md. */
export const TEMPLATES = {
  order_placed: 'yff_order_placed',
  order_shipped: 'yff_order_shipped',
  out_for_delivery: 'yff_out_for_delivery',
  order_delivered: 'yff_order_delivered',
  order_declined: 'yff_order_declined',
} as const

export type NotifyEvent = keyof typeof TEMPLATES

type QueueArgs = {
  /** Buyer phone in any stored format — normalised here. */
  phone: string | null | undefined
  event: NotifyEvent
  lang: Lang
  /** Ordered body variables for the template. */
  body: string[]
  /** Appended to the template's dynamic URL button (the order-tracking link). */
  urlButtonParam?: string
  /** Stable per-event identity so a double tap or a multi-row rider job only
   * ever produces one message. Enforced by a unique index on the table. */
  dedupeKey: string
  orderId?: string | null
}

type NotificationRow = {
  id: string
  phone: string
  template: string
  lang: string
  body_params: string[] | null
  url_button_param: string | null
  attempts: number | null
}

const MAX_ATTEMPTS = 4

/**
 * Queues one notification and attempts delivery after the response is flushed.
 *
 * Never throws and never rejects — a notification failure must not surface to
 * the farmer/rider whose status change triggered it.
 */
export async function queueAndSend(
  supabase: SupabaseClient,
  args: QueueArgs,
): Promise<void> {
  const phone = normalizePhone(args.phone)
  if (!phone) return // guest rows without a usable number: nothing to do

  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        phone,
        template: TEMPLATES[args.event],
        event: args.event,
        lang: args.lang,
        body_params: args.body,
        url_button_param: args.urlButtonParam ?? null,
        dedupe_key: args.dedupeKey,
        order_id: args.orderId ?? null,
        status: 'pending',
      })
      .select('id, phone, template, lang, body_params, url_button_param, attempts')
      .maybeSingle()

    // 23505 = unique violation on dedupe_key: already queued by an earlier
    // call. That is the mechanism working, not an error.
    if (error) {
      if (error.code !== '23505') {
        console.error('[YFF notify] queue failed:', error.code, error.message)
      }
      return
    }
    if (!data) return

    const row = data as NotificationRow
    // Deliver off the response path so the caller's request is not held open.
    after(() => deliver(supabase, row))
  } catch (e) {
    console.error('[YFF notify] queue threw:', e)
  }
}

/** Sends one queued row and records the outcome. Never throws. */
async function deliver(supabase: SupabaseClient, row: NotificationRow): Promise<void> {
  try {
    const result = await sendTemplate({
      phone: row.phone,
      template: row.template,
      lang: row.lang === 'te' ? 'te' : 'en',
      body: row.body_params ?? [],
      urlButtonParam: row.url_button_param ?? undefined,
    })

    const attempts = (row.attempts ?? 0) + 1

    if (result.ok) {
      await supabase
        .from('notifications')
        .update({
          status: 'sent',
          attempts,
          wa_message_id: result.messageId,
          last_error: null,
          sent_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      return
    }

    // A permanent rejection (bad template, number not on WhatsApp) will fail
    // identically forever — park it instead of burning cron budget on it.
    const exhausted = !result.retriable || attempts >= MAX_ATTEMPTS
    await supabase
      .from('notifications')
      .update({
        status: exhausted ? 'failed' : 'pending',
        attempts,
        last_error: result.error.slice(0, 500),
      })
      .eq('id', row.id)

    if (exhausted) {
      console.error('[YFF notify] giving up on', row.id, result.error)
    }
  } catch (e) {
    console.error('[YFF notify] deliver threw:', e)
  }
}

/**
 * Retries rows that after() never completed (function froze, Meta was down).
 * Called by the outbox cron. Returns a small summary for the cron response.
 */
export async function drainPending(
  supabase: SupabaseClient,
  limit = 50,
): Promise<{ picked: number }> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, phone, template, lang, body_params, url_button_param, attempts')
    .eq('status', 'pending')
    .lt('attempts', MAX_ATTEMPTS)
    // Give after() a chance to land first; only sweep what is actually stuck.
    .lt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[YFF notify] drain query failed:', error.message)
    return { picked: 0 }
  }

  const rows = (data ?? []) as NotificationRow[]
  // Sequential on purpose: Meta rate-limits per number, and a burst of
  // parallel sends from a cron is the fastest way to trip 130429.
  for (const row of rows) {
    await deliver(supabase, row)
  }
  return { picked: rows.length }
}

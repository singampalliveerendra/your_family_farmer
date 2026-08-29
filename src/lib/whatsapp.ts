// WhatsApp Cloud API (Meta) transport. This is the ONLY place that talks to
// Meta's Graph API — everything else (OTP, order status) goes through here.
//
// Unlike the 2factor.in gateway this replaced, Meta is a dumb pipe: it does
// not generate or verify OTPs, it only delivers a pre-approved template. OTP
// generation and verification therefore live in src/lib/otp.ts.
//
// Every message must reference a template that has already been approved in
// WhatsApp Manager. See scripts/whatsapp-templates.md for the exact bodies
// these calls expect, and keep the two in sync — a mismatch in parameter
// COUNT is rejected by Meta at send time with a 132000 error.

const GRAPH_VERSION = 'v21.0'

// On any Vercel Preview build we must never message a real phone — a tester
// typing a stranger's number would otherwise WhatsApp that stranger. Sends are
// short-circuited to a fake success so the flows stay testable end to end.
// (Same guard the 2factor gateway carried, deliberately preserved.)
const STAGING_MESSAGE_ID = 'staging-wa-message'

function isStaging(): boolean {
  return process.env.VERCEL_ENV === 'preview'
}

export type WhatsAppLang = 'en' | 'te'

/** Meta language codes for our two UI languages. */
const META_LANG: Record<WhatsAppLang, string> = {
  en: 'en',
  te: 'te',
}

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; retriable: boolean }

/** Meta wants full international MSISDN with no '+'. normalizePhone() gives us
 * the 10 trailing Indian digits, so prefix the country code here. */
export function toWhatsAppNumber(phone10: string): string {
  return `91${phone10}`
}

type TemplateArgs = {
  /** 10-digit Indian number, as returned by normalizePhone(). */
  phone: string
  /** Approved template name in WhatsApp Manager. */
  template: string
  lang: WhatsAppLang
  /** Ordered body variables — index 0 fills {{1}}, index 1 fills {{2}}, … */
  body?: string[]
  /** Value appended to a dynamic URL button, when the template has one. */
  urlButtonParam?: string
}

/**
 * Sends one approved template message.
 *
 * `retriable` distinguishes a transient failure (network, 5xx, rate limit)
 * from a permanent one (bad template, unregistered recipient). The outbox in
 * src/lib/notify.ts only re-queues the retriable kind — retrying a rejected
 * template forever would just burn cron budget.
 */
export async function sendTemplate(args: TemplateArgs): Promise<SendResult> {
  if (isStaging()) return { ok: true, messageId: STAGING_MESSAGE_ID }

  const token = process.env.WHATSAPP_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) {
    return {
      ok: false,
      error: 'WhatsApp not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing).',
      retriable: false,
    }
  }

  const components: unknown[] = []
  if (args.body && args.body.length > 0) {
    components.push({
      type: 'body',
      parameters: args.body.map((text) => ({ type: 'text', text })),
    })
  }
  if (args.urlButtonParam) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: args.urlButtonParam }],
    })
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toWhatsAppNumber(args.phone),
    type: 'template',
    template: {
      name: args.template,
      language: { code: META_LANG[args.lang] },
      ...(components.length > 0 ? { components } : {}),
    },
  }

  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      // Never let a slow Meta response hold a farmer's or rider's tap open.
      signal: AbortSignal.timeout(8000),
    })

    const json = (await r.json().catch(() => null)) as {
      messages?: { id?: string }[]
      error?: { message?: string; code?: number }
    } | null

    if (r.ok && json?.messages?.[0]?.id) {
      return { ok: true, messageId: String(json.messages[0].id) }
    }

    const code = json?.error?.code
    const message = json?.error?.message ?? `Meta returned HTTP ${r.status}`
    // 130429 = rate limited, 131056 = pair rate limit, 133016 = temporarily
    // unavailable. Those plus any 5xx are worth another attempt later.
    const retriable = r.status >= 500 || code === 130429 || code === 131056 || code === 133016
    return { ok: false, error: `[${code ?? r.status}] ${message}`, retriable }
  } catch (e) {
    // Timeout or network failure — always worth a retry.
    const message = e instanceof Error ? e.message : 'Could not reach WhatsApp.'
    return { ok: false, error: message, retriable: true }
  }
}

import { createHmac, timingSafeEqual } from 'crypto'
import Razorpay from 'razorpay'

// Server-only Razorpay helpers. The secret never leaves the server: it is
// used here to create orders and to verify the signature Checkout returns.
// The browser only ever sees the public key id (NEXT_PUBLIC_RAZORPAY_KEY_ID).

export function getRazorpayKeyId(): string {
  const id = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
  if (!id) throw new Error('NEXT_PUBLIC_RAZORPAY_KEY_ID is not set.')
  return id
}

function getRazorpaySecret(): string {
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) throw new Error('RAZORPAY_KEY_SECRET is not set.')
  return secret
}

export function getRazorpayClient(): Razorpay {
  return new Razorpay({ key_id: getRazorpayKeyId(), key_secret: getRazorpaySecret() })
}

export type RefundResult = {
  id: string
  status: string | null
  amountPaise: number
}

// Issue a (partial) refund against a captured payment. Each cart line is a
// separate orders row sharing one payment id, so we refund only this line's
// amount — Razorpay supports partial refunds, and the sum across declined
// lines can never exceed the captured total. Throws on API failure so the
// caller can keep the order in a state that lets the farmer retry.
export async function refundPayment(args: {
  paymentId: string
  amountPaise: number
  notes?: Record<string, string>
}): Promise<RefundResult> {
  const refund = await getRazorpayClient().payments.refund(args.paymentId, {
    amount: args.amountPaise,
    speed: 'normal',
    notes: args.notes,
  })
  return {
    id: String(refund.id),
    status: (refund.status as string | undefined) ?? null,
    amountPaise: Number(refund.amount) || args.amountPaise,
  }
}

// Recompute the Checkout signature and compare in constant time. Razorpay
// signs `${order_id}|${payment_id}` with HMAC-SHA256 keyed by the secret.
// A matching signature is the only proof the browser callback is genuine —
// never trust a client-reported "success" without this.
export function verifyPaymentSignature(args: {
  razorpayOrderId: string
  razorpayPaymentId: string
  signature: string
}): boolean {
  const expected = createHmac('sha256', getRazorpaySecret())
    .update(`${args.razorpayOrderId}|${args.razorpayPaymentId}`)
    .digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(args.signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// Verify a Razorpay WEBHOOK signature. Webhooks are signed with the webhook
// secret (configured in the dashboard, separate from the API key secret):
// HMAC-SHA256 over the raw request body, hex-encoded. We must verify against
// the EXACT bytes received, so the route reads req.text() before parsing.
export function verifyWebhookSignature(rawBody: string, signature: string | null | undefined): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) throw new Error('RAZORPAY_WEBHOOK_SECRET is not set.')
  if (!signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// Fetch all payment attempts Razorpay recorded against one order. Used by
// reconciliation to decide whether a "pending" order was actually paid.
export async function fetchOrderPayments(orderId: string): Promise<Array<{ id: string; status: string }>> {
  const res = await getRazorpayClient().orders.fetchPayments(orderId)
  const items = (res as { items?: Array<{ id: string; status: string }> }).items ?? []
  return items.map((p) => ({ id: String(p.id), status: String(p.status) }))
}

// The shape we care about from a Razorpay payment entity (available both from
// payments.fetch and inside the payment.captured webhook payload).
export type RazorpayPaymentEntity = {
  method?: string | null
  vpa?: string | null
  wallet?: string | null
  bank?: string | null
  card?: { network?: string | null } | null
}

// Map a UPI VPA handle (the part after "@") to the app the buyer paid with.
// The handle is the most reliable signal Razorpay gives us — there is no
// explicit "app name" field for UPI.
function upiAppFromVpa(vpa?: string | null): string | null {
  if (!vpa || !vpa.includes('@')) return null
  const handle = vpa.split('@')[1]?.toLowerCase() ?? ''
  // PhonePe issues @ybl / @ibl / @axl (and @yapl for some banks).
  if (['ybl', 'ibl', 'axl', 'yapl'].includes(handle)) return 'PhonePe'
  // Google Pay handles all start with "ok" (okaxis, oksbi, okhdfcbank, okicici).
  if (handle.startsWith('ok')) return 'Google Pay'
  // Paytm.
  if (['paytm', 'ptyes', 'ptaxis', 'pthdfc', 'ptsbi'].includes(handle)) return 'Paytm'
  // Amazon Pay.
  if (handle === 'apl' || handle === 'amazonpay') return 'Amazon Pay'
  // CRED.
  if (handle === 'axisb' && (vpa.startsWith('cred') || vpa.includes('.cred'))) return 'CRED'
  return null
}

// Turn a Razorpay payment entity into a friendly label we can show buyers,
// e.g. "PhonePe", "Google Pay", "Paytm", "UPI", "Visa card", "HDFC NetBanking".
// Returns null when nothing useful can be derived.
export function resolvePaymentLabel(p: RazorpayPaymentEntity | null | undefined): string | null {
  if (!p) return null
  const method = (p.method ?? '').toLowerCase()
  if (method === 'upi') return upiAppFromVpa(p.vpa) ?? 'UPI'
  if (method === 'wallet') {
    const w = (p.wallet ?? '').toLowerCase()
    const map: Record<string, string> = {
      phonepe: 'PhonePe', paytm: 'Paytm', amazonpay: 'Amazon Pay',
      freecharge: 'Freecharge', mobikwik: 'MobiKwik', airtelmoney: 'Airtel Money',
    }
    return map[w] ?? (p.wallet ? `${p.wallet} wallet` : 'Wallet')
  }
  if (method === 'card') {
    const net = p.card?.network
    return net ? `${net} card` : 'Card'
  }
  if (method === 'netbanking') return p.bank ? `${p.bank} NetBanking` : 'NetBanking'
  if (method === 'emi') return 'EMI'
  if (method) return method.toUpperCase()
  return null
}

// Fetch a single payment from Razorpay and resolve its friendly method label.
// Used by the verify route; failures are swallowed (label stays null) so a
// transient API hiccup never blocks marking the order paid.
export async function fetchPaymentMethodLabel(paymentId: string): Promise<string | null> {
  try {
    const p = (await getRazorpayClient().payments.fetch(paymentId)) as RazorpayPaymentEntity
    return resolvePaymentLabel(p)
  } catch (e) {
    console.error('[YFF] fetchPaymentMethodLabel failed:', e)
    return null
  }
}

/**
 * What actually settled for a payment, straight from Razorpay.
 *
 * The checkout callback's HMAC proves Razorpay issued the payment id against
 * our order id — it says nothing about whether the money was captured or how
 * much of it. With partial payments enabled, a perfectly-signed callback can
 * point at a capture worth a fraction of the order. So /verify asks here before
 * marking anything paid.
 *
 * `expectedAmount` is the order's own amount as Razorpay recorded it at create
 * time, which is the figure our server computed — comparing the payment against
 * it needs no trust in the client.
 *
 * Returns null when Razorpay can't be reached. The caller treats that as
 * "unknown, proceed on the signature alone" rather than failing a real payment
 * because of a transient API error — the webhook is the backstop either way.
 */
export async function fetchPaymentSettlement(paymentId: string): Promise<
  { status: string; amount: number; orderId: string | null; expectedAmount: number | null } | null
> {
  try {
    const client = getRazorpayClient()
    const p = await client.payments.fetch(paymentId) as unknown as {
      status?: string; amount?: number | string; order_id?: string | null
    }
    const orderId = p.order_id ? String(p.order_id) : null

    let expectedAmount: number | null = null
    if (orderId) {
      try {
        const o = await client.orders.fetch(orderId) as unknown as { amount?: number | string }
        const amt = Number(o.amount)
        if (Number.isFinite(amt)) expectedAmount = amt
      } catch {
        // Order lookup is best-effort; the status check below still applies.
      }
    }

    return {
      status: String(p.status ?? ''),
      amount: Number(p.amount) || 0,
      orderId,
      expectedAmount,
    }
  } catch (e) {
    console.error('[YFF razorpay] payment settlement lookup failed:', e)
    return null
  }
}

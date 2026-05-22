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

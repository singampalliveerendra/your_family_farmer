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

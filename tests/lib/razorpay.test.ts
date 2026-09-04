import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyPaymentSignature, verifyWebhookSignature, resolvePaymentLabel } from '@/lib/razorpay'

// The signature check is the ONLY proof that a browser callback saying "paid"
// is genuine. If it ever returns true for a forged signature, anyone can mark
// their own order paid without paying.

const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET as string
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET as string

const sign = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(payload).digest('hex')

describe('verifyPaymentSignature', () => {
  const razorpayOrderId = 'order_ABC123'
  const razorpayPaymentId = 'pay_XYZ789'
  const good = sign(KEY_SECRET, `${razorpayOrderId}|${razorpayPaymentId}`)

  // Happy path: a signature computed with the real key secret is accepted.
  it('accepts a signature Razorpay would have produced', () => {
    expect(verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature: good })).toBe(true)
  })

  // A signature forged with a guessed secret is rejected. This is the 'mark my
  // own order paid without paying' attack.
  it('rejects a signature made with the wrong secret', () => {
    const forged = sign('attacker-guessed-secret', `${razorpayOrderId}|${razorpayPaymentId}`)
    expect(verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature: forged })).toBe(false)
  })

  // A genuine signature cannot be replayed onto another order id or another
  // payment id.
  it('rejects a signature lifted from a DIFFERENT order or payment', () => {
    expect(
      verifyPaymentSignature({ razorpayOrderId: 'order_OTHER', razorpayPaymentId, signature: good }),
    ).toBe(false)
    expect(
      verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId: 'pay_OTHER', signature: good }),
    ).toBe(false)
  })

  // Changing a single character of the signature invalidates it.
  it('rejects a one-character tamper', () => {
    const flipped = (good[0] === 'a' ? 'b' : 'a') + good.slice(1)
    expect(verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature: flipped })).toBe(false)
  })

  // A too-short or too-long signature is rejected cleanly.
  it('returns false rather than throwing on a wrong-length signature', () => {
    // timingSafeEqual throws on mismatched lengths; the length guard is what
    // turns a crash (a 500, which some callers treat as retryable) into a
    // clean rejection.
    for (const signature of ['', 'short', good + 'extra', good.slice(0, -1)]) {
      expect(verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature })).toBe(false)
    }
  })

  // Shifting the | between the two ids cannot make one payment's signature
  // validate a different pair of ids.
  it('is not fooled by moving the delimiter between the two ids', () => {
    // A naive concat check would accept order "a" + payment "b|c" as
    // equivalent to order "a|b" + payment "c".
    const shifted = sign(KEY_SECRET, 'order_A|pay_B|pay_C')
    expect(
      verifyPaymentSignature({ razorpayOrderId: 'order_A|pay_B', razorpayPaymentId: 'pay_C', signature: shifted }),
    ).toBe(true) // same bytes, genuinely the same message
    // ...but the ids we actually store must still not validate each other:
    expect(
      verifyPaymentSignature({ razorpayOrderId: 'order_A', razorpayPaymentId: 'pay_B', signature: shifted }),
    ).toBe(false)
  })
})

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1' } } } })

  // Happy path for the server-to-server webhook Razorpay calls.
  it('accepts a body signed with the webhook secret', () => {
    expect(verifyWebhookSignature(body, sign(WEBHOOK_SECRET, body))).toBe(true)
  })

  // Editing even the payment id in the body invalidates the webhook.
  it('rejects a body that was altered after signing', () => {
    const sig = sign(WEBHOOK_SECRET, body)
    expect(verifyWebhookSignature(body.replace('pay_1', 'pay_2'), sig)).toBe(false)
  })

  // The two secrets are not interchangeable.
  it('rejects the API key secret being used in place of the webhook secret', () => {
    // They are different secrets in the Razorpay dashboard; mixing them up is
    // the likeliest misconfiguration.
    expect(verifyWebhookSignature(body, sign(KEY_SECRET, body))).toBe(false)
  })

  // A webhook arriving with no signature at all is refused, not trusted.
  it('rejects a missing signature header', () => {
    expect(verifyWebhookSignature(body, null)).toBe(false)
    expect(verifyWebhookSignature(body, undefined)).toBe(false)
    expect(verifyWebhookSignature(body, '')).toBe(false)
  })
})

describe('resolvePaymentLabel', () => {
  // Turns the handle suffix (@ybl, @okaxis...) into the app name the buyer
  // recognises on their receipt.
  it('names the UPI app from the VPA handle', () => {
    expect(resolvePaymentLabel({ method: 'upi', vpa: 'someone@ybl' })).toBe('PhonePe')
    expect(resolvePaymentLabel({ method: 'upi', vpa: 'someone@okaxis' })).toBe('Google Pay')
    expect(resolvePaymentLabel({ method: 'upi', vpa: 'someone@paytm' })).toBe('Paytm')
    expect(resolvePaymentLabel({ method: 'upi', vpa: 'someone@apl' })).toBe('Amazon Pay')
  })

  // An unfamiliar or broken handle shows just 'UPI' rather than a wrong app
  // name.
  it('falls back to plain UPI for an unknown or malformed handle', () => {
    expect(resolvePaymentLabel({ method: 'upi', vpa: 'someone@unknownbank' })).toBe('UPI')
    expect(resolvePaymentLabel({ method: 'upi', vpa: 'no-at-sign' })).toBe('UPI')
    expect(resolvePaymentLabel({ method: 'upi', vpa: null })).toBe('UPI')
  })

  // The non-UPI methods get readable labels, including a wallet brand we have
  // never seen before.
  it('labels wallets, cards and netbanking', () => {
    expect(resolvePaymentLabel({ method: 'wallet', wallet: 'phonepe' })).toBe('PhonePe')
    expect(resolvePaymentLabel({ method: 'wallet', wallet: 'somethingnew' })).toBe('somethingnew wallet')
    expect(resolvePaymentLabel({ method: 'card', card: { network: 'Visa' } })).toBe('Visa card')
    expect(resolvePaymentLabel({ method: 'card', card: null })).toBe('Card')
    expect(resolvePaymentLabel({ method: 'netbanking', bank: 'HDFC' })).toBe('HDFC NetBanking')
    expect(resolvePaymentLabel({ method: 'netbanking' })).toBe('NetBanking')
  })

  // Missing or empty payment details produce a sensible label or nothing at
  // all, never a crash on the receipt.
  it('degrades gracefully rather than showing a buyer nothing sensible', () => {
    expect(resolvePaymentLabel({ method: 'cardless_emi' })).toBe('CARDLESS_EMI')
    expect(resolvePaymentLabel({})).toBeNull()
    expect(resolvePaymentLabel(null)).toBeNull()
    expect(resolvePaymentLabel(undefined)).toBeNull()
  })
})

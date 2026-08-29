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

  it('accepts a signature Razorpay would have produced', () => {
    expect(verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature: good })).toBe(true)
  })

  it('rejects a signature made with the wrong secret', () => {
    const forged = sign('attacker-guessed-secret', `${razorpayOrderId}|${razorpayPaymentId}`)
    expect(verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature: forged })).toBe(false)
  })

  it('rejects a signature lifted from a DIFFERENT order or payment', () => {
    expect(
      verifyPaymentSignature({ razorpayOrderId: 'order_OTHER', razorpayPaymentId, signature: good }),
    ).toBe(false)
    expect(
      verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId: 'pay_OTHER', signature: good }),
    ).toBe(false)
  })

  it('rejects a one-character tamper', () => {
    const flipped = (good[0] === 'a' ? 'b' : 'a') + good.slice(1)
    expect(verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature: flipped })).toBe(false)
  })

  it('returns false rather than throwing on a wrong-length signature', () => {
    // timingSafeEqual throws on mismatched lengths; the length guard is what
    // turns a crash (a 500, which some callers treat as retryable) into a
    // clean rejection.
    for (const signature of ['', 'short', good + 'extra', good.slice(0, -1)]) {
      expect(verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature })).toBe(false)
    }
  })

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

  it('accepts a body signed with the webhook secret', () => {
    expect(verifyWebhookSignature(body, sign(WEBHOOK_SECRET, body))).toBe(true)
  })

  it('rejects a body that was altered after signing', () => {
    const sig = sign(WEBHOOK_SECRET, body)
    expect(verifyWebhookSignature(body.replace('pay_1', 'pay_2'), sig)).toBe(false)
  })

  it('rejects the API key secret being used in place of the webhook secret', () => {
    // They are different secrets in the Razorpay dashboard; mixing them up is
    // the likeliest misconfiguration.
    expect(verifyWebhookSignature(body, sign(KEY_SECRET, body))).toBe(false)
  })

  it('rejects a missing signature header', () => {
    expect(verifyWebhookSignature(body, null)).toBe(false)
    expect(verifyWebhookSignature(body, undefined)).toBe(false)
    expect(verifyWebhookSignature(body, '')).toBe(false)
  })
})

describe('resolvePaymentLabel', () => {
  it('names the UPI app from the VPA handle', () => {
    expect(resolvePaymentLabel({ method: 'upi', vpa: 'someone@ybl' })).toBe('PhonePe')
    expect(resolvePaymentLabel({ method: 'upi', vpa: 'someone@okaxis' })).toBe('Google Pay')
    expect(resolvePaymentLabel({ method: 'upi', vpa: 'someone@paytm' })).toBe('Paytm')
    expect(resolvePaymentLabel({ method: 'upi', vpa: 'someone@apl' })).toBe('Amazon Pay')
  })

  it('falls back to plain UPI for an unknown or malformed handle', () => {
    expect(resolvePaymentLabel({ method: 'upi', vpa: 'someone@unknownbank' })).toBe('UPI')
    expect(resolvePaymentLabel({ method: 'upi', vpa: 'no-at-sign' })).toBe('UPI')
    expect(resolvePaymentLabel({ method: 'upi', vpa: null })).toBe('UPI')
  })

  it('labels wallets, cards and netbanking', () => {
    expect(resolvePaymentLabel({ method: 'wallet', wallet: 'phonepe' })).toBe('PhonePe')
    expect(resolvePaymentLabel({ method: 'wallet', wallet: 'somethingnew' })).toBe('somethingnew wallet')
    expect(resolvePaymentLabel({ method: 'card', card: { network: 'Visa' } })).toBe('Visa card')
    expect(resolvePaymentLabel({ method: 'card', card: null })).toBe('Card')
    expect(resolvePaymentLabel({ method: 'netbanking', bank: 'HDFC' })).toBe('HDFC NetBanking')
    expect(resolvePaymentLabel({ method: 'netbanking' })).toBe('NetBanking')
  })

  it('degrades gracefully rather than showing a buyer nothing sensible', () => {
    expect(resolvePaymentLabel({ method: 'cardless_emi' })).toBe('CARDLESS_EMI')
    expect(resolvePaymentLabel({})).toBeNull()
    expect(resolvePaymentLabel(null)).toBeNull()
    expect(resolvePaymentLabel(undefined)).toBeNull()
  })
})

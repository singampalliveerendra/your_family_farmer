import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyWebhookSignature,
  makeCashfreeOrderId,
  makeRefundId,
  normaliseRefundStatus,
  resolvePaymentLabel,
  getSettlement,
} from '@/lib/cashfree'

const SECRET = process.env.CASHFREE_SECRET_KEY as string
const sign = (secret: string, ts: string, body: string) =>
  createHmac('sha256', secret).update(ts + body).digest('base64')

describe('verifyWebhookSignature', () => {
  const ts = '1726650000'
  const body = '{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{"order":{"order_id":"gg_x"}}}'

  // USE: the webhook marks orders paid with no buyer present. A signature made
  // with our secret over timestamp+body is the only thing that makes it genuine.
  it('accepts a signature Cashfree would have produced', () => {
    expect(verifyWebhookSignature(body, ts, sign(SECRET, ts, body))).toBe(true)
  })

  // USE: the "POST a fake success to the webhook" attack.
  it('rejects a signature made with the wrong secret', () => {
    expect(verifyWebhookSignature(body, ts, sign('guessed', ts, body))).toBe(false)
  })

  // USE: a real signature replayed onto an edited body (e.g. a different
  // order_id) must fail — the signature covers the exact bytes.
  it('rejects a tampered body', () => {
    const good = sign(SECRET, ts, body)
    expect(verifyWebhookSignature(body.replace('gg_x', 'gg_y'), ts, good)).toBe(false)
  })

  // USE: the timestamp is part of what's signed, so it can't be swapped.
  it('rejects a changed timestamp', () => {
    expect(verifyWebhookSignature(body, '1726650001', sign(SECRET, ts, body))).toBe(false)
  })

  // USE: missing headers must be a clean "no", never a crash or a "yes".
  it('rejects missing signature or timestamp', () => {
    expect(verifyWebhookSignature(body, ts, null)).toBe(false)
    expect(verifyWebhookSignature(body, null, sign(SECRET, ts, body))).toBe(false)
  })
})

describe('makeCashfreeOrderId', () => {
  const rowId = '3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6a7b'

  // USE: Cashfree rejects order ids over 45 chars or with other characters, and
  // create would fail for every buyer.
  it('fits Cashfree\'s order id rules', () => {
    const id = makeCashfreeOrderId(rowId, Date.UTC(2030, 0, 1))
    expect(id.length).toBeLessThanOrEqual(45)
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  // USE: an expired/terminated Cashfree order id can never be reused, so a
  // retry after the first attempt expired must get a NEW id.
  it('differs between attempts on the same cart', () => {
    expect(makeCashfreeOrderId(rowId, 1000)).not.toBe(makeCashfreeOrderId(rowId, 2000))
  })
})

describe('makeRefundId', () => {
  const rowId = '3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6a7b'

  // USE: the SAME decline retried must reuse the same refund id, so Cashfree
  // rejects the duplicate instead of paying the buyer twice.
  it('is stable for the same line refund', () => {
    expect(makeRefundId('l', rowId)).toBe(makeRefundId('l', rowId))
  })

  // USE: a row can legitimately receive several delivery top-ups over time
  // (each farmer leaving). Each must be a distinct refund, or the second one
  // would be swallowed as a "duplicate" and the buyer shorted.
  it('gives each delivery top-up on a row its own id', () => {
    expect(makeRefundId('d', rowId, 15)).not.toBe(makeRefundId('d', rowId, 30))
    expect(makeRefundId('d', rowId, 15)).not.toBe(makeRefundId('l', rowId))
  })

  // USE: Cashfree allows 3–40 alphanumeric characters.
  it('fits Cashfree\'s refund id rules', () => {
    for (const id of [makeRefundId('l', rowId), makeRefundId('d', rowId, 999999)]) {
      expect(id.length).toBeGreaterThanOrEqual(3)
      expect(id.length).toBeLessThanOrEqual(40)
      expect(id).toMatch(/^[A-Za-z0-9]+$/)
    }
  })
})

describe('normaliseRefundStatus', () => {
  // USE: the buyer's RefundPanel only knows pending / processed / failed.
  // An unmapped Cashfree status would leave the bar stuck or wrong.
  it('maps Cashfree statuses onto the stored vocabulary', () => {
    expect(normaliseRefundStatus('SUCCESS')).toBe('processed')
    expect(normaliseRefundStatus('PENDING')).toBe('pending')
    expect(normaliseRefundStatus('ONHOLD')).toBe('pending')
    expect(normaliseRefundStatus('CANCELLED')).toBe('failed')
    expect(normaliseRefundStatus('REJECTED')).toBe('failed')
    expect(normaliseRefundStatus(undefined)).toBe('pending')
  })
})

describe('resolvePaymentLabel', () => {
  // USE: buyers see the app they paid with, never the gateway's name.
  it('names the UPI app from the VPA handle', () => {
    expect(resolvePaymentLabel({ payment_group: 'upi', payment_method: { upi: { upi_id: 'ravi@ybl' } } })).toBe('PhonePe')
    expect(resolvePaymentLabel({ payment_group: 'upi', payment_method: { upi: { upi_id: 'ravi@okaxis' } } })).toBe('Google Pay')
    expect(resolvePaymentLabel({ payment_group: 'upi', payment_method: { upi: { upi_id: 'ravi@unknownbank' } } })).toBe('UPI')
  })

  it('labels cards, netbanking and wallets', () => {
    expect(resolvePaymentLabel({ payment_group: 'credit_card', payment_method: { card: { card_network: 'visa' } } })).toBe('Visa card')
    expect(resolvePaymentLabel({ payment_group: 'net_banking', payment_method: { netbanking: { netbanking_bank_name: 'HDFC' } } })).toBe('HDFC NetBanking')
    expect(resolvePaymentLabel({ payment_group: 'wallet', payment_method: { app: { provider: 'paytm' } } })).toBe('Paytm')
  })

  it('returns null when there is nothing to go on', () => {
    expect(resolvePaymentLabel(null)).toBeNull()
    expect(resolvePaymentLabel({ payment_group: null, payment_method: null })).toBeNull()
  })
})

describe('getSettlement', () => {
  afterEach(() => vi.unstubAllGlobals())

  // Stub Cashfree's two GETs: the order, then its payments.
  function stub(order: unknown, payments: unknown) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body = String(url).endsWith('/payments') ? payments : order
      return new Response(JSON.stringify(body), { status: 200 })
    }))
  }

  // USE: the happy path — PAID with a SUCCESS payment covering the amount.
  it('accepts a fully paid order', async () => {
    stub(
      { order_id: 'gg_1', order_amount: 450, order_status: 'PAID' },
      [{ cf_payment_id: 777, payment_status: 'SUCCESS', payment_amount: 450, payment_group: 'upi', payment_method: { upi: { upi_id: 'a@ybl' } } }],
    )
    expect(await getSettlement('gg_1')).toEqual({ paid: true, paymentId: '777', label: 'PhonePe' })
  })

  // USE: the buyer closed the modal. Not paid → the Cart abandons the order.
  it('reports an ACTIVE order as unpaid', async () => {
    stub({ order_id: 'gg_1', order_amount: 450, order_status: 'ACTIVE' }, [])
    expect(await getSettlement('gg_1')).toEqual({ paid: false, orderStatus: 'ACTIVE' })
  })

  // USE: never mark an order paid off a payment smaller than what we charged.
  it('refuses a SUCCESS payment that does not cover the order', async () => {
    stub(
      { order_id: 'gg_1', order_amount: 450, order_status: 'PAID' },
      [{ cf_payment_id: 1, payment_status: 'SUCCESS', payment_amount: 45 }],
    )
    expect((await getSettlement('gg_1')).paid).toBe(false)
  })

  // USE: a FAILED attempt before a later SUCCESS must not be picked as the payment.
  it('picks the successful attempt, not an earlier failed one', async () => {
    stub(
      { order_id: 'gg_1', order_amount: 100, order_status: 'PAID' },
      [
        { cf_payment_id: 1, payment_status: 'FAILED', payment_amount: 100 },
        { cf_payment_id: 2, payment_status: 'SUCCESS', payment_amount: 100 },
      ],
    )
    expect(await getSettlement('gg_1')).toMatchObject({ paid: true, paymentId: '2' })
  })
})

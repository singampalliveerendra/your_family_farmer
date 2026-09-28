import { createHmac, timingSafeEqual } from 'crypto'

// Server-only Cashfree Payment Gateway helpers. Replaces src/lib/razorpay.ts.
//
// Plain fetch against the PG REST API — no SDK package, so nothing extra ships
// and the request shape is visible right here. The secret never leaves the
// server; the browser only ever gets a payment_session_id for one order.
//
// Env:
//   CASHFREE_APP_ID            x-client-id
//   CASHFREE_SECRET_KEY        x-client-secret, and the webhook signing key
//   NEXT_PUBLIC_CASHFREE_MODE  'sandbox' | 'production' (the browser SDK needs
//                              it too, hence public). Anything but 'production'
//                              is sandbox, so a missing var can never charge
//                              real money.

const API_VERSION = '2025-01-01'

export function cashfreeMode(): 'sandbox' | 'production' {
  return process.env.NEXT_PUBLIC_CASHFREE_MODE === 'production' ? 'production' : 'sandbox'
}

function baseUrl(): string {
  return cashfreeMode() === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg'
}

function getAppId(): string {
  const id = process.env.CASHFREE_APP_ID
  if (!id) throw new Error('CASHFREE_APP_ID is not set.')
  return id
}

function getSecret(): string {
  const secret = process.env.CASHFREE_SECRET_KEY
  if (!secret) throw new Error('CASHFREE_SECRET_KEY is not set.')
  return secret
}

export class CashfreeError extends Error {
  constructor(message: string, readonly status: number, readonly code: string | null) {
    super(message)
  }
}

async function cf<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      'x-client-id': getAppId(),
      'x-client-secret': getSecret(),
      'x-api-version': API_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) {
    const msg = typeof json?.message === 'string' ? json.message : `Cashfree ${method} ${path} failed`
    const code = typeof json?.code === 'string' ? json.code : null
    throw new CashfreeError(msg, res.status, code)
  }
  return json as T
}

// ── Ids ────────────────────────────────────────────────────────────────────
//
// Cashfree order ids are OURS to choose (alphanumeric, '_' and '-', max 45) and
// must be unique forever — a terminated or expired id can never be reused. So
// each attempt gets a fresh one: the batch's first row id plus a time suffix.
// "gg_" + 32 hex + "_" + ~8 base36 = 44 chars.
export function makeCashfreeOrderId(firstOrderRowId: string, now: number = Date.now()): string {
  return `gg_${firstOrderRowId.replace(/-/g, '')}_${now.toString(36)}`
}

// Refund ids are also ours (alphanumeric, 3–40) and Cashfree rejects a
// duplicate — which is exactly what we want: a retried decline can never pay
// the buyer twice. Deterministic per purpose:
//   'l' — the line refund for one order row (at most one per row)
//   'd' — a delivery-charge top-up refund on a sibling row; a row can take
//         several of these over time, so the running refunded total is part of
//         the id (each is distinct, each retry of the same one collides).
export function makeRefundId(kind: 'l' | 'd', orderRowId: string, runningTotal?: number): string {
  const hex = orderRowId.replace(/-/g, '')
  return kind === 'l' ? `l${hex}` : `d${hex}${Math.max(0, Math.round(runningTotal ?? 0))}`
}

// ── Orders ───────────────────────────────────────────────────────────────────

export type CashfreeOrder = {
  order_id: string
  cf_order_id?: string | number
  order_amount: number
  order_status: string // ACTIVE | PAID | EXPIRED | TERMINATED | TERMINATION_REQUESTED
  payment_session_id?: string | null
}

export async function createCashfreeOrder(args: {
  orderId: string
  amountRupees: number
  customerId: string
  customerPhone: string
  customerName?: string | null
  note?: string
  tags?: Record<string, string>
}): Promise<CashfreeOrder> {
  return cf<CashfreeOrder>('POST', '/orders', {
    order_id: args.orderId,
    order_amount: Number(args.amountRupees.toFixed(2)),
    order_currency: 'INR',
    customer_details: {
      customer_id: args.customerId,
      customer_phone: args.customerPhone,
      ...(args.customerName ? { customer_name: args.customerName } : {}),
    },
    ...(args.note ? { order_note: args.note.slice(0, 200) } : {}),
    ...(args.tags ? { order_tags: args.tags } : {}),
  })
}

export async function fetchCashfreeOrder(orderId: string): Promise<CashfreeOrder> {
  return cf<CashfreeOrder>('GET', `/orders/${encodeURIComponent(orderId)}`)
}

// Stop an unpaid order from being paid later. Called when the buyer abandons
// checkout, so a payment finishing after we've cancelled the rows and released
// the stock is refused by Cashfree rather than landing on a cancelled order.
// Best-effort: an order that's already PAID or EXPIRED just returns an error.
export async function terminateCashfreeOrder(orderId: string): Promise<void> {
  try {
    await cf('PATCH', `/orders/${encodeURIComponent(orderId)}`, { order_status: 'TERMINATED' })
  } catch (e) {
    console.warn('[YFF cashfree] terminate failed (often harmless):', orderId, (e as Error).message)
  }
}

// ── Payments ─────────────────────────────────────────────────────────────────

export type CashfreePayment = {
  cf_payment_id: string | number
  payment_status: string // SUCCESS | FAILED | PENDING | USER_DROPPED | VOID | CANCELLED | NOT_ATTEMPTED
  payment_amount: number
  payment_group?: string | null
  payment_method?: Record<string, Record<string, unknown> | undefined> | null
}

export async function fetchCashfreePayments(orderId: string): Promise<CashfreePayment[]> {
  const res = await cf<CashfreePayment[] | null>('GET', `/orders/${encodeURIComponent(orderId)}/payments`)
  return Array.isArray(res) ? res : []
}

export type Settlement =
  | { paid: true; paymentId: string; label: string | null }
  | { paid: false; orderStatus: string }

/**
 * Ask Cashfree whether an order is really paid, in full.
 *
 * This is the whole of verification: unlike Razorpay there is no client-side
 * signature, and there should not be — the browser's "payment done" is only a
 * hint. We require order_status PAID and a SUCCESS payment whose amount covers
 * the order amount (which is the figure OUR server set at create time).
 *
 * Throws when Cashfree can't be reached; callers decide whether that is fatal.
 */
export async function getSettlement(orderId: string): Promise<Settlement> {
  const order = await fetchCashfreeOrder(orderId)
  if (order.order_status !== 'PAID') return { paid: false, orderStatus: order.order_status }

  const payments = await fetchCashfreePayments(orderId)
  const ok = payments.find(
    (p) => p.payment_status === 'SUCCESS' && Number(p.payment_amount) + 0.001 >= Number(order.order_amount),
  )
  if (!ok) {
    console.warn('[YFF cashfree] order PAID but no covering SUCCESS payment:', orderId)
    return { paid: false, orderStatus: 'UNDERPAID' }
  }
  return { paid: true, paymentId: String(ok.cf_payment_id), label: resolvePaymentLabel(ok) }
}

// ── Payment-method label ─────────────────────────────────────────────────────

// Map a UPI VPA handle (the part after "@") to the app the buyer paid with.
function upiAppFromVpa(vpa?: string | null): string | null {
  if (!vpa || !vpa.includes('@')) return null
  const handle = vpa.split('@')[1]?.toLowerCase() ?? ''
  if (['ybl', 'ibl', 'axl', 'yapl'].includes(handle)) return 'PhonePe'
  if (handle.startsWith('ok')) return 'Google Pay'
  if (['paytm', 'ptyes', 'ptaxis', 'pthdfc', 'ptsbi'].includes(handle)) return 'Paytm'
  if (handle === 'apl' || handle === 'amazonpay') return 'Amazon Pay'
  if (handle === 'axisb' && (vpa.startsWith('cred') || vpa.includes('.cred'))) return 'CRED'
  return null
}

const WALLETS: Record<string, string> = {
  phonepe: 'PhonePe', paytm: 'Paytm', amazon: 'Amazon Pay', amazonpay: 'Amazon Pay',
  freecharge: 'Freecharge', mobikwik: 'MobiKwik', airtel: 'Airtel Money', airtelmoney: 'Airtel Money',
  gpay: 'Google Pay', googlepay: 'Google Pay',
}

// Turn a Cashfree payment into a label we show buyers ("PhonePe", "Visa card",
// "HDFC NetBanking"…). Never the gateway's name. Null when nothing useful.
export function resolvePaymentLabel(
  p: Pick<CashfreePayment, 'payment_group' | 'payment_method'> | null | undefined,
): string | null {
  if (!p) return null
  const group = (p.payment_group ?? '').toLowerCase()
  const m = p.payment_method ?? {}
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

  if (group === 'upi' || m.upi) return upiAppFromVpa(str(m.upi?.upi_id)) ?? 'UPI'
  if (group === 'wallet' || m.app) {
    const provider = str(m.app?.provider)?.toLowerCase() ?? ''
    return WALLETS[provider] ?? (provider ? `${m.app?.provider} wallet` : 'Wallet')
  }
  if (group.includes('card') || m.card) {
    const net = str(m.card?.card_network)
    return net ? `${net.charAt(0).toUpperCase()}${net.slice(1)} card` : 'Card'
  }
  if (group === 'net_banking' || m.netbanking) {
    const bank = str(m.netbanking?.netbanking_bank_name)
    return bank ? `${bank} NetBanking` : 'NetBanking'
  }
  if (group.includes('emi')) return 'EMI'
  if (group === 'pay_later' || m.cardless_emi || m.pay_later) return 'Pay Later'
  if (group) return group.replace(/_/g, ' ').toUpperCase()
  return null
}

// ── Refunds ──────────────────────────────────────────────────────────────────

export type RefundResult = {
  id: string
  // Normalised to the vocabulary the order pages already read:
  // 'pending' | 'processed' | 'failed'.
  status: string
  amountRupees: number
}

// Cashfree's refund_status → the values stored in orders.refund_status (the
// buyer's RefundPanel maps pending → Processing, processed → Credited).
export function normaliseRefundStatus(s: string | null | undefined): string {
  switch ((s ?? '').toUpperCase()) {
    case 'SUCCESS': return 'processed'
    case 'CANCELLED':
    case 'REJECTED': return 'failed'
    default: return 'pending' // PENDING, PENDING_APPROVAL, ONHOLD
  }
}

/**
 * Refund part of a Cashfree order. Refunds are keyed by ORDER id (Razorpay's
 * were by payment id) — every row of a cart shares one Cashfree order, so each
 * row refunds only its own amount and the sum can never exceed what was paid.
 *
 * `refundId` must come from makeRefundId so a retry is rejected as a duplicate
 * instead of paying twice. A duplicate is treated as success: the earlier call
 * already went through. Throws on any other failure.
 */
export async function refundCashfreeOrder(args: {
  cashfreeOrderId: string
  refundId: string
  amountRupees: number
  note?: string
}): Promise<RefundResult> {
  try {
    const r = await cf<{ cf_refund_id?: string | number; refund_status?: string; refund_amount?: number }>(
      'POST',
      `/orders/${encodeURIComponent(args.cashfreeOrderId)}/refunds`,
      {
        refund_amount: Number(args.amountRupees.toFixed(2)),
        refund_id: args.refundId,
        refund_speed: 'STANDARD',
        ...(args.note ? { refund_note: args.note.slice(0, 100).padEnd(3, '.') } : {}),
      },
    )
    return {
      id: String(r.cf_refund_id ?? args.refundId),
      status: normaliseRefundStatus(r.refund_status),
      amountRupees: Number(r.refund_amount) || args.amountRupees,
    }
  } catch (e) {
    if (e instanceof CashfreeError && /duplicate|already exists/i.test(e.message)) {
      return { id: args.refundId, status: 'pending', amountRupees: args.amountRupees }
    }
    throw e
  }
}

// ── Webhook ──────────────────────────────────────────────────────────────────

// Cashfree signs base64(HMAC-SHA256(timestamp + rawBody)) with the PG secret
// key, sent as x-webhook-signature / x-webhook-timestamp. Verify against the
// EXACT bytes received, so the route reads req.text() before parsing.
export function verifyWebhookSignature(
  rawBody: string,
  timestamp: string | null | undefined,
  signature: string | null | undefined,
): boolean {
  const secret = getSecret()
  if (!signature || !timestamp) return false
  const expected = createHmac('sha256', secret).update(timestamp + rawBody).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

'use client'

// Browser half of the Cashfree flow. Replaces the Razorpay Checkout code that
// lived inline in Cart.tsx.
//
// The SDK is loaded lazily — only the first time a buyer pays online — so the
// catalogue stays light on slow connections.
const CASHFREE_SDK = 'https://sdk.cashfree.com/js/v3/cashfree.js'

type CashfreeCheckoutResult = {
  error?: { message?: string; code?: string } | null
  redirect?: boolean
  paymentDetails?: { paymentMessage?: string } | null
}
type CashfreeInstance = {
  checkout: (opts: { paymentSessionId: string; redirectTarget: '_modal' | '_self' | '_blank' }) => Promise<CashfreeCheckoutResult>
}
declare global {
  interface Window {
    Cashfree?: (opts: { mode: 'sandbox' | 'production' }) => CashfreeInstance
  }
}

export function loadCashfreeScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false)
    if (window.Cashfree) return resolve(true)
    const script = document.createElement('script')
    script.src = CASHFREE_SDK
    script.onload = () => resolve(!!window.Cashfree)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export type CashfreeCreateResponse = {
  ok: true
  mode: 'sandbox' | 'production'
  cashfreeOrderId: string
  paymentSessionId: string
  amount: number // paise
  currency: string
  platformFee: number
  deliveryFee: number
}

export type CashfreeOutcome =
  // Cashfree confirmed the full amount; the rows are marked paid.
  | { kind: 'paid'; paymentId: string }
  // Cashfree says it is NOT paid (closed, failed, dropped). Safe to abandon.
  | { kind: 'unpaid' }
  // We could not find out. Do NOT abandon — money may have been taken; the
  // webhook / reconcile cron will settle it.
  | { kind: 'unknown'; error: string | null }

/**
 * Open the Cashfree modal and, once it closes for ANY reason, ask our server
 * what really happened. The modal's own result is never trusted either way:
 * a UPI collect can succeed after an "error", and a "success" means nothing
 * until /verify has seen PAID from Cashfree itself.
 */
export async function runCashfreeCheckout(
  created: CashfreeCreateResponse,
  auth: { guestToken?: string; guestBatches?: Array<{ orderIds: string[]; token: string }> },
): Promise<CashfreeOutcome> {
  if (!window.Cashfree) return { kind: 'unknown', error: null }
  const cashfree = window.Cashfree({ mode: created.mode })

  try {
    await cashfree.checkout({ paymentSessionId: created.paymentSessionId, redirectTarget: '_modal' })
  } catch (e) {
    // The SDK itself threw (bad session id, blocked popup…). Still verify: a
    // payment could have been made before it fell over.
    console.warn('[YFF] cashfree checkout threw:', e)
  }

  const vr = await fetch('/api/orders/cashfree/verify', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cashfreeOrderId: created.cashfreeOrderId, ...auth }),
  })
    .then((r) => r.json().catch(() => null))
    .catch(() => null) as { ok?: boolean; paid?: boolean; paymentId?: string; error?: string } | null

  if (vr?.ok && vr.paymentId) return { kind: 'paid', paymentId: vr.paymentId }
  if (vr && vr.ok === false && vr.paid === false) return { kind: 'unpaid' }
  return { kind: 'unknown', error: vr?.error ?? null }
}

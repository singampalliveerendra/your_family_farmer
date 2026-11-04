'use client'

// Browser half of paying for a plan. Same Cashfree modal and the same polling
// rules as the shop (src/lib/cashfreeCheckout.ts, src/lib/cashfreePoll.ts),
// but asks /api/aggregator/subscription/verify — so a plan payment never goes
// near the shop's order code. The modal's own result is never trusted: only
// Cashfree's PAID, read by our server, activates a plan.

import { loadCashfreeScript } from '@/lib/cashfreeCheckout'
import { nextPollStep, POLL_INTERVAL_MS } from '@/lib/cashfreePoll'

export type StartReply =
  | { ok: true; free: true; subscriptionId: string }
  | { ok: true; free: false; subscriptionId: string; mode: 'sandbox' | 'production'; cashfreeOrderId: string; paymentSessionId: string; amount: number }

export type SubscriptionOutcome =
  | { kind: 'active'; subscriptionId: string }
  | { kind: 'unpaid' }
  | { kind: 'processing' }
  | { kind: 'error'; error: string }

type VerifyReply = { ok?: boolean; paid?: boolean; pending?: boolean; orderStatus?: string; subscriptionId?: string; error?: string }

export async function startSubscription(planId: string, startMode: 'now' | 'after_current'): Promise<StartReply | { ok: false; error: string }> {
  const r = await fetch('/api/aggregator/subscription/start', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, startMode }),
  }).catch(() => null)
  const j = r ? await r.json().catch(() => null) : null
  if (!r || !r.ok || !j?.ok) return { ok: false, error: j?.error ?? 'Could not start. Please check your connection and try again.' }
  return j as StartReply
}

export async function paySubscription(
  created: Extract<StartReply, { free: false }>,
  onConfirming?: () => void,
): Promise<SubscriptionOutcome> {
  if (!(await loadCashfreeScript()) || !window.Cashfree) return { kind: 'error', error: 'Could not open the payment page. Please try again.' }
  try {
    await window.Cashfree({ mode: created.mode }).checkout({ paymentSessionId: created.paymentSessionId, redirectTarget: '_modal' })
  } catch (e) {
    console.warn('[YFF] subscription checkout threw:', e)
  }
  onConfirming?.()
  const started = Date.now()
  for (;;) {
    const vr = (await fetch('/api/aggregator/subscription/verify', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cashfreeOrderId: created.cashfreeOrderId }),
    }).then((r) => r.json()).catch(() => null)) as VerifyReply | null
    if (vr?.ok && vr.paid) return { kind: 'active', subscriptionId: vr.subscriptionId ?? created.subscriptionId }
    if (!(vr && vr.ok === false && vr.paid === false)) {
      // Could not find out (network / server). Not "unpaid": the webhook and
      // the nightly check will still activate it if the money went through.
      return { kind: 'processing' }
    }
    const step = nextPollStep({ inFlight: !!vr.pending, orderStatus: vr.orderStatus ?? null }, Date.now() - started)
    if (step === 'unpaid') return { kind: 'unpaid' }
    if (step === 'processing') return { kind: 'processing' }
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS))
  }
}

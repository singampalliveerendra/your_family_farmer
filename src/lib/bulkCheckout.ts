'use client'

// Browser half of buying a bulk lot (Phase 6): place the order (the server
// prices it and claims the stock), open the Cashfree modal, then ask our
// server — never the modal — whether it was paid, with the shop's polling
// rules (src/lib/cashfreePoll.ts). A checkout closed without paying is
// abandoned so the stock goes back.

import { loadCashfreeScript } from '@/lib/cashfreeCheckout'
import { nextPollStep, POLL_INTERVAL_MS } from '@/lib/cashfreePoll'
import type { Delivery } from '@/lib/bulkOrder'

export type PlaceReply = {
  ok: true
  orderId: string
  orderCode: string | null
  mode: 'sandbox' | 'production'
  cashfreeOrderId: string
  paymentSessionId: string
  total: number
}

export type BulkOutcome = { kind: 'paid'; orderId: string } | { kind: 'unpaid' } | { kind: 'processing' } | { kind: 'error'; error: string }

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }))
    .catch(() => ({ status: 0, json: null }))

export async function placeBulkOrder(args: {
  listingId: string
  qty: number
  delivery: Delivery
  address?: { line: string; city: string; pincode: string; landmark: string }
}): Promise<PlaceReply | { ok: false; error: string }> {
  const r = await post('/api/aggregator/bulk-orders/place', args)
  if (r.status !== 200 || !r.json?.ok) return { ok: false, error: r.json?.error ?? 'Could not place the order. Please check your connection.' }
  return r.json as PlaceReply
}

export async function payBulkOrder(created: PlaceReply, onConfirming?: () => void): Promise<BulkOutcome> {
  if (!(await loadCashfreeScript()) || !window.Cashfree) return { kind: 'error', error: 'Could not open the payment page. Please try again.' }
  try {
    await window.Cashfree({ mode: created.mode }).checkout({ paymentSessionId: created.paymentSessionId, redirectTarget: '_modal' })
  } catch (e) {
    console.warn('[YFF] bulk checkout threw:', e)
  }
  onConfirming?.()
  const started = Date.now()
  for (;;) {
    const r = await post('/api/aggregator/bulk-orders/verify', { cashfreeOrderId: created.cashfreeOrderId })
    const v = r.json as { ok?: boolean; paid?: boolean; pending?: boolean; orderStatus?: string; orderId?: string } | null
    if (v?.ok && v.paid) return { kind: 'paid', orderId: v.orderId ?? created.orderId }
    if (!(v && v.ok === false && v.paid === false)) return { kind: 'processing' }
    const step = nextPollStep({ inFlight: !!v.pending, orderStatus: v.orderStatus ?? null }, Date.now() - started)
    if (step === 'unpaid') {
      // Give the stock back — the server re-checks Cashfree before cancelling.
      const a = await post('/api/aggregator/bulk-orders/abandon', { cashfreeOrderId: created.cashfreeOrderId })
      const res = a.json as { paid?: boolean; processing?: boolean } | null
      if (res?.paid) return { kind: 'paid', orderId: created.orderId }
      if (res?.processing) return { kind: 'processing' }
      return { kind: 'unpaid' }
    }
    if (step === 'processing') return { kind: 'processing' }
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS))
  }
}

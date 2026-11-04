/**
 * The receipt for one subscription payment (decision 2026-11-04: generate a
 * receipt for every subscription payment; not a GST invoice). Also issued for a
 * ₹0 plan, so the aggregator has a record that it started. Moderator grants
 * (manual / free forever) are not purchases and get no receipt.
 * Pure: /aggregator/subscription/receipt/[id] renders whatever this returns.
 */

import { receiptDate, receiptFileName, rupees, type Msg } from '@/lib/orderReceipt'
import { PLAN_KIND_LABELS, durationLabel, isPlanKind } from '@/lib/subscriptionPlans'

export type ReceiptSub = {
  id: string
  kind: string
  source: string
  status: string
  starts_at: string
  ends_at: string | null
  amount_paid?: number | string | null
  price_actual?: number | string | null
  plan_name?: string | null
  duration_days?: number | null
  paid_at?: string | null
  payment_ref?: string | null
  payment_label?: string | null
  receipt_no?: string | null
  created_at?: string | null
}

export type SubscriptionReceipt = {
  number: string
  issuedAt: string
  planName: string
  kind: Msg
  period: { from: string; to: string }
  duration: Msg | null
  lines: Array<{ label: Msg; value: string; tone?: 'saving' }>
  total: string
  payment: Array<{ label: Msg; value: string | Msg }>
  fileName: string
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** A row that has a receipt: a paid plan that is active, or a ₹0 plan. */
export function hasReceipt(s: Pick<ReceiptSub, 'source' | 'status' | 'receipt_no'>): boolean {
  return (s.source === 'payment' || s.source === 'free_plan') && s.status === 'active' && !!s.receipt_no
}

export function buildSubscriptionReceipt(s: ReceiptSub): SubscriptionReceipt | null {
  if (!hasReceipt(s)) return null
  const paid = num(s.amount_paid)
  const actual = Math.max(paid, num(s.price_actual))
  const discount = Math.round((actual - paid) * 100) / 100
  const free = s.source === 'free_plan' || paid === 0
  const lines: SubscriptionReceipt['lines'] = [{ label: { en: 'Plan price', te: 'ప్లాన్ ధర' }, value: rupees(actual) }]
  if (discount > 0) lines.push({ label: { en: 'Offer discount', te: 'ఆఫర్ తగ్గింపు' }, value: `− ${rupees(discount)}`, tone: 'saving' })

  const payment: SubscriptionReceipt['payment'] = free
    ? [{ label: { en: 'Payment', te: 'చెల్లింపు' }, value: { en: 'Free plan — no payment', te: 'ఉచిత ప్లాన్ — చెల్లింపు లేదు' } }]
    : [
        { label: { en: 'Paid by', te: 'చెల్లింపు విధానం' }, value: (s.payment_label ?? '').trim() || { en: 'Online (Cashfree)', te: 'ఆన్‌లైన్ (క్యాష్‌ఫ్రీ)' } },
        { label: { en: 'Paid on', te: 'చెల్లించిన తేదీ' }, value: receiptDate(s.paid_at) },
        ...((s.payment_ref ?? '').trim() ? [{ label: { en: 'Reference', te: 'రిఫరెన్స్' }, value: s.payment_ref!.trim() }] : []),
      ]

  const number = s.receipt_no as string
  return {
    number,
    issuedAt: receiptDate(s.paid_at ?? s.starts_at),
    planName: (s.plan_name ?? '').trim() || '—',
    kind: isPlanKind(s.kind) ? PLAN_KIND_LABELS[s.kind] : { en: s.kind, te: s.kind },
    period: { from: receiptDate(s.starts_at), to: receiptDate(s.ends_at) },
    duration: s.duration_days ? durationLabel(s.duration_days) : null,
    lines,
    total: rupees(paid),
    payment,
    fileName: receiptFileName(number),
  }
}

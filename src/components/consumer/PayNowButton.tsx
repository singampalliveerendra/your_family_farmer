'use client'

import { useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { loadCashfreeScript, runCashfreeCheckout, type CashfreeCreateResponse } from '@/lib/cashfreeCheckout'

/* "Pay Now" for an order whose online payment is pending or failed (client
 * 2026-11-13; rules in src/lib/payPending.ts). One tap → the usual Cashfree
 * checkout → back on the order showing Paid. The button locks while a payment
 * is going on, and the server refuses to start a second one, so a buyer can
 * never pay twice. Closing the checkout leaves the order as it was — the buyer
 * can tap Pay Now again. */

type Phase =
  | { kind: 'idle' }
  | { kind: 'busy'; text: string }
  | { kind: 'paid' }
  | { kind: 'note'; text: string; tone: 'amber' | 'red' }

export default function PayNowButton({ orderId, onPaid, compact = false }: {
  orderId: string
  /** Called once the payment is recorded — the parent refetches. */
  onPaid?: () => void
  /** Smaller, for the order list card. */
  compact?: boolean
}) {
  const { L } = useLang()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const pay = async () => {
    if (phase.kind === 'busy') return
    setPhase({ kind: 'busy', text: L('Opening secure payment…', 'సురక్షిత చెల్లింపు తెరుస్తోంది…') })
    const [sdkOk, res] = await Promise.all([
      loadCashfreeScript(),
      fetch(`/api/consumer/orders/${orderId}/pay`, { method: 'POST', credentials: 'same-origin' })
        .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
        .catch(() => null),
    ])
    const body = res?.body as (Partial<CashfreeCreateResponse> & { error?: string; alreadyPaid?: boolean; processing?: boolean }) | null
    if (body?.alreadyPaid) {
      setPhase({ kind: 'paid' })
      onPaid?.()
      return
    }
    if (!res || !body?.ok || !body.paymentSessionId) {
      setPhase({
        kind: 'note',
        tone: body?.processing ? 'amber' : 'red',
        text: body?.error ?? L('Could not start payment. Please check your internet and try again.', 'చెల్లింపు ప్రారంభం కాలేదు. ఇంటర్నెట్ చూసి మళ్లీ ప్రయత్నించండి.'),
      })
      return
    }
    if (!sdkOk) {
      setPhase({ kind: 'note', tone: 'red', text: L('Could not load the payment page. Please try again.', 'చెల్లింపు పేజీ లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.') })
      return
    }
    const outcome = await runCashfreeCheckout(body as CashfreeCreateResponse, {}, () =>
      setPhase({ kind: 'busy', text: L('Confirming your payment…', 'మీ చెల్లింపు ధృవీకరిస్తోంది…') }),
    )
    if (outcome.kind === 'paid') {
      setPhase({ kind: 'paid' })
      onPaid?.()
    } else if (outcome.kind === 'unpaid') {
      setPhase({ kind: 'note', tone: 'amber', text: L('Payment not completed. No money was taken — tap Pay Now to try again.', 'చెల్లింపు పూర్తి కాలేదు. డబ్బు తీసుకోలేదు — మళ్లీ ప్రయత్నించడానికి ఇప్పుడే చెల్లించండి నొక్కండి.') })
    } else {
      setPhase({ kind: 'note', tone: 'amber', text: L('Your bank is still confirming. If money was taken, this order updates by itself in a few minutes.', 'మీ బ్యాంక్ ఇంకా ధృవీకరిస్తోంది. డబ్బు తీసుకుంటే, కొన్ని నిమిషాల్లో ఈ ఆర్డర్ దానంతటదే అప్‌డేట్ అవుతుంది.') })
    }
  }

  // Inside the order card (a link): never let a tap open the order page.
  const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation() }

  if (phase.kind === 'paid') {
    return (
      <p role="status" onClick={stop} className="rounded-xl bg-green-50 border border-green-200 px-3 py-2.5 text-center text-sm font-bold text-green-800">
        ✓ {L('Payment received', 'చెల్లింపు అందింది')}
      </p>
    )
  }

  const busy = phase.kind === 'busy'
  return (
    <div className="space-y-1.5" onClick={stop}>
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={(e) => { stop(e); void pay() }}
        className={`w-full rounded-xl bg-green-700 text-white font-extrabold active:bg-green-800 disabled:opacity-70 ${compact ? 'py-2.5 text-sm' : 'py-3.5 text-base'}`}
      >
        {busy
          ? phase.text
          : `💳 ${L('Pay Now', 'ఇప్పుడే చెల్లించండి')}`}
      </button>
      {/* The checkout shows the exact amount — with the rest of the same
          checkout when it was placed together with other farmers' items. */}
      {phase.kind === 'note' && (
        <p role="alert" className={`text-xs leading-snug rounded-lg px-2.5 py-1.5 ${phase.tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
          {phase.text}
        </p>
      )}
    </div>
  )
}

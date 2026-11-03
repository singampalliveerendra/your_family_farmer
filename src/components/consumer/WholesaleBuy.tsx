'use client'

import { EditableQty } from '@/components/consumer/Cart'
import { formatQty } from '@/lib/saleStep'
import { TRANSPORT_STATE_LABELS } from '@/lib/wholesale'
import {
  WHOLESALE_PICKUP_NOTE,
  WHOLESALE_TRANSPORT_CHARGE_NOTE,
  wholesaleStepDown,
  wholesaleStepUp,
  type WholesaleLine,
} from '@/lib/wholesaleOrder'

// "Buy wholesale" on a produce / harvest page (src/lib/wholesaleOrder.ts).
// WholesaleSwitch sits in the page: the Retail | Wholesale switch and what
// wholesale means for this produce. WholesaleBuyBar replaces the sticky
// add-to-cart bar while Wholesale is chosen. Shown only for produce sold as
// Both — the pages decide that with wholesaleLineOf().

type Translate = (en: string, te: string) => string
type Rules = { min: number; step: number }

export function WholesaleSwitch({
  line,
  rules,
  wholesale,
  onChange,
  available,
  unitLabel,
  L,
}: {
  line: WholesaleLine
  rules: Rules
  wholesale: boolean
  onChange: (wholesale: boolean) => void
  /** False when this harvest's stock is below the minimum. */
  available: boolean
  unitLabel: string
  L: Translate
}) {
  const btn = (active: boolean) =>
    `min-h-[44px] rounded-xl border-2 px-2 text-sm font-bold ${active ? 'border-green-600 bg-green-50 text-green-800' : 'border-gray-200 bg-white text-gray-600'}`
  const states = line.transportStates.map((s) => L(TRANSPORT_STATE_LABELS[s].en, TRANSPORT_STATE_LABELS[s].te)).join(', ')
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={L('Buy as', 'ఎలా కొనాలి')}>
        <button type="button" aria-pressed={!wholesale} onClick={() => onChange(false)} className={btn(!wholesale)}>
          🛒 {L('Retail', 'చిల్లర')}
        </button>
        <button type="button" aria-pressed={wholesale} onClick={() => onChange(true)} className={btn(wholesale)}>
          🚚 {L('Buy wholesale', 'హోల్‌సేల్ కొనండి')}
        </button>
      </div>
      {wholesale && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-3 space-y-1.5">
          <p className="text-base font-extrabold text-amber-900">
            ₹{formatQty(line.price)}<span className="text-xs font-bold">/{unitLabel}</span>
            <span className="ml-1.5 text-[11px] font-bold text-amber-800">{L('wholesale price', 'హోల్‌సేల్ ధర')}</span>
          </p>
          <p className="text-[12px] text-amber-900 leading-snug">
            {L(`Minimum ${formatQty(rules.min)} ${unitLabel}`, `కనీసం ${formatQty(rules.min)} ${unitLabel}`)}
            {line.packSize ? ` · ${L(`packs of ${formatQty(line.packSize)} ${unitLabel}`, `${formatQty(line.packSize)} ${unitLabel} ప్యాక్‌లు`)}` : ''}
          </p>
          <p className="text-[12px] text-amber-900 leading-snug">
            {line.transportStates.length
              ? `🚚 ${L(`Farmer delivers in ${states}.`, `రైతు ${states}లో డెలివరీ చేస్తారు.`)} ${L(WHOLESALE_TRANSPORT_CHARGE_NOTE.en, WHOLESALE_TRANSPORT_CHARGE_NOTE.te)}`
              : `🚶 ${L(WHOLESALE_PICKUP_NOTE.en, WHOLESALE_PICKUP_NOTE.te)}`}
          </p>
          {!available && (
            <p className="text-[12px] font-bold text-red-700">
              {L(`Not enough stock for wholesale right now (needs ${formatQty(rules.min)} ${unitLabel}).`, `ప్రస్తుతం హోల్‌సేల్‌కు సరిపడా స్టాక్ లేదు (${formatQty(rules.min)} ${unitLabel} కావాలి).`)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function WholesaleBuyBar({
  line,
  rules,
  qty,
  stock,
  available,
  busy,
  unitLabel,
  onAdd,
  onSet,
  L,
}: {
  line: WholesaleLine
  rules: Rules
  /** The wholesale line's quantity in the cart, or undefined when not in it. */
  qty: number | undefined
  stock: number | null
  available: boolean
  busy?: boolean
  unitLabel: string
  onAdd: () => void
  onSet: (qty: number) => void
  L: Translate
}) {
  if (!available) {
    return (
      <div className="w-full h-12 rounded-xl bg-gray-200 text-gray-500 font-bold flex items-center justify-center text-sm">
        {L('Not enough stock for wholesale', 'హోల్‌సేల్‌కు సరిపడా స్టాక్ లేదు')}
      </div>
    )
  }
  if (qty == null) {
    return (
      <button
        type="button"
        onClick={onAdd}
        disabled={busy}
        className="w-full h-12 bg-amber-600 active:opacity-90 text-white font-bold rounded-xl disabled:opacity-60"
      >
        {busy
          ? L('Checking…', 'తనిఖీ…')
          : L(
            `+ Add ${formatQty(rules.min)} ${unitLabel} wholesale · ₹${Math.round(line.price * rules.min)}`,
            `+ ${formatQty(rules.min)} ${unitLabel} హోల్‌సేల్ చేర్చు · ₹${Math.round(line.price * rules.min)}`,
          )}
      </button>
    )
  }
  const atMax = wholesaleStepUp(qty, rules, stock) <= qty
  return (
    <div className="flex items-center justify-between bg-amber-50 border border-amber-300 rounded-xl h-12 px-3">
      <button
        type="button"
        onClick={() => onSet(wholesaleStepDown(qty, rules))}
        className="w-9 h-9 rounded-lg bg-white border border-amber-300 text-amber-900 text-xl font-bold"
        aria-label={L('Decrease', 'తగ్గించు')}
      >−</button>
      <span className="flex flex-col items-center leading-tight">
        <EditableQty
          qty={qty}
          step={rules.step}
          unit={unitLabel}
          max={stock}
          onChange={onSet}
          inputClassName="font-extrabold text-amber-900 text-base"
          unitClassName="font-extrabold text-amber-900"
        />
        <span className="text-[10px] font-bold text-amber-800">₹{Math.round(line.price * qty)} · {L('wholesale', 'హోల్‌సేల్')}</span>
      </span>
      <button
        type="button"
        onClick={() => onSet(wholesaleStepUp(qty, rules, stock))}
        disabled={atMax}
        className={`w-9 h-9 rounded-lg text-xl font-bold ${atMax ? 'bg-gray-200 text-gray-400' : 'bg-amber-600 text-white'}`}
        aria-label={L('Increase', 'పెంచు')}
      >+</button>
    </div>
  )
}

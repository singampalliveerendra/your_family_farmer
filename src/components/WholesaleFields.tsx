'use client'

import { useId } from 'react'
import {
  SALE_MODES,
  SALE_MODE_LABELS,
  TRANSPORT_STATES,
  TRANSPORT_STATE_LABELS,
  offersRetail,
  offersWholesale,
  type RateForm,
  type SaleMode,
  type TransportState,
  type WholesaleForm,
} from '@/lib/wholesale'

// "Sell as" (Retail / Wholesale / Both), then the price box for each way of
// selling (two side by side for Both), then the wholesale details, which open
// only once Wholesale or Both is picked. Shared by the farmer/aggregator
// dashboard and the moderator listing form, so all three look and behave the
// same. The rules live in src/lib/wholesale.ts; this component only collects.
//
// Laid out for a 390px phone: three equal mode buttons, two quantity boxes side
// by side, everything else full width, and tap targets at least 44px tall.

type Translate = (en: string, te: string) => string

export default function WholesaleFields({
  value,
  onChange,
  unit,
  L,
  retailPrice,
  priceError,
}: {
  value: WholesaleForm
  onChange: (next: WholesaleForm) => void
  unit: string
  L: Translate
  /** The retail price per unit (tier 1) — owned by the parent form, shown here
   *  next to the wholesale price so "Both" clearly asks for two prices. */
  retailPrice: { value: string; onChange: (v: string) => void }
  /** Set by the parent when the two prices break a rule (wholesale not below retail). */
  priceError?: string | null
}) {
  const id = useId()
  const set = (patch: Partial<WholesaleForm>) => onChange({ ...value, ...patch })
  const open = offersWholesale(value.saleMode)
  const retail = offersRetail(value.saleMode)
  const both = value.saleMode === 'both'

  const toggleState = (s: TransportState) =>
    set({ states: value.states.includes(s) ? value.states.filter((x) => x !== s) : [...value.states, s] })
  const rateOf = (s: TransportState): RateForm => value.rates?.[s] ?? { mode: 'per_order', amount: '', freeAbove: '' }
  const setRate = (s: TransportState, patch: Partial<RateForm>) =>
    set({ rates: { ...(value.rates ?? {}), [s]: { ...rateOf(s), ...patch } } })

  const inputCls =
    'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-green-500 focus:outline-none min-h-[44px]'
  const labelCls = 'text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1'

  return (
    <div className="space-y-2">
      <span className={labelCls}>
        {L('Sell as', 'ఎలా అమ్మాలి')} <span className="text-red-500">*</span>
      </span>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={L('Sell as', 'ఎలా అమ్మాలి')}>
        {SALE_MODES.map((m: SaleMode) => {
          const active = value.saleMode === m
          const lbl = SALE_MODE_LABELS[m]
          return (
            <button
              key={m}
              type="button"
              aria-pressed={active}
              onClick={() => set({ saleMode: m })}
              className={`rounded-xl px-1 py-3 text-center border-2 transition-colors min-h-[56px] ${
                active ? 'border-green-600 bg-green-50' : 'border-gray-200 bg-white'
              }`}
            >
              <span className="block text-lg leading-none" aria-hidden>{lbl.icon}</span>
              <span className={`block text-[11px] font-bold mt-1 leading-tight ${active ? 'text-green-800' : 'text-gray-600'}`}>
                {L(lbl.en, lbl.te)}
              </span>
            </button>
          )
        })}
      </div>

      {/* Price — one box per way of selling. With "Both" the two sit side by
          side, each named for who pays it, so neither can be missed
          (2026-11-05: farmers saw only the wholesale price before). */}
      <div className="pt-1">
        <span className={labelCls}>
          {both ? L('Prices', 'ధరలు') : L('Price', 'ధర')} <span className="text-red-500">*</span>
        </span>
        <div className={`grid gap-2 ${both ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {retail && (
            <div className="rounded-xl border-2 border-green-200 bg-green-50/60 p-2.5">
              <label htmlFor={`${id}-retail`} className="block text-[12px] font-bold text-green-900 leading-tight">
                🏠 {L('Retail price', 'చిల్లర ధర')}
              </label>
              <span className="block text-[10px] text-green-800/80 mb-1.5">{L('For households', 'ఇళ్లకు')}</span>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                <input
                  id={`${id}-retail`}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={retailPrice.value}
                  onChange={(e) => retailPrice.onChange(e.target.value)}
                  className={`${inputCls} pl-6 pr-11`}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">/{unit}</span>
              </div>
            </div>
          )}
          {open && (
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50/60 p-2.5">
              <label htmlFor={`${id}-price`} className="block text-[12px] font-bold text-amber-900 leading-tight">
                🚚 {L('Wholesale price', 'హోల్‌సేల్ ధర')}
              </label>
              <span className="block text-[10px] text-amber-900/80 mb-1.5">{L('For aggregators', 'అగ్రిగేటర్లకు')}</span>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                <input
                  id={`${id}-price`}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={value.price}
                  onChange={(e) => set({ price: e.target.value })}
                  aria-invalid={!!priceError}
                  className={`${inputCls} pl-6 pr-11 ${priceError ? '!border-red-400' : ''}`}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">/{unit}</span>
              </div>
            </div>
          )}
        </div>
        {priceError ? (
          <p role="alert" className="mt-1.5 text-[12px] font-semibold text-red-700 leading-snug">{priceError}</p>
        ) : both ? (
          <p className="mt-1.5 text-[11px] text-gray-500 leading-snug">
            {L('Wholesale must be lower than retail.', 'హోల్‌సేల్ ధర చిల్లర ధర కంటే తక్కువగా ఉండాలి.')}
          </p>
        ) : null}
      </div>

      {open && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-3 space-y-3">
          <p className="text-sm font-extrabold text-amber-900">🚚 {L('Wholesale details', 'హోల్‌సేల్ వివరాలు')}</p>

          <div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={`${id}-pack`} className={labelCls}>{L('Pack size', 'ప్యాక్ పరిమాణం')}</label>
                <div className="relative">
                  <input
                    id={`${id}-pack`}
                    type="text"
                    inputMode="decimal"
                    placeholder={L('e.g. 25', 'ఉదా. 25')}
                    value={value.packSize}
                    onChange={(e) => set({ packSize: e.target.value })}
                    className={`${inputCls} pr-12`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{unit}</span>
                </div>
              </div>
              <div>
                <label htmlFor={`${id}-min`} className={labelCls}>{L('Minimum qty', 'కనీస పరిమాణం')}</label>
                <div className="relative">
                  <input
                    id={`${id}-min`}
                    type="text"
                    inputMode="decimal"
                    placeholder={L('e.g. 100', 'ఉదా. 100')}
                    value={value.minQty}
                    onChange={(e) => set({ minQty: e.target.value })}
                    className={`${inputCls} pr-12`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{unit}</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-600 mt-1 leading-snug">
              {L(
                'Fill one or both. With a pack size, buyers order whole packs.',
                'ఒకటి లేదా రెండూ నింపండి. ప్యాక్ పరిమాణం ఇస్తే, కొనుగోలుదారులు పూర్తి ప్యాక్‌లలో ఆర్డర్ చేస్తారు.',
              )}
            </p>
          </div>

          <div>
            <span className={labelCls}>
              {L('Can you transport?', 'మీరు రవాణా చేయగలరా?')} <span className="text-red-500">*</span>
            </span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={L('Can you transport?', 'మీరు రవాణా చేయగలరా?')}>
              {([
                [true, 'Yes', 'అవును'],
                [false, 'No — buyer collects', 'కాదు — కొనుగోలుదారు తీసుకెళ్తారు'],
              ] as const).map(([v, en, te]) => {
                const active = value.transport === v
                return (
                  <button
                    key={String(v)}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set({ transport: v })}
                    className={`rounded-xl px-2 py-2.5 text-xs font-bold border-2 leading-tight min-h-[44px] ${
                      active ? 'border-green-600 bg-green-50 text-green-800' : 'border-gray-200 bg-white text-gray-600'
                    }`}
                  >
                    {L(en, te)}
                  </button>
                )
              })}
            </div>
          </div>

          {value.transport === true && (
            <div>
              <span className={labelCls}>{L('Where can you transport?', 'ఎక్కడికి రవాణా చేయగలరు?')}</span>
              <div className="grid grid-cols-2 gap-2">
                {TRANSPORT_STATES.map((s) => {
                  const active = value.states.includes(s)
                  const lbl = TRANSPORT_STATE_LABELS[s]
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleState(s)}
                      className={`rounded-xl px-2 py-2.5 text-xs font-bold border-2 leading-tight min-h-[44px] ${
                        active ? 'border-green-600 bg-green-50 text-green-800' : 'border-gray-200 bg-white text-gray-600'
                      }`}
                    >
                      {active ? '✓ ' : ''}{L(lbl.en, lbl.te)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* The delivery charge per state (Phase 6) — what a bulk buyer pays
              at checkout. Blank = that state is pickup-only in the app. */}
          {value.transport === true && value.states.length > 0 && (
            <div className="space-y-2">
              <span className={labelCls}>{L('Transport charge', 'రవాణా ఛార్జ్')}</span>
              {TRANSPORT_STATES.filter((s) => value.states.includes(s)).map((s) => {
                const r = rateOf(s)
                const lbl = TRANSPORT_STATE_LABELS[s]
                return (
                  <div key={s} className="rounded-xl border border-amber-200 bg-white p-2.5 space-y-2">
                    <p className="text-xs font-extrabold text-gray-800">{L(lbl.en, lbl.te)}</p>
                    {/* Pick ONE (client, 2026-11-05): per order is paid online
                        with the produce; per km and cargo bill are billed after
                        delivery and paid to the seller directly. "Per kg" is no
                        longer offered — shown only on a lot still saved with it. */}
                    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={L(`How you charge for ${lbl.en}`, `${lbl.te}కు ఎలా ఛార్జ్ చేస్తారు`)}>
                      {([
                        ['per_order', 'Per order', 'ఒక్కో ఆర్డర్‌కు'],
                        ['per_km', 'Per km', 'కి.మీ.కు'],
                        ['cargo_bill', 'Cargo bill', 'కార్గో బిల్లు'],
                        ...(r.mode === 'per_unit' ? [['per_unit', `Per ${unit} (old)`, `ఒక్కో ${unit}కు (పాతది)`] as const] : []),
                      ] as const).map(([m, en, te]) => (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={r.mode === m}
                          onClick={() => setRate(s, { mode: m })}
                          className={`rounded-lg px-1.5 py-2 text-[11px] font-bold border-2 min-h-[40px] leading-tight ${
                            r.mode === m ? 'border-green-600 bg-green-50 text-green-800' : 'border-gray-200 bg-white text-gray-600'
                          }`}
                        >
                          {L(en, te)}
                        </button>
                      ))}
                    </div>

                    {r.mode === 'cargo_bill' ? (
                      <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900">
                        {L(
                          'After you deliver, upload the cargo bill on the order with its amount. The buyer pays you the transport directly.',
                          'డెలివరీ తర్వాత, ఆర్డర్‌పై కార్గో బిల్లును దాని మొత్తంతో అప్‌లోడ్ చేయండి. కొనుగోలుదారు రవాణా ఛార్జ్‌ను నేరుగా మీకు చెల్లిస్తారు.',
                        )}
                      </p>
                    ) : r.mode === 'per_km' ? (
                      <div>
                        <label htmlFor={`${id}-rate-${s}`} className="text-[11px] font-semibold text-gray-600 block mb-1">
                          {L('₹ per km', 'కి.మీ.కు ₹')}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                          <input
                            id={`${id}-rate-${s}`}
                            type="text"
                            inputMode="decimal"
                            placeholder={L('e.g. 5', 'ఉదా. 5')}
                            value={r.amount}
                            onChange={(e) => setRate(s, { amount: e.target.value })}
                            className={`${inputCls} pl-7 pr-12`}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">/km</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-amber-900">
                          {L(
                            'After delivery you enter the km; the app works out the bill (e.g. 20 km × ₹5 = ₹100). The buyer pays you directly.',
                            'డెలివరీ తర్వాత మీరు కి.మీ. నమోదు చేస్తారు; యాప్ బిల్లు లెక్కిస్తుంది (ఉదా. 20 కి.మీ. × ₹5 = ₹100). కొనుగోలుదారు నేరుగా మీకు చెల్లిస్తారు.',
                          )}
                        </p>
                      </div>
                    ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor={`${id}-rate-${s}`} className="text-[11px] font-semibold text-gray-600 block mb-1">
                          {r.mode === 'per_unit' ? L(`₹ per ${unit}`, `ఒక్కో ${unit}కు ₹`) : L('₹ per order', 'ఒక్కో ఆర్డర్‌కు ₹')}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                          <input
                            id={`${id}-rate-${s}`}
                            type="text"
                            inputMode="decimal"
                            placeholder={L('0 = free', '0 = ఉచితం')}
                            value={r.amount}
                            onChange={(e) => setRate(s, { amount: e.target.value })}
                            className={`${inputCls} pl-7`}
                          />
                        </div>
                      </div>
                      <div>
                        <label htmlFor={`${id}-free-${s}`} className="text-[11px] font-semibold text-gray-600 block mb-1">
                          {L('Free above (optional)', 'ఉచితం ఎప్పుడు (ఐచ్ఛికం)')}
                        </label>
                        <div className="relative">
                          <input
                            id={`${id}-free-${s}`}
                            type="text"
                            inputMode="decimal"
                            placeholder={L('e.g. 1000', 'ఉదా. 1000')}
                            value={r.freeAbove}
                            onChange={(e) => setRate(s, { freeAbove: e.target.value })}
                            className={`${inputCls} pr-12`}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{unit}</span>
                        </div>
                      </div>
                    </div>
                    )}
                    {r.mode !== 'cargo_bill' && r.amount.trim() === '' && (
                      <p className="text-[11px] text-amber-800 leading-snug">
                        {L(`Without a charge, buyers in ${lbl.en} can only collect from you.`, `ఛార్జ్ లేకపోతే, ${lbl.te}లోని కొనుగోలుదారులు మీ దగ్గర మాత్రమే తీసుకోగలరు.`)}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {value.saleMode === 'both' && (
            <p className="text-[11px] text-amber-900 leading-snug">
              {L(
                'Retail and wholesale sell from the same stock.',
                'చిల్లర మరియు హోల్‌సేల్ ఒకే స్టాక్ నుండి అమ్ముడవుతాయి.',
              )}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

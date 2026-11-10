'use client'

import { useId, type ReactNode } from 'react'
import { MAX_PACK_TIERS, packLabel, retailPackChoices, unitAllowsRetailPacks, type PackTierForm } from '@/lib/packPricing'
import { STEP_CHOICES, formatQty, unitAllowsFractions } from '@/lib/saleStep'
import { SALE_MODES, SALE_MODE_LABELS, offersRetail, offersWholesale, type SaleMode, type WholesaleForm } from '@/lib/wholesale'

// "How do you want to sell?" — client card 2026-11-10. One block shared by the
// farmer/aggregator dashboard and the moderator form:
//   1. Sell as: Retail / Wholesale / Both
//   2. Unit
//   3. Retail (if chosen): pack size for kg/gram (fixed list, or Loose);
//        pack  → price of one pack + "buy more, save more" in packs
//        loose → price per unit, "sell in multiples of", household tiers
//   4. Wholesale (if chosen): pack size (any unit, optional);
//        pack  → price of one pack (minimum = one pack, + adds a pack)
//        none  → minimum quantity + price per unit
// The rules live in src/lib/packPricing.ts and src/lib/wholesale.ts; this
// component only collects. Laid out for a 390px phone.

type Translate = (en: string, te: string) => string

/** The retail part of the form, as strings from the inputs. */
export type RetailSellForm = {
  /** Loose: ₹ per unit (tier 1) and the household tiers. */
  price: string
  tier1Qty: string
  price2: string
  price2Qty: string
  price3: string
  saleStep: string
  /** Packs (kg/gram): '' = loose. */
  packSize: string
  packPrice: string
  packTiers: PackTierForm[]
}

export default function SellHowFields({
  wholesale,
  onWholesale,
  unit,
  onUnit,
  unitOptions,
  retail,
  onRetail,
  L,
  priceError,
  retailHint,
}: {
  wholesale: WholesaleForm
  onWholesale: (next: WholesaleForm) => void
  unit: string
  onUnit: (u: string) => void
  unitOptions: Array<{ value: string; label: string }>
  retail: RetailSellForm
  onRetail: (patch: Partial<RetailSellForm>) => void
  L: Translate
  /** Set by the parent when the prices break a rule (wholesale not below retail). */
  priceError?: string | null
  /** e.g. the moderator's suggested price for this crop. */
  retailHint?: ReactNode
}) {
  const id = useId()
  const setW = (patch: Partial<WholesaleForm>) => onWholesale({ ...wholesale, ...patch })
  const showRetail = offersRetail(wholesale.saleMode)
  const showWholesale = offersWholesale(wholesale.saleMode)
  const packsOk = unitAllowsRetailPacks(unit)
  const retailPacked = packsOk && retail.packSize !== ''
  const wholesalePacked = wholesale.packSize.trim() !== ''

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-green-500 focus:outline-none min-h-[44px]'
  const labelCls = 'text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1'
  const money = (props: { id: string; value: string; onChange: (v: string) => void; suffix: string; invalid?: boolean }) => (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
      <input
        id={props.id}
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={props.invalid || undefined}
        className={`${inputCls} pl-7 pr-24 ${props.invalid ? '!border-red-400' : ''}`}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{props.suffix}</span>
    </div>
  )

  // Switching unit: a pack picked for kg makes no sense on gram / piece.
  const changeUnit = (u: string) => {
    onUnit(u)
    if (retail.packSize !== '') onRetail({ packSize: '', packTiers: [] })
  }

  const tiers: PackTierForm[] = Array.from({ length: MAX_PACK_TIERS }, (_, i) => retail.packTiers[i] ?? { minPacks: '', price: '' })
  const setTier = (i: number, patch: Partial<PackTierForm>) =>
    onRetail({ packTiers: tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) })
  const retailPackName = retailPacked ? packLabel(Number(retail.packSize), unit) : ''

  return (
    <div className="space-y-4">
      {/* 1. Sell as */}
      <div>
        <span className={labelCls}>
          {L('Sell as', 'ఎలా అమ్మాలి')} <span className="text-red-500">*</span>
        </span>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={L('Sell as', 'ఎలా అమ్మాలి')}>
          {SALE_MODES.map((m: SaleMode) => {
            const active = wholesale.saleMode === m
            const lbl = SALE_MODE_LABELS[m]
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => setW({ saleMode: m })}
                className={`rounded-xl px-1 py-3 text-center border-2 transition-colors min-h-[56px] ${active ? 'border-green-600 bg-green-50' : 'border-gray-200 bg-white'}`}
              >
                <span className="block text-lg leading-none" aria-hidden>{lbl.icon}</span>
                <span className={`block text-[11px] font-bold mt-1 leading-tight ${active ? 'text-green-800' : 'text-gray-600'}`}>{L(lbl.en, lbl.te)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. Unit */}
      <div>
        <label htmlFor={`${id}-unit`} className={labelCls}>{L('Unit', 'కొలత')}</label>
        <select id={`${id}-unit`} value={unit} onChange={(e) => changeUnit(e.target.value)} className={inputCls}>
          {unitOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* 3. Retail */}
      {showRetail && (
        <div className="rounded-2xl border-2 border-green-200 bg-green-50/60 p-3 space-y-3">
          <p className="text-sm font-extrabold text-green-900">🏠 {L('Retail — for households', 'చిల్లర — ఇళ్లకు')}</p>

          {packsOk && (
            <div>
              <label htmlFor={`${id}-rpack`} className={labelCls}>{L('Pack size', 'ప్యాక్ పరిమాణం')}</label>
              <select
                id={`${id}-rpack`}
                value={retail.packSize}
                onChange={(e) => onRetail({ packSize: e.target.value, ...(e.target.value === '' ? { packTiers: [] } : {}) })}
                className={inputCls}
              >
                <option value="">{L(`Loose — sell by the ${unit}`, `విడిగా — ${unit} చొప్పున`)}</option>
                {retailPackChoices(unit).map((c) => (
                  <option key={c.value} value={String(c.value)}>{L(`${c.label} pack`, `${c.label} ప్యాక్`)}</option>
                ))}
              </select>
            </div>
          )}

          {retailPacked ? (
            <>
              <div>
                <label htmlFor={`${id}-rpp`} className={labelCls}>
                  {L('Price of one pack', 'ఒక ప్యాక్ ధర')} <span className="text-red-500">*</span>
                </label>
                {money({ id: `${id}-rpp`, value: retail.packPrice, onChange: (v) => onRetail({ packPrice: v }), suffix: L(`/${retailPackName} pack`, `/${retailPackName} ప్యాక్`) })}
              </div>
              <div>
                <span className={labelCls}>{L('Buy more, save more (optional)', 'ఎక్కువ కొంటే తక్కువ ధర (ఐచ్ఛికం)')}</span>
                <div className="space-y-2">
                  {tiers.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={L(`Tier ${i + 1}: number of packs`, `శ్రేణి ${i + 1}: ప్యాక్‌ల సంఖ్య`)}
                        placeholder={i === 0 ? '5' : '10'}
                        value={t.minPacks}
                        onChange={(e) => setTier(i, { minPacks: e.target.value.replace(/\D/g, '') })}
                        className={`${inputCls} w-20 flex-none`}
                      />
                      <span className="text-xs text-gray-600 flex-none">{L('+ packs →', '+ ప్యాక్‌లు →')}</span>
                      <div className="relative flex-1 min-w-0">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={L(`Tier ${i + 1}: price per pack`, `శ్రేణి ${i + 1}: ఒక్కో ప్యాక్ ధర`)}
                          placeholder="0"
                          value={t.price}
                          onChange={(e) => setTier(i, { price: e.target.value })}
                          className={`${inputCls} pl-7 pr-14`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{L('/pack', '/ప్యాక్')}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-gray-600 mt-1 leading-snug">
                  {L(
                    'e.g. 5+ packs → ₹22 a pack. Buyers add one pack at a time.',
                    'ఉదా. 5+ ప్యాక్‌లు → ఒక్కో ప్యాక్ ₹22. కొనుగోలుదారులు ఒక్కో ప్యాక్ చొప్పున కలుపుతారు.',
                  )}
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor={`${id}-rp`} className={labelCls}>
                  {L('Retail price', 'చిల్లర ధర')} <span className="text-red-500">*</span>
                </label>
                {money({ id: `${id}-rp`, value: retail.price, onChange: (v) => onRetail({ price: v }), suffix: `/${unit}` })}
              </div>

              {/* Read IN the unit — "1/4" means a quarter kilo only once the unit says kg. */}
              {unitAllowsFractions(unit) && (
                <div>
                  <label htmlFor={`${id}-step`} className={labelCls}>{L('Sell in multiples of', 'ఎంత మోతాదులో అమ్మాలి')}</label>
                  <select id={`${id}-step`} value={retail.saleStep} onChange={(e) => onRetail({ saleStep: e.target.value })} className={inputCls}>
                    {STEP_CHOICES.map((o) => (
                      <option key={o.value} value={String(o.value)}>{L(o.en, o.te)} {unit}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {L(
                      `Buyers order in steps of this much. Pick 1/4 and a buyer's "+" adds ${formatQty(0.25)} ${unit} at a time.`,
                      `కొనుగోలుదారులు ఈ మోతాదులో ఆర్డర్ చేస్తారు. 1/4 ఎంచుకుంటే "+" నొక్కినప్పుడు ${formatQty(0.25)} ${unit} చొప్పున కలుస్తుంది.`,
                    )}
                  </p>
                </div>
              )}

              {/* Household bulk prices — optional, in the unit. */}
              <div className="space-y-2">
                <span className={labelCls}>{L('Lower price when a household buys more (optional)', 'ఇంటివాళ్లు ఎక్కువ కొంటే తక్కువ ధర (ఐచ్ఛికం)')}</span>
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="text-xs text-gray-500">{L('Retail price above is for up to', 'పై చిల్లర ధర ఇంతవరకు')}</span>
                  <input type="number" value={retail.tier1Qty} onChange={(e) => onRetail({ tier1Qty: e.target.value })} className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white" aria-label={L('Up to quantity', 'ఇంతవరకు పరిమాణం')} />
                  <span className="text-xs text-gray-400">{unit}</span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-gray-500 w-14 flex-shrink-0">{L('Tier 2', 'శ్రేణి 2')}</span>
                  <input type="number" placeholder={L('Up to', 'వరకు')} value={retail.price2Qty} onChange={(e) => onRetail({ price2Qty: e.target.value })} className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white" />
                  <span className="text-xs text-gray-400">{unit} →</span>
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                    <input type="number" placeholder={`Price/${unit}`} value={retail.price2} onChange={(e) => onRetail({ price2: e.target.value })} className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm bg-white" />
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-gray-500 w-14 flex-shrink-0">{L('Tier 3', 'శ్రేణి 3')}</span>
                  <span className="text-xs text-gray-400 w-20 text-center">{Number(retail.price2Qty) + 1}+ {unit}</span>
                  <span className="text-xs text-gray-400">→</span>
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                    <input type="number" placeholder={`Price/${unit}`} value={retail.price3} onChange={(e) => onRetail({ price3: e.target.value })} className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm bg-white" />
                  </div>
                </div>
              </div>
            </>
          )}
          {retailHint}
        </div>
      )}

      {/* 4. Wholesale */}
      {showWholesale && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-3 space-y-3">
          <p className="text-sm font-extrabold text-amber-900">🚚 {L('Wholesale — for aggregators', 'హోల్‌సేల్ — అగ్రిగేటర్లకు')}</p>
          <div>
            <label htmlFor={`${id}-wpack`} className={labelCls}>{L('Pack size (optional)', 'ప్యాక్ పరిమాణం (ఐచ్ఛికం)')}</label>
            <div className="relative">
              <input
                id={`${id}-wpack`}
                type="text"
                inputMode="decimal"
                placeholder={L('e.g. 25', 'ఉదా. 25')}
                value={wholesale.packSize}
                onChange={(e) => setW({ packSize: e.target.value })}
                className={`${inputCls} pr-14`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{unit}</span>
            </div>
          </div>
          {wholesalePacked ? (
            <div>
              <label htmlFor={`${id}-wpp`} className={labelCls}>
                {L('Price of one pack', 'ఒక ప్యాక్ ధర')} <span className="text-red-500">*</span>
              </label>
              {money({
                id: `${id}-wpp`, value: wholesale.packPrice, onChange: (v) => setW({ packPrice: v }), invalid: !!priceError,
                suffix: L(`/${packLabel(Number(wholesale.packSize) || 0, unit)} pack`, `/${packLabel(Number(wholesale.packSize) || 0, unit)} ప్యాక్`),
              })}
              <p className="text-[11px] text-gray-600 mt-1 leading-snug">
                {L('Buyers order whole packs: the minimum is one pack, and "+" adds one pack.', 'కొనుగోలుదారులు పూర్తి ప్యాక్‌లలో ఆర్డర్ చేస్తారు: కనీసం ఒక ప్యాక్, "+" ఒక ప్యాక్ కలుపుతుంది.')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={`${id}-wmin`} className={labelCls}>{L('Minimum qty', 'కనీస పరిమాణం')} <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input
                    id={`${id}-wmin`}
                    type="text"
                    inputMode="decimal"
                    placeholder={L('e.g. 100', 'ఉదా. 100')}
                    value={wholesale.minQty}
                    onChange={(e) => setW({ minQty: e.target.value })}
                    className={`${inputCls} pr-12`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{unit}</span>
                </div>
              </div>
              <div>
                <label htmlFor={`${id}-wp`} className={labelCls}>{L('Price', 'ధర')} <span className="text-red-500">*</span></label>
                {money({ id: `${id}-wp`, value: wholesale.price, onChange: (v) => setW({ price: v }), suffix: `/${unit}`, invalid: !!priceError })}
              </div>
            </div>
          )}
          {wholesale.saleMode === 'both' && (
            <p className="text-[11px] text-amber-900 leading-snug">
              {L('Retail and wholesale sell from the same stock. Wholesale must work out cheaper than retail.', 'చిల్లర మరియు హోల్‌సేల్ ఒకే స్టాక్ నుండి అమ్ముడవుతాయి. హోల్‌సేల్ చిల్లర కంటే తక్కువ ధర కావాలి.')}
            </p>
          )}
        </div>
      )}

      {priceError && <p role="alert" className="text-[12px] font-semibold text-red-700 leading-snug">{priceError}</p>}
    </div>
  )
}

/**
 * The prices as ₹ per unit, for the "wholesale must be cheaper than retail"
 * rule: a pack is turned into its per-unit price first, so a 250 g pack at
 * ₹25 and a 25 kg wholesale pack at ₹700 compare as ₹100/kg vs ₹28/kg.
 */
export function perUnitPriceRow(wholesale: WholesaleForm, retail: RetailSellForm, unit: string): Record<string, unknown> {
  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const wPack = n(wholesale.packSize)
  const wPackPrice = n(wholesale.packPrice)
  const wholesalePrice = wholesale.packSize.trim() !== '' ? (wPack > 0 && wPackPrice > 0 ? wPackPrice / wPack : '') : wholesale.price
  const rPack = n(retail.packSize)
  if (unitAllowsRetailPacks(unit) && rPack > 0) {
    const per = (p: string) => (n(p) > 0 ? n(p) / rPack : null)
    return {
      sale_mode: wholesale.saleMode,
      wholesale_price: wholesalePrice,
      price_tier_1_price: per(retail.packPrice),
      price_tier_2_price: per(retail.packTiers[0]?.price ?? ''),
      price_tier_3_price: per(retail.packTiers[1]?.price ?? ''),
    }
  }
  return {
    sale_mode: wholesale.saleMode,
    wholesale_price: wholesalePrice,
    price_tier_1_price: retail.price,
    price_tier_2_price: retail.price2,
    price_tier_3_price: retail.price3,
  }
}

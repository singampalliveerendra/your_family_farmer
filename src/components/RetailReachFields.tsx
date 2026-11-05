'use client'

import { DEFAULT_LOCAL_RADIUS_KM, RETAIL_STATES, stateName, type RetailReach } from '@/lib/retailReach'

/* "Delivers to" on a retail produce (client decision 2026-11-05) — shared by
 * the farmer / aggregator form and the moderator form:
 *   Local only    — buyers within the local delivery radius
 *   Transportable — also anywhere in Andhra Pradesh and / or Telangana, sent by
 *                   the farmer's courier, for a fixed charge per order per
 *                   state (blank = not that state, 0 = free)
 * Shown only when the produce can be delivered (not "Pickup only"). */

export type ReachForm = { reach: RetailReach; rates: Partial<Record<'AP' | 'TG', string>> }
export const EMPTY_REACH: ReachForm = { reach: 'local', rates: {} }

export function reachFormFromRow(row: { retail_reach?: unknown; retail_transport_rates?: unknown } | null | undefined): ReachForm {
  if (!row || row.retail_reach !== 'transport') return EMPTY_REACH
  const raw = (row.retail_transport_rates && typeof row.retail_transport_rates === 'object' ? row.retail_transport_rates : {}) as Record<string, unknown>
  const rates: ReachForm['rates'] = {}
  for (const s of RETAIL_STATES) if (raw[s] !== undefined && raw[s] !== null) rates[s] = String(raw[s])
  return { reach: 'transport', rates }
}

/** What the save sends. Nothing at all for a plain local produce (works before the migration). */
export function reachPayload(f: ReachForm, wasTransport: boolean): Record<string, unknown> {
  if (f.reach !== 'transport' && !wasTransport) return {}
  return { retail_reach: f.reach, retail_transport_rates: f.reach === 'transport' ? f.rates : {} }
}

export default function RetailReachFields({ value, onChange, radiusKm, L }: {
  value: ReachForm
  onChange: (v: ReachForm) => void
  radiusKm?: string
  L: (en: string, te: string) => string
}) {
  const radius = Number(radiusKm) > 0 ? Number(radiusKm) : DEFAULT_LOCAL_RADIUS_KM
  const btn = (on: boolean) =>
    `rounded-xl px-2 py-2.5 text-xs font-bold border-2 leading-tight min-h-[52px] text-left ${on ? 'border-green-600 bg-green-50 text-green-800' : 'border-gray-200 bg-white text-gray-600'}`
  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide block">{L('Delivers to', 'ఎక్కడికి డెలివరీ')}</span>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={L('Delivers to', 'ఎక్కడికి డెలివరీ')}>
        <button type="button" aria-pressed={value.reach === 'local'} onClick={() => onChange({ ...value, reach: 'local' })} className={btn(value.reach === 'local')}>
          📍 {L('Local only', 'స్థానికంగా మాత్రమే')}
          <span className="block text-[10px] font-semibold opacity-75">{L(`Buyers within ${radius} km`, `${radius} కి.మీ. లోపల కొనుగోలుదారులు`)}</span>
        </button>
        <button type="button" aria-pressed={value.reach === 'transport'} onClick={() => onChange({ ...value, reach: 'transport' })} className={btn(value.reach === 'transport')}>
          🚚 {L('Transportable', 'రవాణా చేయగలను')}
          <span className="block text-[10px] font-semibold opacity-75">{L('Across AP & Telangana', 'ఏపీ & తెలంగాణ అంతటా')}</span>
        </button>
      </div>
      {value.reach === 'transport' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
          <p className="text-[11px] leading-snug text-amber-900">
            {L(
              'You send it by courier / parcel. The buyer pays this charge online with the order (one charge per order). Leave a state blank if you do not send there.',
              'మీరు కొరియర్ / పార్సెల్ ద్వారా పంపుతారు. కొనుగోలుదారు ఈ ఛార్జ్‌ను ఆర్డర్‌తో ఆన్‌లైన్‌లో చెల్లిస్తారు (ఒక్కో ఆర్డర్‌కు ఒకసారి). పంపని రాష్ట్రాన్ని ఖాళీగా వదలండి.',
            )}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {RETAIL_STATES.map((s) => (
              <label key={s} className="block">
                <span className="mb-1 block text-[11px] font-semibold text-gray-700">{L(stateName(s).en, stateName(s).te)}</span>
                <span className="relative block">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={L('per order', 'ఒక్కో ఆర్డర్‌కు')}
                    value={value.rates[s] ?? ''}
                    onChange={(e) => onChange({ ...value, rates: { ...value.rates, [s]: e.target.value } })}
                    className="w-full min-h-[44px] rounded-xl border border-gray-200 bg-white pl-7 pr-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

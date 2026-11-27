'use client'

import { type ReactNode } from 'react'
import { type CourierForm } from '@/lib/courierOptions'

// The produce form's Delivery step (client card 2026-11-10), shared by the
// farmer/aggregator dashboard and the moderator form:
//   1. Delivery method: Pickup only / I will courier / Both
//   2. Pickup only or Both → the pickup points (passed in as `pickup`)
//   3. I will courier or Both → Local, Cargo or Both (2026-11-27). The cargo
//      services, who pays, the local charge and radius are set ONCE on the
//      farmer's profile; `settings` shows them here with an Edit button.
// Rules: src/lib/courierOptions.ts + deliverySettings.ts. 390px-first, 44px tap targets.

type Translate = (en: string, te: string) => string
export type DeliveryMode = 'pickup' | 'courier' | 'both'

export default function DeliveryFields({
  mode,
  onMode,
  courier,
  onCourier,
  L,
  pickup,
  settings,
}: {
  mode: DeliveryMode | null
  onMode: (m: DeliveryMode) => void
  courier: CourierForm
  onCourier: (next: CourierForm) => void
  L: Translate
  /** The pickup points block (the farmer's editor, or the moderator's summary). */
  pickup?: ReactNode
  /** The profile delivery settings for the chosen type (DeliverySettingsSummary). */
  settings?: ReactNode
}) {
  const set = (patch: Partial<CourierForm>) => onCourier({ ...courier, ...patch })
  const showPickup = mode === 'pickup' || mode === 'both'
  const showCourier = mode === 'courier' || mode === 'both'
  const labelCls = 'text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1'
  const choice = (active: boolean) =>
    `rounded-xl px-2 py-3 text-center border-2 transition-colors min-h-[56px] ${active ? 'border-green-600 bg-green-50' : 'border-gray-200 bg-white'}`
  const choiceText = (active: boolean) => `block text-[11px] font-bold mt-1 leading-tight ${active ? 'text-green-800' : 'text-gray-600'}`

  return (
    <div className="space-y-4">
      {/* 1. Delivery method */}
      <div>
        <span className={labelCls}>{L('Delivery method', 'డెలివరీ విధానం')} <span className="text-red-500">*</span></span>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={L('Delivery method', 'డెలివరీ విధానం')}>
          {([
            { key: 'pickup', en: 'Pickup only', te: 'పికప్ మాత్రమే', icon: '🧺' },
            { key: 'courier', en: 'I will courier', te: 'నేను డెలివరీ చేస్తా', icon: '🛵' },
            { key: 'both', en: 'Both', te: 'రెండూ', icon: '🔁' },
          ] as const).map((o) => (
            <button key={o.key} type="button" aria-pressed={mode === o.key} onClick={() => onMode(o.key)} className={choice(mode === o.key)}>
              <span className="block text-lg leading-none" aria-hidden>{o.icon}</span>
              <span className={choiceText(mode === o.key)}>{L(o.en, o.te)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Pickup points */}
      {showPickup && pickup}

      {/* 3. Courier */}
      {showCourier && (
        <div className="rounded-2xl border-2 border-sky-200 bg-sky-50/50 p-3 space-y-3">
          <p className="text-sm font-extrabold text-sky-900">🛵 {L('Courier', 'కొరియర్')}</p>
          <div>
            <span className={labelCls}>{L('How will you send it?', 'ఎలా పంపుతారు?')} <span className="text-red-500">*</span></span>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label={L('How will you send it?', 'ఎలా పంపుతారు?')}>
              {([
                { key: 'local', en: 'Local', te: 'లోకల్', icon: '🏘️', sub: ['I deliver nearby', 'దగ్గరలో నేనే ఇస్తా'] },
                { key: 'cargo', en: 'Cargo', te: 'కార్గో', icon: '🚛', sub: ['Parcel, anywhere in India', 'పార్సెల్, దేశంలో ఎక్కడికైనా'] },
                { key: 'both', en: 'Both', te: 'రెండూ', icon: '🔁', sub: ['Local near, cargo far', 'దగ్గర లోకల్, దూరం కార్గో'] },
              ] as const).map((o) => {
                const active = courier.courierType === o.key
                return (
                  <button key={o.key} type="button" aria-pressed={active} onClick={() => set({ courierType: o.key })} className={choice(active)}>
                    <span className="block text-lg leading-none" aria-hidden>{o.icon}</span>
                    <span className={choiceText(active)}>{L(o.en, o.te)}</span>
                    <span className="block text-[10px] text-gray-500 mt-0.5 leading-tight">{L(o.sub[0], o.sub[1])}</span>
                  </button>
                )
              })}
            </div>
            {courier.courierType === 'both' && (
              <p className="text-[11px] text-gray-600 mt-1.5 leading-snug">
                {L('Buyers within 20 km get your local delivery; buyers further away get cargo.', '20 కి.మీ. లోపు కొనుగోలుదారులకు మీ లోకల్ డెలివరీ; దూరం ఉన్నవారికి కార్గో.')}
              </p>
            )}
          </div>

          {courier.courierType && settings}
        </div>
      )}
    </div>
  )
}

'use client'

import { useId, type ReactNode } from 'react'
import { KNOWN_CARGO_SERVICES, type CourierForm, type CourierType, type PaidBy } from '@/lib/courierOptions'

// The produce form's Delivery step (client card 2026-11-10), shared by the
// farmer/aggregator dashboard and the moderator form:
//   1. Delivery method: Pickup only / I will courier / Both
//   2. Pickup only or Both → the pickup points (passed in as `pickup`)
//   3. I will courier or Both → Local or Cargo
//        Local → delivery radius; who pays (Farmer = free / Buyer = ₹ charge)
//        Cargo → services in the farmer's area that take ToPay (known list +
//                Other); who pays (Buyer = ToPay / Farmer = prepaid, free)
// Rules: src/lib/courierOptions.ts. 390px-first, 44px tap targets.

type Translate = (en: string, te: string) => string
export type DeliveryMode = 'pickup' | 'courier' | 'both'

export default function DeliveryFields({
  mode,
  onMode,
  courier,
  onCourier,
  L,
  pickup,
}: {
  mode: DeliveryMode | null
  onMode: (m: DeliveryMode) => void
  courier: CourierForm
  onCourier: (next: CourierForm) => void
  L: Translate
  /** The pickup points block (the farmer's editor, or the moderator's summary). */
  pickup?: ReactNode
}) {
  const id = useId()
  const set = (patch: Partial<CourierForm>) => onCourier({ ...courier, ...patch })
  const showPickup = mode === 'pickup' || mode === 'both'
  const showCourier = mode === 'courier' || mode === 'both'
  const labelCls = 'text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1'
  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-green-500 focus:outline-none min-h-[44px]'
  const choice = (active: boolean) =>
    `rounded-xl px-2 py-3 text-center border-2 transition-colors min-h-[56px] ${active ? 'border-green-600 bg-green-50' : 'border-gray-200 bg-white'}`
  const choiceText = (active: boolean) => `block text-[11px] font-bold mt-1 leading-tight ${active ? 'text-green-800' : 'text-gray-600'}`

  const toggleService = (name: string) =>
    set({ cargoServices: courier.cargoServices.includes(name) ? courier.cargoServices.filter((s) => s !== name) : [...courier.cargoServices, name] })

  const paidByOptions: Record<CourierType, Array<{ key: PaidBy; en: string; te: string; sub: [string, string] }>> = {
    local: [
      { key: 'farmer', en: 'I pay', te: 'నేను భరిస్తా', sub: ['Free delivery for the buyer', 'కొనుగోలుదారుకు ఉచిత డెలివరీ'] },
      { key: 'buyer', en: 'Buyer pays', te: 'కొనుగోలుదారు భరిస్తారు', sub: ['Your delivery charge is added', 'మీ డెలివరీ ఛార్జ్ కలుస్తుంది'] },
    ],
    cargo: [
      { key: 'buyer', en: 'Buyer pays (ToPay)', te: 'కొనుగోలుదారు (ToPay)', sub: ['Paid to the cargo company on delivery', 'డెలివరీ సమయంలో కార్గో కంపెనీకి చెల్లిస్తారు'] },
      { key: 'farmer', en: 'I pay', te: 'నేను భరిస్తా', sub: ['You book it prepaid — free for the buyer', 'మీరు ముందే చెల్లిస్తారు — కొనుగోలుదారుకు ఉచితం'] },
    ],
  }

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
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={L('How will you send it?', 'ఎలా పంపుతారు?')}>
              {([
                { key: 'local', en: 'Local delivery', te: 'లోకల్ డెలివరీ', icon: '🏘️', sub: ['I deliver nearby', 'దగ్గరలో నేనే ఇస్తా'] },
                { key: 'cargo', en: 'Cargo', te: 'కార్గో', icon: '🚛', sub: ['Parcel service, anywhere in India', 'పార్సెల్ సర్వీస్, భారతదేశంలో ఎక్కడికైనా'] },
              ] as const).map((o) => {
                const active = courier.courierType === o.key
                return (
                  <button
                    key={o.key} type="button" aria-pressed={active}
                    // Who pays means different things for each — ask again.
                    onClick={() => set({ courierType: o.key, ...(courier.courierType !== o.key ? { paidBy: '' as const } : {}) })}
                    className={choice(active)}
                  >
                    <span className="block text-lg leading-none" aria-hidden>{o.icon}</span>
                    <span className={choiceText(active)}>{L(o.en, o.te)}</span>
                    <span className="block text-[10px] text-gray-500 mt-0.5">{L(o.sub[0], o.sub[1])}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {courier.courierType === 'local' && (
            <div>
              <label htmlFor={`${id}-radius`} className={labelCls}>{L('Delivery radius (optional)', 'డెలివరీ పరిధి (ఐచ్ఛికం)')}</label>
              <div className="relative">
                <input id={`${id}-radius`} type="text" inputMode="numeric" placeholder={L('e.g. 10', 'ఉదా. 10')} value={courier.radius} onChange={(e) => set({ radius: e.target.value.replace(/\D/g, '') })} className={`${inputCls} pr-10`} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">km</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{L('Left blank, buyers within 25 km see it.', 'ఖాళీగా వదిలితే 25 కి.మీ. లోపల ఉన్నవారికి కనిపిస్తుంది.')}</p>
            </div>
          )}

          {courier.courierType === 'cargo' && (
            <div>
              <span className={labelCls}>{L('Cargo services in your area that take ToPay', 'మీ ప్రాంతంలో ToPay తీసుకునే కార్గో సర్వీసులు')} <span className="text-red-500">*</span></span>
              <div className="grid grid-cols-2 gap-2">
                {KNOWN_CARGO_SERVICES.map((name) => {
                  const on = courier.cargoServices.includes(name)
                  return (
                    <label key={name} className={`flex items-center gap-2 rounded-xl border-2 px-2.5 min-h-[44px] text-xs font-bold ${on ? 'border-green-600 bg-green-50 text-green-900' : 'border-gray-200 bg-white text-gray-700'}`}>
                      <input type="checkbox" checked={on} onChange={() => toggleService(name)} className="h-4 w-4 flex-none" />
                      <span className="leading-tight">{name}</span>
                    </label>
                  )
                })}
              </div>
              <label htmlFor={`${id}-other`} className="text-[11px] font-bold text-gray-600 block mt-2 mb-1">{L('Other services (separate with commas)', 'ఇతర సర్వీసులు (కామాతో వేరు చేయండి)')}</label>
              <input id={`${id}-other`} type="text" placeholder={L('e.g. Sri Durga Parcels', 'ఉదా. శ్రీ దుర్గా పార్సెల్స్')} value={courier.otherCargo} onChange={(e) => set({ otherCargo: e.target.value })} className={inputCls} />
              <p className="text-[11px] text-gray-600 mt-1 leading-snug">
                {L('Buyers can order only if one of these services works in their area.', 'ఈ సర్వీసుల్లో ఒకటి తమ ప్రాంతంలో ఉంటేనే కొనుగోలుదారులు ఆర్డర్ చేయగలరు.')}
              </p>
            </div>
          )}

          {courier.courierType && (
            <div>
              <span className={labelCls}>{L('Who pays for delivery?', 'డెలివరీ ఖర్చు ఎవరు భరిస్తారు?')} <span className="text-red-500">*</span></span>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label={L('Who pays for delivery?', 'డెలివరీ ఖర్చు ఎవరు భరిస్తారు?')}>
                {paidByOptions[courier.courierType].map((o) => {
                  const active = courier.paidBy === o.key
                  return (
                    <button key={o.key} type="button" aria-pressed={active} onClick={() => set({ paidBy: o.key })} className={choice(active)}>
                      <span className={choiceText(active)}>{L(o.en, o.te)}</span>
                      <span className="block text-[10px] text-gray-500 mt-0.5 leading-tight">{L(o.sub[0], o.sub[1])}</span>
                    </button>
                  )
                })}
              </div>
              {courier.courierType === 'local' && courier.paidBy === 'buyer' && (
                <div className="mt-2">
                  <label htmlFor={`${id}-charge`} className={labelCls}>{L('Delivery charge', 'డెలివరీ ఛార్జ్')} <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                    <input id={`${id}-charge`} type="text" inputMode="numeric" placeholder="30" value={courier.charge} onChange={(e) => set({ charge: e.target.value.replace(/\D/g, '') })} className={`${inputCls} pl-7 pr-20`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{L('per order', 'ఒక్కో ఆర్డర్')}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

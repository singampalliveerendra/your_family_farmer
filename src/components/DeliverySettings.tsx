'use client'

import { useEffect, useId, useState } from 'react'
import { KNOWN_CARGO_SERVICES, type CourierType, type PaidBy } from '@/lib/courierOptions'
import {
  EMPTY_SETTINGS, bodyFromForm, formFromSettings, missingFor, settingsFromRow, settingsSummary,
  type DeliverySettings, type SettingsForm,
} from '@/lib/deliverySettings'

/* Delivery settings on the farmer's PROFILE (client card 2026-11-27): set
 * once, used by every produce. Two pieces:
 *   DeliverySettingsCard    — the editor, in the profile (farmer) and the
 *                             farmer edit page (moderator)
 *   DeliverySettingsSummary — inside the produce form's Delivery step: what
 *                             the chosen Local / Cargo / Both will use, and an
 *                             Edit button that opens the same editor in a sheet
 * `endpoint` = /api/farmer/delivery-settings or
 * /api/moderator/farmers/<id>/delivery-settings; `fetcher` = farmerFetch for
 * the farmer (session handling), plain fetch for the moderator. */

type Translate = (en: string, te: string) => string
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

const plainFetch: Fetcher = (input, init) => fetch(input, { ...init, credentials: 'same-origin', cache: 'no-store' })

export function useDeliverySettings(endpoint: string, fetcher: Fetcher = plainFetch) {
  const [settings, setSettings] = useState<DeliverySettings | null>(null)
  const [ready, setReady] = useState(true)
  useEffect(() => {
    let cancelled = false
    fetcher(endpoint)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return
        setSettings(j ? settingsFromRow(snake(j.settings)) : { ...EMPTY_SETTINGS })
        if (j) setReady(j.ready !== false)
      })
      .catch(() => { if (!cancelled) setSettings({ ...EMPTY_SETTINGS }) })
    return () => { cancelled = true }
  }, [endpoint, fetcher])
  return { settings, ready, setSettings }
}

/** The API answers camelCase settings; settingsFromRow reads columns. */
function snake(s: Partial<DeliverySettings> | null | undefined): Record<string, unknown> {
  if (!s) return {}
  return { cargo_services: s.cargoServices, cargo_paid_by: s.cargoPaidBy, local_paid_by: s.localPaidBy, local_delivery_charge: s.localCharge, local_radius_km: s.localRadiusKm }
}

const labelCls = 'text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1'
const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-green-500 focus:outline-none min-h-[44px]'
const choice = (active: boolean) =>
  `rounded-xl px-2 py-3 text-center border-2 transition-colors min-h-[56px] ${active ? 'border-green-600 bg-green-50' : 'border-gray-200 bg-white'}`
const choiceText = (active: boolean) => `block text-[11px] font-bold leading-tight ${active ? 'text-green-800' : 'text-gray-600'}`

function PaidByChoice({ value, onChange, options, label, L }: {
  value: PaidBy | ''
  onChange: (v: PaidBy) => void
  options: Array<{ key: PaidBy; en: string; te: string; sub: [string, string] }>
  label: string
  L: Translate
}) {
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)} className={choice(value === o.key)}>
            <span className={choiceText(value === o.key)}>{L(o.en, o.te)}</span>
            <span className="block text-[10px] text-gray-500 mt-0.5 leading-tight">{L(o.sub[0], o.sub[1])}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** The editor itself: cargo services + who pays, local who pays / charge / distance. */
export function DeliverySettingsEditor({ initial, endpoint, fetcher = plainFetch, L, onSaved }: {
  initial: DeliverySettings
  endpoint: string
  fetcher?: Fetcher
  L: Translate
  onSaved: (s: DeliverySettings) => void
}) {
  const id = useId()
  const [f, setF] = useState<SettingsForm>(() => formFromSettings(initial))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const set = (patch: Partial<SettingsForm>) => { setF((x) => ({ ...x, ...patch })); setMsg(null) }
  const toggle = (name: string) =>
    set({ cargoServices: f.cargoServices.includes(name) ? f.cargoServices.filter((s) => s !== name) : [...f.cargoServices, name] })

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await fetcher(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyFromForm(f)) })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) { setMsg({ ok: false, text: j?.error ?? L('Could not save. Please try again.', 'సేవ్ కాలేదు. మళ్ళీ ప్రయత్నించండి.') }); return }
      const s = settingsFromRow(snake(j.settings))
      setF(formFromSettings(s))
      setMsg({ ok: true, text: L('Saved. All your produce now use these settings.', 'సేవ్ అయింది. మీ అన్ని ఉత్పత్తులకు ఇవే వర్తిస్తాయి.') })
      onSaved(s)
    } catch {
      setMsg({ ok: false, text: L('Could not save. Please check your internet.', 'సేవ్ కాలేదు. ఇంటర్నెట్ చూడండి.') })
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {/* Cargo */}
      <div className="rounded-2xl border-2 border-sky-200 bg-sky-50/50 p-3 space-y-3">
        <p className="text-sm font-extrabold text-sky-900">🚛 {L('Cargo', 'కార్గో')}</p>
        <div>
          <span className={labelCls}>{L('Cargo services in your area that take ToPay', 'మీ ప్రాంతంలో ToPay తీసుకునే కార్గో సర్వీసులు')}</span>
          <div className="grid grid-cols-2 gap-2">
            {KNOWN_CARGO_SERVICES.map((name) => {
              const on = f.cargoServices.includes(name)
              return (
                <label key={name} className={`flex items-center gap-2 rounded-xl border-2 px-2.5 min-h-[44px] text-xs font-bold ${on ? 'border-green-600 bg-green-50 text-green-900' : 'border-gray-200 bg-white text-gray-700'}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(name)} className="h-4 w-4 flex-none" />
                  <span className="leading-tight">{name}</span>
                </label>
              )
            })}
          </div>
          <label htmlFor={`${id}-other`} className="text-[11px] font-bold text-gray-600 block mt-2 mb-1">{L('Other services (separate with commas)', 'ఇతర సర్వీసులు (కామాతో వేరు చేయండి)')}</label>
          <input id={`${id}-other`} type="text" placeholder={L('e.g. Sri Durga Parcels', 'ఉదా. శ్రీ దుర్గా పార్సెల్స్')} value={f.otherCargo} onChange={(e) => set({ otherCargo: e.target.value })} className={inputCls} />
          <p className="text-[11px] text-gray-600 mt-1 leading-snug">{L('Leave empty if you never send by cargo.', 'మీరు కార్గోలో పంపకపోతే ఖాళీగా వదలండి.')}</p>
        </div>
        <PaidByChoice
          L={L} value={f.cargoPaidBy} onChange={(v) => set({ cargoPaidBy: v })}
          label={L('Who pays for cargo?', 'కార్గో ఖర్చు ఎవరు భరిస్తారు?')}
          options={[
            { key: 'buyer', en: 'Buyer (ToPay)', te: 'కొనుగోలుదారు (ToPay)', sub: ['Paid to the cargo company on delivery', 'డెలివరీ సమయంలో కార్గో కంపెనీకి'] },
            { key: 'farmer', en: 'I pay', te: 'నేను భరిస్తా', sub: ['You book it prepaid — free for the buyer', 'ముందే చెల్లిస్తారు — కొనుగోలుదారుకు ఉచితం'] },
          ]}
        />
      </div>

      {/* Local */}
      <div className="rounded-2xl border-2 border-green-200 bg-green-50/40 p-3 space-y-3">
        <p className="text-sm font-extrabold text-green-900">🏘️ {L('Local delivery', 'లోకల్ డెలివరీ')}</p>
        <PaidByChoice
          L={L} value={f.localPaidBy} onChange={(v) => set({ localPaidBy: v })}
          label={L('Who pays for local delivery?', 'లోకల్ డెలివరీ ఖర్చు ఎవరు భరిస్తారు?')}
          options={[
            { key: 'farmer', en: 'I pay', te: 'నేను భరిస్తా', sub: ['Free delivery for the buyer', 'కొనుగోలుదారుకు ఉచిత డెలివరీ'] },
            { key: 'buyer', en: 'Buyer pays', te: 'కొనుగోలుదారు భరిస్తారు', sub: ['Your delivery charge is added', 'మీ డెలివరీ ఛార్జ్ కలుస్తుంది'] },
          ]}
        />
        {f.localPaidBy === 'buyer' && (
          <div>
            <label htmlFor={`${id}-charge`} className={labelCls}>{L('Delivery charge', 'డెలివరీ ఛార్జ్')} <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
              <input id={`${id}-charge`} type="text" inputMode="numeric" placeholder="30" value={f.localCharge} onChange={(e) => set({ localCharge: e.target.value.replace(/\D/g, '') })} className={`${inputCls} pl-7 pr-20`} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{L('per order', 'ఒక్కో ఆర్డర్')}</span>
            </div>
          </div>
        )}
        <div>
          <label htmlFor={`${id}-radius`} className={labelCls}>{L('How far do you deliver? (optional)', 'ఎంత దూరం డెలివరీ చేస్తారు? (ఐచ్ఛికం)')}</label>
          <div className="relative">
            <input id={`${id}-radius`} type="text" inputMode="numeric" placeholder={L('e.g. 10', 'ఉదా. 10')} value={f.localRadius} onChange={(e) => set({ localRadius: e.target.value.replace(/\D/g, '') })} className={`${inputCls} pr-10`} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">km</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">{L('Left blank, buyers within 25 km see your local produce.', 'ఖాళీగా వదిలితే 25 కి.మీ. లోపల ఉన్నవారికి కనిపిస్తుంది.')}</p>
        </div>
      </div>

      {msg && (
        <p role="status" className={`rounded-xl px-3 py-2 text-sm font-semibold ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>
      )}
      <button type="button" onClick={save} disabled={busy} className="w-full min-h-[48px] rounded-xl bg-green-700 text-white font-bold text-sm disabled:opacity-60 active:bg-green-800">
        {busy ? L('Saving…', 'సేవ్ అవుతోంది…') : L('Save delivery settings', 'డెలివరీ సెట్టింగ్స్ సేవ్ చేయండి')}
      </button>
    </div>
  )
}

/** The profile section: heading + editor. */
export function DeliverySettingsCard({ endpoint, fetcher, L }: { endpoint: string; fetcher?: Fetcher; L: Translate }) {
  const { settings, ready, setSettings } = useDeliverySettings(endpoint, fetcher)
  if (!ready) return null
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-extrabold text-gray-900">🚚 {L('Delivery settings', 'డెలివరీ సెట్టింగ్స్')}</h3>
      <p className="text-[12px] text-gray-600 leading-snug">{L('Set once — every produce you send by Local, Cargo or Both uses these.', 'ఒక్కసారి సెట్ చేయండి — లోకల్, కార్గో లేదా రెండూ ద్వారా పంపే ప్రతి ఉత్పత్తికి ఇవే వర్తిస్తాయి.')}</p>
      {settings
        ? <DeliverySettingsEditor key={JSON.stringify(settings)} initial={settings} endpoint={endpoint} fetcher={fetcher} L={L} onSaved={setSettings} />
        : <p className="text-sm text-gray-500">{L('Loading…', 'లోడ్ అవుతోంది…')}</p>}
    </section>
  )
}

/**
 * In the produce form: what Local / Cargo / Both will use, from the profile,
 * with an Edit button (a sheet with the same editor). `onSettings` hands the
 * loaded settings to the form so its own check can say what is missing.
 */
export function DeliverySettingsSummary({ endpoint, fetcher, courierType, L, onSettings }: {
  endpoint: string
  fetcher?: Fetcher
  courierType: CourierType
  L: Translate
  onSettings?: (s: DeliverySettings | null) => void
}) {
  const { settings, ready, setSettings } = useDeliverySettings(endpoint, fetcher)
  const [open, setOpen] = useState(false)
  // Only once loaded: null to the form means "not switched on" (no migration).
  useEffect(() => {
    if (!ready) onSettings?.(null)
    else if (settings) onSettings?.(settings)
  }, [settings, ready, onSettings])
  if (!ready) return null
  if (!settings) return <p className="text-xs text-gray-500">{L('Loading your delivery settings…', 'మీ డెలివరీ సెట్టింగ్స్ లోడ్ అవుతున్నాయి…')}</p>

  const sum = settingsSummary(settings, L)
  const missing = missingFor(courierType, settings)
  const showCargo = courierType === 'cargo' || courierType === 'both'
  const showLocal = courierType === 'local' || courierType === 'both'

  return (
    <div className="rounded-xl bg-white border border-gray-200 p-3 space-y-1.5">
      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{L('From your profile', 'మీ ప్రొఫైల్ నుండి')}</p>
      {showLocal && (
        <p className="text-[13px] text-gray-800"><span className="font-bold">🏘️ {L('Local', 'లోకల్')}:</span> {sum.local ?? <span className="text-red-600 font-semibold">{L('not set', 'సెట్ చేయలేదు')}</span>}</p>
      )}
      {showCargo && (
        <p className="text-[13px] text-gray-800"><span className="font-bold">🚛 {L('Cargo', 'కార్గో')}:</span> {sum.cargo ?? <span className="text-red-600 font-semibold">{L('not set', 'సెట్ చేయలేదు')}</span>}</p>
      )}
      {missing && <p className="text-[12px] font-semibold text-red-700 leading-snug">{L(missing.en, missing.te)}</p>}
      <button type="button" onClick={() => setOpen(true)} className="mt-1 inline-flex min-h-[44px] items-center rounded-xl border border-sky-300 px-4 text-sm font-bold text-sky-800 active:bg-sky-50">
        {missing ? L('Set delivery settings', 'డెలివరీ సెట్టింగ్స్ సెట్ చేయండి') : L('Change in profile', 'ప్రొఫైల్‌లో మార్చండి')}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40" role="dialog" aria-modal="true" aria-label={L('Delivery settings', 'డెలివరీ సెట్టింగ్స్')} onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-extrabold text-gray-900">🚚 {L('Delivery settings (profile)', 'డెలివరీ సెట్టింగ్స్ (ప్రొఫైల్)')}</h3>
              <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] min-w-[44px] text-xl text-gray-500" aria-label={L('Close', 'మూసివేయండి')}>✕</button>
            </div>
            <p className="mb-3 text-[12px] text-gray-600 leading-snug">{L('These apply to all your produce, not just this one.', 'ఇవి ఈ ఒక్కదానికే కాదు, మీ అన్ని ఉత్పత్తులకు వర్తిస్తాయి.')}</p>
            <DeliverySettingsEditor initial={settings} endpoint={endpoint} fetcher={fetcher} L={L} onSaved={(s) => { setSettings(s); setOpen(false) }} />
          </div>
        </div>
      )}
    </div>
  )
}

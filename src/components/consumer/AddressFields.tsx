'use client'

import { useLang } from '@/lib/LanguageContext'
import type { SavedAddress } from '@/lib/savedAddress'

// The delivery-address inputs, shared by the cart's "different address" form
// and the /consumer/profile "My address" page so the two never drift apart.
export default function AddressFields({
  value,
  onChange,
}: {
  value: SavedAddress
  onChange: (next: SavedAddress) => void
}) {
  const { L } = useLang()
  const set = (patch: Partial<SavedAddress>) => onChange({ ...value, ...patch })
  const label = 'text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1'
  const input = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-green-500 focus:outline-none'

  return (
    <>
      <div>
        <label className={label}>
          {L('Full address (door no, street, area)', 'పూర్తి చిరునామా (ఇంటి నం, వీధి, ప్రాంతం)')}
        </label>
        <textarea
          value={value.address}
          onChange={(e) => set({ address: e.target.value.slice(0, 400) })}
          rows={3}
          placeholder={L('H.No 12-3, Main Road, Anand Nagar', 'ఇం.నం 12-3, మెయిన్ రోడ్, ఆనంద్ నగర్')}
          className={`${input} resize-none`}
        />
      </div>
      <div>
        <label className={label}>{L('City / Town', 'నగరం / పట్టణం')}</label>
        <input
          type="text"
          value={value.city}
          onChange={(e) => set({ city: e.target.value.slice(0, 100) })}
          placeholder={L('e.g. Guntur', 'ఉదా. గుంటూరు')}
          className={input}
        />
      </div>
      <div>
        <label className={label}>{L('Landmark (optional)', 'గుర్తు')}</label>
        <input
          type="text"
          value={value.landmark}
          onChange={(e) => set({ landmark: e.target.value.slice(0, 200) })}
          placeholder={L('Near the temple', 'గుడి దగ్గర')}
          className={input}
        />
      </div>
      <div>
        <label className={label}>{L('PIN code', 'పిన్ కోడ్')}</label>
        <input
          type="tel"
          inputMode="numeric"
          value={value.pincode}
          onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
          maxLength={6}
          placeholder="522001"
          className={input}
        />
      </div>
      <div>
        <label className={label}>{L('Alternate phone (optional)', 'ప్రత్యామ్నాయ ఫోన్ (ఐచ్ఛికం)')}</label>
        <div className="flex gap-2">
          <span className="flex items-center px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 font-medium">
            +91
          </span>
          <input
            type="tel"
            inputMode="numeric"
            value={value.altPhone}
            onChange={(e) => set({ altPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
            maxLength={10}
            placeholder={L('Family member / spouse', 'కుటుంబ సభ్యుడు / జీవిత భాగస్వామి')}
            className={`flex-1 ${input.replace('w-full ', '')}`}
          />
        </div>
      </div>
    </>
  )
}

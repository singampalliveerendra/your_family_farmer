'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Rider = { id: string; name: string | null; phone: string; status: string; vehicle_type: string | null; vehicle_number: string | null }

type AvailableOrder = {
  id: string
  produce_name: string | null
  quantity: number | null
  unit: string | null
  total_price: number | null
  payment_method: string | null
  payment_status: string | null
  delivery_pincode: string | null
  delivery_fee: number | null
  rider_payout: number | null
  created_at: string
  farmer: { name: string; village: string; farm_address: string | null } | null
}

type DeliveryStatus = 'assigned' | 'picked_up' | 'out_for_delivery'

type MyOrder = {
  id: string
  produce_name: string | null
  quantity: number | null
  unit: string | null
  total_price: number | null
  buyer_name: string | null
  buyer_phone: string | null
  payment_method: string | null
  payment_status: string | null
  delivery_status: DeliveryStatus
  delivery_address: string | null
  delivery_landmark: string | null
  delivery_pincode: string | null
  delivery_alt_phone: string | null
  delivery_fee: number | null
  rider_payout: number | null
  assigned_at: string | null
  picked_up_at: string | null
  out_for_delivery_at: string | null
  farmer: { id: string; name: string; village: string; phone: string | null; farm_address: string | null } | null
}

type HistoryOrder = {
  id: string
  produce_name: string | null
  quantity: number | null
  unit: string | null
  total_price: number | null
  buyer_name: string | null
  payment_method: string | null
  delivery_pincode: string | null
  delivery_fee: number | null
  rider_payout: number | null
  delivered_at: string | null
  created_at: string
  farmer: { name: string; village: string } | null
}

export default function RiderDashboardPage() {
  const router = useRouter()
  const [rider, setRider] = useState<Rider | null>(null)
  const [available, setAvailable] = useState<AvailableOrder[]>([])
  const [mine, setMine] = useState<MyOrder[]>([])
  const [history, setHistory] = useState<HistoryOrder[]>([])
  const [totalEarned, setTotalEarned] = useState(0)
  const [tab, setTab] = useState<'available' | 'mine' | 'history'>('available')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [otpInputs, setOtpInputs] = useState<Record<string, string>>({})
  const [otpError, setOtpError] = useState<Record<string, string>>({})

  // Pull current rider once. If the cookie is invalid or the account isn't
  // active, /api/rider/me returns rider:null and we kick back to login.
  useEffect(() => {
    let cancelled = false
    fetch('/api/rider/me', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (!json?.rider) { router.replace('/rider/login'); return }
        setRider(json.rider as Rider)
      })
      .catch(() => { if (!cancelled) router.replace('/rider/login') })
    return () => { cancelled = true }
  }, [router])

  const refresh = useCallback(async () => {
    setError('')
    const r = await fetch('/api/rider/orders', { credentials: 'same-origin' }).catch(() => null)
    if (!r) { setError('Network error. / నెట్‌వర్క్ లోపం'); setLoading(false); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load orders. / ఆర్డర్‌లు లోడ్ చేయలేకపోయాము'); setLoading(false); return }
    setAvailable((json.available ?? []) as AvailableOrder[])
    setMine((json.mine ?? []) as MyOrder[])
    setHistory((json.history ?? []) as HistoryOrder[])
    setTotalEarned(typeof json.totalEarned === 'number' ? json.totalEarned : 0)
    setLoading(false)
  }, [])

  // Refresh on mount and every 15 seconds so a rider sees new orders without
  // having to manually pull. Cheap query — small mandal scale.
  useEffect(() => {
    if (!rider) return
    void refresh()
    const t = setInterval(() => void refresh(), 15_000)
    return () => clearInterval(t)
  }, [rider, refresh])

  const handleLogout = async () => {
    await fetch('/api/rider/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null)
    router.replace('/rider/login')
  }

  const callOrderAction = useCallback(async (
    orderId: string,
    endpoint: 'accept' | 'pickup' | 'out-for-delivery' | 'deliver',
    payload?: Record<string, unknown>,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    const r = await fetch(`/api/rider/orders/${orderId}/${endpoint}`, {
      method: 'POST',
      headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'same-origin',
      body: payload ? JSON.stringify(payload) : undefined,
    }).catch(() => null)
    if (!r) return { ok: false, error: 'Network error.' }
    const json = await r.json().catch(() => ({}))
    if (!r.ok || !json?.ok) return { ok: false, error: json?.error ?? 'Action failed.' }
    return { ok: true }
  }, [])

  const handleAccept = async (id: string) => {
    if (busyId) return
    setBusyId(id)
    const res = await callOrderAction(id, 'accept')
    setBusyId(null)
    if (!res.ok) { setError(res.error); return }
    setTab('mine')
    await refresh()
  }

  const handlePickup = async (id: string) => {
    if (busyId) return
    setBusyId(id)
    const res = await callOrderAction(id, 'pickup')
    setBusyId(null)
    if (!res.ok) { setError(res.error); return }
    await refresh()
  }

  const handleOutForDelivery = async (id: string) => {
    if (busyId) return
    setBusyId(id)
    const res = await callOrderAction(id, 'out-for-delivery')
    setBusyId(null)
    if (!res.ok) { setError(res.error); return }
    await refresh()
  }

  const handleDeliver = async (id: string) => {
    if (busyId) return
    const otp = (otpInputs[id] ?? '').trim()
    if (!/^\d{4}$/.test(otp)) {
      setOtpError((m) => ({ ...m, [id]: 'Enter the 4-digit code from the customer. / కస్టమర్ నుండి 4-అంకెల కోడ్ నమోదు చేయండి' }))
      return
    }
    setOtpError((m) => ({ ...m, [id]: '' }))
    setBusyId(id)
    const res = await callOrderAction(id, 'deliver', { otp })
    setBusyId(null)
    if (!res.ok) {
      setOtpError((m) => ({ ...m, [id]: res.error }))
      return
    }
    setOtpInputs((m) => ({ ...m, [id]: '' }))
    await refresh()
  }

  if (!rider) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      <div className="bg-green-900 px-4 pt-6 pb-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-green-300 text-xs">Delivery partner / డెలివరీ పార్ట్నర్</p>
            <h1 className="text-white text-xl font-extrabold leading-tight truncate">{rider.name || rider.phone}</h1>
            <p className="text-green-400 text-xs mt-0.5">
              {rider.vehicle_type ? `${rider.vehicle_type} · ` : ''}{rider.vehicle_number ?? ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <Link href="/rider/complaints" className="inline-flex items-center gap-1 bg-amber-400 text-green-950 text-xs font-bold px-3 py-1.5 rounded-full shadow-md active:bg-amber-500 whitespace-nowrap">
              🛟 Log a Complaint / ఫిర్యాదు
            </Link>
            <button
              onClick={handleLogout}
              className="text-green-200 text-xs underline whitespace-nowrap"
            >
              Log out / లాగౌట్
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-6 space-y-4 max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 p-1.5 flex gap-1.5 shadow-sm">
          <button
            onClick={() => setTab('available')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${
              tab === 'available' ? 'bg-green-700 text-white' : 'bg-white text-gray-600 active:bg-gray-50'
            }`}
          >
            Available / అందుబాటులో ({available.length})
          </button>
          <button
            onClick={() => setTab('mine')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${
              tab === 'mine' ? 'bg-green-700 text-white' : 'bg-white text-gray-600 active:bg-gray-50'
            }`}
          >
            My deliveries / నా డెలివరీలు ({mine.length})
          </button>
          <button
            onClick={() => setTab('history')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${
              tab === 'history' ? 'bg-green-700 text-white' : 'bg-white text-gray-600 active:bg-gray-50'
            }`}
          >
            History / చరిత్ర ({history.length})
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <p className="text-xs text-red-700 font-semibold">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-10">
            <div className="w-8 h-8 border-4 border-green-700 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : tab === 'available' ? (
          available.length === 0 ? (
            <div className="text-center py-10 px-5 bg-white rounded-2xl border border-gray-100">
              <div className="text-5xl mb-3">📭</div>
              <p className="font-semibold text-gray-700 text-sm">No deliveries waiting right now</p>
              <p className="text-xs text-gray-500 mt-1">ఇప్పుడు ఏ ఆర్డర్‌లు లేవు</p>
              <div className="mt-5 text-left bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-1.5">
                <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">
                  A delivery shows up here when:
                </p>
                <p className="text-xs text-gray-600 leading-snug">
                  1. A buyer places an order and chooses <span className="font-bold">Home Delivery</span> in the cart.
                </p>
                <p className="text-xs text-gray-600 leading-snug">
                  2. The farmer <span className="font-bold">approves</span> the order (or, for UPI, marks payment received).
                </p>
                <p className="text-xs text-gray-600 leading-snug">
                  3. No other rider has taken it yet.
                </p>
              </div>
              <button
                onClick={() => { setLoading(true); void refresh() }}
                className="mt-4 text-xs font-bold text-green-700 underline"
              >
                Refresh / రిఫ్రెష్
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {available.map((o) => (
                <AvailableCard
                  key={o.id}
                  order={o}
                  onAccept={() => handleAccept(o.id)}
                  busy={busyId === o.id}
                />
              ))}
            </div>
          )
        ) : tab === 'mine' ? (
          mine.length === 0 ? (
            <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
              <div className="text-5xl mb-3">🛵</div>
              <p className="font-semibold text-gray-500 text-sm">No active deliveries</p>
              <p className="text-xs text-gray-400 mt-1">ఏ యాక్టివ్ డెలివరీలు లేవు</p>
              <p className="text-xs text-gray-400 mt-1">Accept an order from the Available tab / అందుబాటు ట్యాబ్ నుండి ఆర్డర్ తీసుకోండి</p>
            </div>
          ) : (
            <div className="space-y-3">
              {mine.map((o) => (
                <MyOrderCard
                  key={o.id}
                  order={o}
                  busy={busyId === o.id}
                  otp={otpInputs[o.id] ?? ''}
                  onOtpChange={(v) => setOtpInputs((m) => ({ ...m, [o.id]: v }))}
                  otpError={otpError[o.id]}
                  onPickup={() => handlePickup(o.id)}
                  onOutForDelivery={() => handleOutForDelivery(o.id)}
                  onDeliver={() => handleDeliver(o.id)}
                />
              ))}
            </div>
          )
        ) : history.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
            <div className="text-5xl mb-3">📜</div>
            <p className="font-semibold text-gray-500 text-sm">No completed deliveries yet</p>
            <p className="text-xs text-gray-400 mt-1">ఇంకా పూర్తి చేసిన డెలివరీలు లేవు</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide">Completed / పూర్తయినవి</p>
                <p className="text-lg font-extrabold text-emerald-900">{history.length} {history.length === 1 ? 'delivery' : 'deliveries'}</p>
              </div>
              {totalEarned > 0 && (
                <div className="text-right">
                  <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide">Earned / ఆదాయం</p>
                  <p className="text-lg font-extrabold text-emerald-900">₹{totalEarned}</p>
                </div>
              )}
            </div>
            {history.map((o) => (
              <HistoryCard key={o.id} order={o} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function AvailableCard({
  order,
  onAccept,
  busy,
}: {
  order: AvailableOrder
  onAccept: () => void
  busy: boolean
}) {
  const isCod = order.payment_method === 'cod'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-extrabold text-gray-900 text-sm leading-tight">
              {order.produce_name || 'Order'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {order.quantity ?? 0} {order.unit || 'kg'}
              {order.total_price ? ` · ₹${order.total_price}` : ''}
            </p>
          </div>
          {isCod ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">
              Collect ₹{(order.total_price ?? 0) + (order.delivery_fee ?? 0)} cash / నగదు
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800 whitespace-nowrap">
              Produce paid / ఉత్పత్తి చెల్లించబడింది
            </span>
          )}
        </div>

        {(order.rider_payout ?? 0) > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide">Your earning / మీ ఆదాయం</span>
            <span className="text-base font-extrabold text-emerald-900">₹{order.rider_payout}</span>
          </div>
        )}

        <div className="border-t border-gray-100 pt-2 space-y-1.5">
          <p className="text-xs">
            <span className="font-bold text-green-800">🧑‍🌾 Pickup / పికప్:</span>{' '}
            {order.farmer ? `${order.farmer.name} · ${order.farmer.village}` : 'Farmer'}
          </p>
          {order.farmer?.farm_address && (
            <p className="text-xs text-gray-700 leading-snug whitespace-pre-line pl-5">
              {order.farmer.farm_address}
            </p>
          )}
          <p className="text-xs">
            <span className="font-bold text-blue-800">📍 Drop area / డెలివరీ:</span>{' '}
            {order.delivery_pincode || 'Within mandal / మండలంలో'}
          </p>
          <p className="text-[10px] text-gray-400 leading-snug">
            Full address &amp; phone numbers shown after you accept.<br />
            మీరు అంగీకరించిన తర్వాత పూర్తి చిరునామా &amp; ఫోన్ నంబర్‌లు చూపుతాము.
          </p>
        </div>

        <button
          onClick={onAccept}
          disabled={busy}
          className="w-full mt-1 bg-green-700 text-white font-bold py-3 rounded-xl text-sm active:bg-green-800 disabled:opacity-50"
        >
          {busy ? 'Accepting... / అంగీకరిస్తోంది...' : '✓ Accept this delivery / ఈ డెలివరీ తీసుకోండి'}
        </button>
      </div>
    </div>
  )
}

function MyOrderCard({
  order,
  busy,
  otp,
  onOtpChange,
  otpError,
  onPickup,
  onOutForDelivery,
  onDeliver,
}: {
  order: MyOrder
  busy: boolean
  otp: string
  onOtpChange: (v: string) => void
  otpError?: string
  onPickup: () => void
  onOutForDelivery: () => void
  onDeliver: () => void
}) {
  const isCod = order.payment_method === 'cod'
  const statusLabel =
    order.delivery_status === 'assigned' ? 'Go pick up / పికప్ చేయండి'
      : order.delivery_status === 'picked_up' ? 'Picked up / తీసుకున్నారు'
      : 'Out for delivery / డెలివరీలో'
  const statusColor =
    order.delivery_status === 'assigned' ? 'bg-amber-100 text-amber-800'
      : order.delivery_status === 'picked_up' ? 'bg-blue-100 text-blue-800'
      : 'bg-purple-100 text-purple-800'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-extrabold text-gray-900 text-sm leading-tight">
              {order.produce_name || 'Order'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {order.quantity ?? 0} {order.unit || 'kg'}
              {order.total_price ? ` · ₹${order.total_price}` : ''}
            </p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor} whitespace-nowrap`}>
            {statusLabel}
          </span>
        </div>

        {isCod && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs">
            <span className="font-bold text-amber-900">
              💵 Collect ₹{(order.total_price ?? 0) + (order.delivery_fee ?? 0)}
            </span> in cash from the customer
            {(order.delivery_fee ?? 0) > 0 && ` (₹${order.total_price ?? 0} produce + ₹${order.delivery_fee} delivery)`}
            .<br />
            <span className="text-amber-800">కస్టమర్ నుండి నగదు తీసుకోండి.</span>
          </div>
        )}
        {!isCod && (order.delivery_fee ?? 0) > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs">
            <span className="font-bold text-amber-900">💵 Collect ₹{order.delivery_fee}</span> delivery fee in cash from the customer.<br />
            <span className="text-amber-800">కస్టమర్ నుండి డెలివరీ ఛార్జ్ నగదు తీసుకోండి.</span>
          </div>
        )}

        {(order.rider_payout ?? 0) > 0 && (
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide">Your earning / మీ ఆదాయం</span>
            <span className="text-base font-extrabold text-emerald-900">₹{order.rider_payout}</span>
          </div>
        )}

        {/* Pickup details */}
        {order.farmer && (
          <div className="border border-green-100 bg-green-50 rounded-xl px-3 py-2.5 space-y-1">
            <p className="text-[10px] font-bold text-green-800 uppercase tracking-wide">Pickup from / పికప్</p>
            <p className="text-sm font-bold text-gray-900">{order.farmer.name}</p>
            <p className="text-xs text-gray-600">{order.farmer.village}</p>
            {order.farmer.farm_address && (
              <p className="text-xs text-gray-700 leading-snug whitespace-pre-line mt-1">
                📍 {order.farmer.farm_address}
              </p>
            )}
            {order.farmer.phone && (
              <a
                href={`tel:${order.farmer.phone}`}
                className="inline-flex items-center gap-1 mt-1 text-xs font-bold text-green-700 underline"
              >
                📞 Call farmer / రైతుకు ఫోన్ · {order.farmer.phone}
              </a>
            )}
          </div>
        )}

        {/* Drop details */}
        <div className="border border-blue-100 bg-blue-50 rounded-xl px-3 py-2.5 space-y-1">
          <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wide">Deliver to / డెలివరీ</p>
          <p className="text-sm font-bold text-gray-900">{order.buyer_name || 'Customer'}</p>
          {order.delivery_address && (
            <p className="text-xs text-gray-700 leading-snug whitespace-pre-line">{order.delivery_address}</p>
          )}
          {order.delivery_landmark && (
            <p className="text-xs text-gray-600">📍 {order.delivery_landmark}</p>
          )}
          {order.delivery_pincode && (
            <p className="text-xs text-gray-600">PIN: {order.delivery_pincode}</p>
          )}
          {order.buyer_phone && (
            <a
              href={`tel:${order.buyer_phone}`}
              className="inline-flex items-center gap-1 mt-1 text-xs font-bold text-blue-700 underline"
            >
              📞 Call customer / కస్టమర్‌కు ఫోన్ · {order.buyer_phone}
            </a>
          )}
          {order.delivery_alt_phone && order.delivery_alt_phone !== order.buyer_phone && (
            <a
              href={`tel:${order.delivery_alt_phone}`}
              className="block text-xs font-semibold text-blue-700 underline"
            >
              Alt: {order.delivery_alt_phone}
            </a>
          )}
        </div>

        {/* Action */}
        {order.delivery_status === 'assigned' && (
          <button
            onClick={onPickup}
            disabled={busy}
            className="w-full bg-green-700 text-white font-bold py-3 rounded-xl text-sm active:bg-green-800 disabled:opacity-50"
          >
            {busy ? 'Updating... / అప్‌డేట్ అవుతోంది...' : '📦 Mark as picked up / పికప్ చేశాను'}
          </button>
        )}

        {order.delivery_status === 'picked_up' && (
          <button
            onClick={onOutForDelivery}
            disabled={busy}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl text-sm active:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Updating... / అప్‌డేట్ అవుతోంది...' : '🛵 Out for delivery / డెలివరీకి బయలుదేరాను'}
          </button>
        )}

        {order.delivery_status === 'out_for_delivery' && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block">
              4-digit code from customer / కస్టమర్ నుండి 4-అంకెల కోడ్
            </label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={4}
              value={otp}
              onChange={(e) => onOtpChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="0000"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-2xl font-mono font-bold tracking-widest text-center focus:border-green-500 focus:outline-none"
            />
            {otpError && (
              <p className="text-xs text-red-700 font-semibold">{otpError}</p>
            )}
            <button
              onClick={onDeliver}
              disabled={busy}
              className="w-full bg-green-700 text-white font-bold py-3 rounded-xl text-sm active:bg-green-800 disabled:opacity-50"
            >
              {busy ? 'Confirming... / నిర్ధారిస్తోంది...' : '✓ Confirm delivered / డెలివరీ నిర్ధారించు'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function HistoryCard({ order }: { order: HistoryOrder }) {
  const when = order.delivered_at ? new Date(order.delivered_at) : null
  const dateLabel = when
    ? when.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-extrabold text-gray-900 text-sm leading-tight">
            {order.produce_name || 'Order'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {order.quantity ?? 0} {order.unit || 'kg'}
            {order.total_price ? ` · ₹${order.total_price}` : ''}
          </p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800 whitespace-nowrap">
          ✓ Delivered
        </span>
      </div>

      <div className="border-t border-gray-100 pt-2 flex items-center justify-between text-xs">
        <div className="min-w-0">
          {order.farmer && (
            <p className="text-gray-600 truncate">🧑‍🌾 {order.farmer.name} · {order.farmer.village}</p>
          )}
          {order.buyer_name && (
            <p className="text-gray-600 truncate">🏠 {order.buyer_name}{order.delivery_pincode ? ` · ${order.delivery_pincode}` : ''}</p>
          )}
          <p className="text-gray-400 mt-0.5">{dateLabel}</p>
        </div>
        {(order.rider_payout ?? 0) > 0 && (
          <div className="text-right whitespace-nowrap">
            <p className="text-[10px] font-bold text-emerald-800 uppercase">Earned</p>
            <p className="text-sm font-extrabold text-emerald-900">₹{order.rider_payout}</p>
          </div>
        )}
      </div>
    </div>
  )
}

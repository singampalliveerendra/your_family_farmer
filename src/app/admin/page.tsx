'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Rider = {
  id: string
  name: string | null
  phone: string
  alt_phone: string | null
  vehicle_type: string | null
  vehicle_number: string | null
  service_areas: string | null
  status: 'pending_approval' | 'approved' | 'active' | 'suspended'
  activation_code: string | null
  id_proof_url: string | null
  approved_at: string | null
  activated_at: string | null
  last_login_at: string | null
  created_at: string
}

type DeliveryStatus = 'unassigned' | 'assigned' | 'picked_up' | 'out_for_delivery' | 'delivered'

type DeliveryOrder = {
  id: string
  produce_name: string | null
  quantity: number | null
  unit: string | null
  total_price: number | null
  buyer_name: string | null
  buyer_phone: string | null
  status: 'pending' | 'approved' | 'declined'
  payment_method: string | null
  payment_status: string | null
  delivery_status: DeliveryStatus | null
  delivery_address: string | null
  delivery_landmark: string | null
  delivery_pincode: string | null
  delivery_alt_phone: string | null
  delivery_boy_id: string | null
  handover_otp: string | null
  assigned_at: string | null
  picked_up_at: string | null
  out_for_delivery_at: string | null
  delivered_at: string | null
  created_at: string
  farmer: { id: string; name: string; village: string; phone: string | null } | null
  rider: { id: string; name: string | null; phone: string } | null
}

type ActiveRider = { id: string; name: string | null; phone: string; vehicle_number: string | null }

export default function AdminPage() {
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'deliveries' | 'riders'>('deliveries')
  const [riders, setRiders] = useState<Rider[]>([])
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [activeRiders, setActiveRiders] = useState<ActiveRider[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [reassignTarget, setReassignTarget] = useState<Record<string, string>>({})
  const [approvalCodes, setApprovalCodes] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/me', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (json?.admin) setAuthed(true)
        else router.replace('/admin/login')
      })
      .catch(() => { if (!cancelled) router.replace('/admin/login') })
    return () => { cancelled = true }
  }, [router])

  const loadRiders = useCallback(async () => {
    const r = await fetch('/api/admin/riders', { credentials: 'same-origin' }).catch(() => null)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load riders.'); return }
    setRiders((json.riders ?? []) as Rider[])
  }, [])

  const loadDeliveries = useCallback(async () => {
    const r = await fetch('/api/admin/deliveries', { credentials: 'same-origin' }).catch(() => null)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load deliveries.'); return }
    setOrders((json.orders ?? []) as DeliveryOrder[])
    setActiveRiders((json.riders ?? []) as ActiveRider[])
  }, [])

  useEffect(() => {
    if (!authed) return
    void loadRiders()
    void loadDeliveries()
    const t = setInterval(() => {
      void loadRiders()
      void loadDeliveries()
    }, 20_000)
    return () => clearInterval(t)
  }, [authed, loadRiders, loadDeliveries])

  const handleApprove = async (id: string) => {
    if (busyId) return
    setBusyId(id)
    const r = await fetch(`/api/admin/riders/${id}/approve`, { method: 'POST', credentials: 'same-origin' }).catch(() => null)
    setBusyId(null)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Approve failed.'); return }
    if (json?.activation_code) {
      setApprovalCodes((m) => ({ ...m, [id]: json.activation_code }))
    }
    await loadRiders()
  }

  const handleSuspend = async (id: string) => {
    if (busyId) return
    if (!confirm('Suspend this rider? They will not be able to log in.')) return
    setBusyId(id)
    const r = await fetch(`/api/admin/riders/${id}/suspend`, { method: 'POST', credentials: 'same-origin' }).catch(() => null)
    setBusyId(null)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Suspend failed.'); return }
    await loadRiders()
  }

  const handleReinstate = async (id: string) => {
    if (busyId) return
    setBusyId(id)
    const r = await fetch(`/api/admin/riders/${id}/reinstate`, { method: 'POST', credentials: 'same-origin' }).catch(() => null)
    setBusyId(null)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Reinstate failed.'); return }
    await loadRiders()
  }

  const handleReassign = async (orderId: string) => {
    const targetRider = reassignTarget[orderId] ?? ''
    if (busyId) return
    setBusyId(orderId)
    const r = await fetch(`/api/admin/orders/${orderId}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ riderId: targetRider }),
    }).catch(() => null)
    setBusyId(null)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Reassign failed.'); return }
    setReassignTarget((m) => ({ ...m, [orderId]: '' }))
    await loadDeliveries()
  }

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null)
    router.replace('/admin/login')
  }

  if (authed === null) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }
  if (!authed) return null

  const pendingRiders = riders.filter((r) => r.status === 'pending_approval' || r.status === 'approved')

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      <div className="bg-gray-900 px-4 pt-6 pb-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-gray-400 text-xs">Owner panel</p>
            <h1 className="text-white text-xl font-extrabold leading-tight">YFF Deliveries</h1>
          </div>
          <button onClick={handleLogout} className="text-gray-300 text-xs underline whitespace-nowrap">
            Log out
          </button>
        </div>
      </div>

      <div className="px-4 -mt-6 space-y-4 max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 p-1.5 flex gap-1.5 shadow-sm">
          <button
            onClick={() => setTab('deliveries')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${
              tab === 'deliveries' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'
            }`}
          >
            Deliveries ({orders.length})
          </button>
          <button
            onClick={() => setTab('riders')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${
              tab === 'riders' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'
            }`}
          >
            Riders ({riders.length}{pendingRiders.length > 0 ? ` · ${pendingRiders.length} pending` : ''})
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <p className="text-xs text-red-700 font-semibold">{error}</p>
            <button onClick={() => setError('')} className="text-[10px] text-red-600 underline mt-1">Dismiss</button>
          </div>
        )}

        {tab === 'deliveries' ? (
          orders.length === 0 ? (
            <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
              <div className="text-5xl mb-3">📭</div>
              <p className="font-semibold text-gray-500 text-sm">No delivery orders yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <DeliveryRow
                  key={o.id}
                  order={o}
                  activeRiders={activeRiders}
                  target={reassignTarget[o.id] ?? ''}
                  onTargetChange={(v) => setReassignTarget((m) => ({ ...m, [o.id]: v }))}
                  onReassign={() => handleReassign(o.id)}
                  busy={busyId === o.id}
                />
              ))}
            </div>
          )
        ) : riders.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
            <div className="text-5xl mb-3">🛵</div>
            <p className="font-semibold text-gray-500 text-sm">No rider applications yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {riders.map((r) => (
              <RiderRow
                key={r.id}
                rider={r}
                code={approvalCodes[r.id]}
                onApprove={() => handleApprove(r.id)}
                onSuspend={() => handleSuspend(r.id)}
                onReinstate={() => handleReinstate(r.id)}
                busy={busyId === r.id}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function DeliveryRow({
  order,
  activeRiders,
  target,
  onTargetChange,
  onReassign,
  busy,
}: {
  order: DeliveryOrder
  activeRiders: ActiveRider[]
  target: string
  onTargetChange: (v: string) => void
  onReassign: () => void
  busy: boolean
}) {
  const ds = order.delivery_status ?? 'unassigned'
  const statusColor =
    ds === 'delivered' ? 'bg-green-100 text-green-800'
      : ds === 'out_for_delivery' ? 'bg-purple-100 text-purple-800'
      : ds === 'picked_up' ? 'bg-blue-100 text-blue-800'
      : ds === 'assigned' ? 'bg-amber-100 text-amber-800'
      : 'bg-gray-100 text-gray-700'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-extrabold text-gray-900 text-sm leading-tight">
            {order.produce_name || 'Order'} · {order.quantity ?? 0} {order.unit ?? 'kg'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            ₹{order.total_price ?? 0} · {order.payment_method?.toUpperCase() ?? '—'} · order #{order.id.slice(0, 8)}
          </p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColor}`}>
          {ds.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase">Farmer</p>
          <p className="font-semibold text-gray-900">{order.farmer?.name ?? '—'}</p>
          <p className="text-gray-500">{order.farmer?.village ?? ''}</p>
          {order.farmer?.phone && (
            <a href={`tel:${order.farmer.phone}`} className="text-blue-700 underline">📞 {order.farmer.phone}</a>
          )}
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase">Customer</p>
          <p className="font-semibold text-gray-900">{order.buyer_name ?? '—'}</p>
          {order.buyer_phone && (
            <a href={`tel:${order.buyer_phone}`} className="text-blue-700 underline">📞 {order.buyer_phone}</a>
          )}
          {order.delivery_alt_phone && order.delivery_alt_phone !== order.buyer_phone && (
            <a href={`tel:${order.delivery_alt_phone}`} className="block text-blue-700 underline">Alt: {order.delivery_alt_phone}</a>
          )}
        </div>
      </div>

      {order.delivery_address && (
        <div className="border-t border-gray-100 pt-2 text-xs">
          <p className="text-[10px] font-bold text-gray-400 uppercase">Drop</p>
          <p className="text-gray-800 whitespace-pre-line">{order.delivery_address}</p>
          {order.delivery_landmark && <p className="text-gray-500">📍 {order.delivery_landmark}</p>}
          {order.delivery_pincode && <p className="text-gray-500">PIN {order.delivery_pincode}</p>}
        </div>
      )}

      <div className="border-t border-gray-100 pt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-gray-400 uppercase">Rider</p>
            {order.rider ? (
              <>
                <p className="text-xs font-semibold text-gray-900">{order.rider.name || 'Rider'}</p>
                <a href={`tel:${order.rider.phone}`} className="text-xs text-blue-700 underline">📞 {order.rider.phone}</a>
              </>
            ) : (
              <p className="text-xs text-gray-500 italic">Not assigned</p>
            )}
          </div>
          {order.handover_otp && ds !== 'delivered' && (
            <div className="text-right">
              <p className="text-[10px] font-bold text-gray-400 uppercase">Handover OTP</p>
              <p className="font-mono font-bold text-amber-700 text-base tracking-widest">{order.handover_otp}</p>
            </div>
          )}
        </div>

        {ds !== 'delivered' && (
          <div className="flex gap-2 pt-1">
            <select
              value={target}
              onChange={(e) => onTargetChange(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white focus:border-green-500 focus:outline-none"
            >
              <option value="">Choose rider / un-assign</option>
              {activeRiders.map((r) => (
                <option key={r.id} value={r.id}>
                  {(r.name || r.phone) + (r.vehicle_number ? ` · ${r.vehicle_number}` : '')}
                </option>
              ))}
            </select>
            <button
              onClick={onReassign}
              disabled={busy}
              className="bg-gray-900 text-white text-xs font-bold px-3 py-2 rounded-xl disabled:opacity-50 active:bg-gray-800 whitespace-nowrap"
            >
              {busy ? '...' : target ? 'Reassign' : 'Un-assign'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function RiderRow({
  rider,
  code,
  onApprove,
  onSuspend,
  onReinstate,
  busy,
}: {
  rider: Rider
  code?: string
  onApprove: () => void
  onSuspend: () => void
  onReinstate: () => void
  busy: boolean
}) {
  const statusColor =
    rider.status === 'active' ? 'bg-green-100 text-green-800'
      : rider.status === 'pending_approval' ? 'bg-amber-100 text-amber-800'
      : rider.status === 'approved' ? 'bg-blue-100 text-blue-800'
      : 'bg-red-100 text-red-800'

  const liveCode = code || rider.activation_code

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-extrabold text-gray-900 text-sm leading-tight">{rider.name || '—'}</p>
          <a href={`tel:${rider.phone}`} className="text-xs text-blue-700 underline">📞 {rider.phone}</a>
          {rider.alt_phone && rider.alt_phone !== rider.phone && (
            <a href={`tel:${rider.alt_phone}`} className="block text-xs text-blue-700 underline">Alt: {rider.alt_phone}</a>
          )}
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColor}`}>
          {rider.status.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="text-xs grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase">Vehicle</p>
          <p className="text-gray-800">{rider.vehicle_type || '—'} · {rider.vehicle_number || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase">Service areas</p>
          <p className="text-gray-800 whitespace-pre-line">{rider.service_areas || '—'}</p>
        </div>
      </div>

      {rider.id_proof_url && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">ID proof</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={rider.id_proof_url}
            alt="ID proof"
            className="w-full max-h-56 object-contain rounded-xl border border-gray-200 bg-gray-50"
          />
        </div>
      )}

      {(rider.status === 'approved') && liveCode && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 text-center">
          <p className="text-[10px] font-bold text-amber-800 uppercase">Activation code (share with rider)</p>
          <p className="text-2xl font-mono font-extrabold tracking-widest text-amber-900 mt-1">{liveCode}</p>
          <p className="text-[10px] text-amber-700 mt-1">They enter this once at /rider/activate, then log in normally.</p>
        </div>
      )}

      <div className="flex gap-2">
        {rider.status === 'pending_approval' && (
          <button
            onClick={onApprove}
            disabled={busy}
            className="flex-1 bg-green-700 text-white font-bold py-2.5 rounded-xl text-xs active:bg-green-800 disabled:opacity-50"
          >
            {busy ? '...' : 'Approve & generate code'}
          </button>
        )}
        {rider.status === 'approved' && (
          <button
            onClick={onApprove}
            disabled={busy}
            className="flex-1 bg-amber-600 text-white font-bold py-2.5 rounded-xl text-xs active:bg-amber-700 disabled:opacity-50"
          >
            {busy ? '...' : 'Show / re-issue code'}
          </button>
        )}
        {(rider.status === 'active' || rider.status === 'approved') && (
          <button
            onClick={onSuspend}
            disabled={busy}
            className="flex-1 border border-red-300 text-red-700 font-bold py-2.5 rounded-xl text-xs active:bg-red-50 disabled:opacity-50"
          >
            Suspend
          </button>
        )}
        {rider.status === 'suspended' && (
          <button
            onClick={onReinstate}
            disabled={busy}
            className="flex-1 bg-gray-900 text-white font-bold py-2.5 rounded-xl text-xs active:bg-gray-800 disabled:opacity-50"
          >
            {busy ? '...' : 'Reinstate'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 text-[10px] text-gray-400 border-t border-gray-100 pt-2">
        <div>
          <p>Applied</p>
          <p>{new Date(rider.created_at).toLocaleDateString('en-IN')}</p>
        </div>
        <div>
          <p>Activated</p>
          <p>{rider.activated_at ? new Date(rider.activated_at).toLocaleDateString('en-IN') : '—'}</p>
        </div>
        <div>
          <p>Last login</p>
          <p>{rider.last_login_at ? new Date(rider.last_login_at).toLocaleDateString('en-IN') : '—'}</p>
        </div>
      </div>
    </div>
  )
}

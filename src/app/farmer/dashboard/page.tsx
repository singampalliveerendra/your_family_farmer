'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import LanguageToggle from '@/components/LanguageToggle'
import { useLang } from '@/lib/LanguageContext'
import LocationSearch from '@/components/LocationSearch'
import { FreshnessBadge } from '@/components/FreshnessBadge'

type PickupSlots = {
  days: string[]
  time_from: string
  time_to: string
}

type Farmer = {
  id: string
  name: string
  slug: string
  village: string
  district: string
  phone: string
  method: string
  region_slug: string
  rating_avg: number | null
  buyer_count: number
  farming_since_year: number | null
  pickup_locations: string[] | null
  farm_address: string | null
  cover_photo_url: string | null
  photo_url: string | null
  pesticide_cert_url: string | null
  pickup_slots: PickupSlots | null
  lat: number | null
  lng: number | null
  location_name: string | null
  upi_id: string | null
  upi_qr_code_url: string | null
  cod_enabled: boolean | null
}

type DemandBar = {
  crop_name: string
  total_qty: number
}

type ListingRow = {
  id: string
  name: string
  variety: string | null
  emoji: string | null
  status: string
  method: string | null
  stock_qty: number | null
  price_tier_1_price: number | null
  price_tier_1_qty: number | null
  price_tier_2_price: number | null
  price_tier_2_qty: number | null
  price_tier_3_price: number | null
  description: string | null
  image_url: string | null
  brix: number | null
  soil_organic_carbon: number | null
  unit: string | null
  harvest_date: string | null
  availability_period: string | null
  delivery_mode: string | null
  delivery_charge: number | null
  delivery_radius_km: number | null
  created_at: string
}

// Lightweight listing shape for the dashboard's inline "Your produce" section
// (the Manage Listings modal loads the full ListingRow separately).
type DashboardListing = {
  id: string
  name: string
  emoji: string | null
  status: string
  price_tier_1_price: number | null
  unit: string | null
  stock_qty: number | null
}

type DeliveryStatus = 'unassigned' | 'assigned' | 'picked_up' | 'out_for_delivery' | 'delivered'

type Order = {
  id: string
  farmer_id: string
  produce_listing_id: string | null
  produce_name: string | null
  quantity: number | null
  unit: string | null
  total_price: number | null
  buyer_name: string | null
  buyer_phone: string | null
  pickup_location: string | null
  status: 'pending' | 'approved' | 'declined'
  payment_method: string | null
  payment_status: string | null
  utr_number: string | null
  decline_reason: string | null
  created_at: string
  delivery_type?: 'self_pickup' | 'home_delivery' | 'courier' | null
  delivery_status?: DeliveryStatus | null
  delivery_boy_id?: string | null
  fulfillment_date?: string | null
  collected_at?: string | null
  shipped_at?: string | null
  received_at?: string | null
}

// An approved order is "resolved" (and so leaves the farmer's active list) once:
//   self_pickup   → the buyer collected it (collected_at set)
//   courier       → the buyer confirmed receipt (received_at set); note a
//                   shipped-but-unreceived courier order stays active
//   home_delivery → the rider delivered it (delivery_status 'delivered')
function isResolved(o: Order): boolean {
  if (o.status !== 'approved') return false
  if (o.delivery_type === 'home_delivery') return o.delivery_status === 'delivered'
  if (o.delivery_type === 'courier') return !!o.received_at
  return !!o.collected_at
}

const UNIT_OPTIONS = [
  { value: 'kg', label: 'kg' },
  { value: 'gram', label: 'gram' },
  { value: 'piece', label: 'piece / నగ' },
  { value: 'bunch', label: 'bunch / కట్ట' },
  { value: 'litre', label: 'litre' },
]

type PreviewData = {
  name: string
  variety: string
  emoji: string
  price: string
  method: string
  stock: string
}

// 📦 is a generic "Other / ఇతర" icon so a farmer can list any produce
// even when no specific icon exists. Keep it last in the picker.
const EMOJI_OPTIONS = ['🍅', '🍌', '🥭', '🫑', '🥬', '🍆', '🥕', '🌽', '🧅', '🧄', '🥦', '🌿', '🍓', '🫒', '🌾', '🥥', '📦']

async function compressImage(file: File, maxPx = 800, quality = 0.7): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const blobUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(blobUrl)
      const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(file); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          const name = file.name.replace(/\.[^.]+$/, '.jpg')
          resolve(new File([blob], name, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(file) }
    img.src = blobUrl
  })
}

const isProfileComplete = (f: Farmer | null) =>
  !!f && f.name?.trim().length > 0 && f.village?.trim().length > 0

export default function FarmerDashboard() {
  const router = useRouter()
  const { tx } = useLang()
  const [farmer, setFarmer] = useState<Farmer | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [listings, setListings] = useState<DashboardListing[]>([])
  const [pendingOrders, setPendingOrders] = useState<Order[]>([])
  const [approvedCount, setApprovedCount] = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [ordersFilter, setOrdersFilter] = useState<'today' | 'week' | 'month'>('week')
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null)
  const [processingPaidId, setProcessingPaidId] = useState<string | null>(null)
  const [decliningOrder, setDecliningOrder] = useState<Order | null>(null)
  const [declineResult, setDeclineResult] = useState<
    { buyerName: string | null; amount: number | null; refundInitiated: boolean } | null
  >(null)
  const [demandBars, setDemandBars] = useState<DemandBar[]>([])
  const [monthlyRevenue, setMonthlyRevenue] = useState(0)
  const [monthlyOrderCount, setMonthlyOrderCount] = useState(0)
  const [weeklyEarnings, setWeeklyEarnings] = useState<number[]>([0, 0, 0, 0])
  const [showForm, setShowForm] = useState(false)
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [showListings, setShowListings] = useState(false)

  const loadDashboard = useCallback(async () => {
    const farmerId = localStorage.getItem('yff_farmer_id')
    if (!farmerId) { router.replace('/farmer/login'); return }

    const { data: farmerData } = await supabase
      .from('farmers')
      .select('*')
      .eq('id', farmerId)
      .maybeSingle()

    if (!farmerData) { setNotFound(true); setLoading(false); return }
    setFarmer(farmerData)

    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const [listingsRes, pendingRes, approvedRes, intentsRes, monthlyRes] = await Promise.all([
      // Full (lightweight) listing rows so the dashboard can show them inline
      // with a quick suspend/resume; the active-listings count is derived below.
      supabase.from('produce_listings').select('id, name, emoji, status, price_tier_1_price, unit, stock_qty').eq('farmer_id', farmerData.id).order('created_at', { ascending: false }),
      // Active orders = still pending, OR approved but not yet picked up/delivered.
      // Approved orders stay here so the farmer keeps the scheduled date in view
      // until the buyer collects (or the rider delivers).
      supabase.from('orders').select('*').eq('farmer_id', farmerData.id).in('status', ['pending', 'approved']).order('created_at', { ascending: false }),
      supabase.from('orders').select('id, total_price').eq('farmer_id', farmerData.id).eq('status', 'approved').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
      supabase.from('demand_intents').select('crop_name, quantity_kg').eq('region_slug', farmerData.region_slug).eq('fulfilled', false),
      supabase.from('orders').select('id, total_price, created_at').eq('farmer_id', farmerData.id).eq('status', 'approved').gte('created_at', monthStart.toISOString()),
    ])

    setListings((listingsRes.data ?? []) as DashboardListing[])
    // Drop approved orders that are already resolved (collected / delivered).
    const activeOrders = (pendingRes.data ?? []).filter((o) => !isResolved(o as Order)) as Order[]
    setPendingOrders(activeOrders)
    const approved = approvedRes.data ?? []
    setApprovedCount(approved.length)
    setTotalRevenue(approved.reduce((sum, o) => sum + (o.total_price ?? 0), 0))

    // Monthly earnings
    const monthly = monthlyRes.data ?? []
    setMonthlyRevenue(monthly.reduce((sum, o) => sum + (o.total_price ?? 0), 0))
    setMonthlyOrderCount(monthly.length)

    // Break into 4 weekly buckets (days 1-7, 8-14, 15-21, 22+)
    const weeks = [0, 0, 0, 0]
    for (const o of monthly) {
      const day = new Date(o.created_at).getDate()
      const bucket = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3
      weeks[bucket] += o.total_price ?? 0
    }
    setWeeklyEarnings(weeks)

    const map: Record<string, number> = {}
    for (const row of intentsRes.data ?? []) {
      map[row.crop_name] = (map[row.crop_name] ?? 0) + (Number(row.quantity_kg) || 0)
    }
    setDemandBars(
      Object.entries(map)
        .map(([crop_name, total_qty]) => ({ crop_name, total_qty }))
        .sort((a, b) => b.total_qty - a.total_qty)
        .slice(0, 5)
    )

    setLoading(false)
  }, [router])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  // Auto-open the profile edit modal the first time an incomplete farmer lands here.
  useEffect(() => {
    if (!loading && farmer && !isProfileComplete(farmer)) {
      setShowProfileEdit(true)
    }
  }, [loading, farmer])

  // Realtime subscription: new orders + payment status changes.
  // Replaces the old "consumer opens WhatsApp to notify farmer" flow.
  // Fires a browser notification when:
  //   - A new pending order is inserted
  //   - An existing order's payment_status flips to payment_claimed (incl. retries)
  useEffect(() => {
    if (!farmer) return

    const fireNotification = (title: string, body: string) => {
      if (typeof window === 'undefined') return
      if (!('Notification' in window)) return
      if (Notification.permission !== 'granted') return
      try {
        new Notification(title, { body, icon: '/icon-192.png', tag: 'yff-order' })
      } catch { /* some browsers throw on background tabs — ignore */ }
    }

    const channel = supabase
      .channel(`orders_${farmer.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `farmer_id=eq.${farmer.id}` },
        (payload) => {
          const row = payload.new as Order
          if (row.status !== 'pending') return
          setPendingOrders((prev) => prev.some((o) => o.id === row.id) ? prev : [row, ...prev])
          fireNotification(
            `New order from ${row.buyer_name ?? 'buyer'}`,
            `${row.produce_name ?? ''} ${row.quantity ?? ''} ${row.unit ?? ''}${row.total_price ? ` · ₹${row.total_price}` : ''}`.trim(),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `farmer_id=eq.${farmer.id}` },
        (payload) => {
          const row = payload.new as Order
          const prev = payload.old as Partial<Order>
          // Declined/cancelled, or an approved order that's now picked up /
          // delivered — it's resolved, so drop it from the active list.
          if ((row.status !== 'pending' && row.status !== 'approved') || isResolved(row)) {
            // Buyer just confirmed receipt of a courier order — tell the farmer
            // before it drops out of the active list and into history.
            if (row.received_at && !prev.received_at) {
              fireNotification(
                `Order received ✓ / అందుకున్నారు`,
                `${row.buyer_name ?? 'Buyer'} confirmed they received ${row.produce_name ?? 'the order'}`,
              )
            }
            setPendingOrders((cur) => cur.filter((o) => o.id !== row.id))
            return
          }
          // Still active (pending, or approved-and-awaiting): update or insert.
          setPendingOrders((cur) => {
            const exists = cur.some((o) => o.id === row.id)
            return exists ? cur.map((o) => o.id === row.id ? row : o) : [row, ...cur]
          })
          // Fire notification when buyer claims payment (covers initial pay AND retry)
          const becameClaimed =
            (row.payment_status === 'payment_claimed' || row.payment_status === 'pending_confirmation')
            && prev.payment_status !== row.payment_status
          if (becameClaimed) {
            fireNotification(
              `Buyer paid — verify payment`,
              `${row.buyer_name ?? 'Buyer'} sent ₹${row.total_price ?? '?'} for ${row.produce_name ?? 'order'}`,
            )
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [farmer])

  // Safety net for the realtime subscription: on slow/spotty 4G the websocket
  // can silently drop while the farmer is on another app. Refetch whenever the
  // dashboard tab regains focus so they never miss a new order.
  useEffect(() => {
    const refetch = () => { if (document.visibilityState === 'visible') loadDashboard() }
    document.addEventListener('visibilitychange', refetch)
    window.addEventListener('focus', refetch)
    return () => {
      document.removeEventListener('visibilitychange', refetch)
      window.removeEventListener('focus', refetch)
    }
  }, [loadDashboard])

  const handleLogout = () => {
    localStorage.removeItem('yff_farmer_id')
    localStorage.removeItem('yff_farmer_slug')
    router.replace('/farmer/login')
  }

  // Quick suspend/resume from the dashboard's inline produce list. Mirrors the
  // Manage Listings modal: flips 'suspended_by_farmer' ⇄ 'available'.
  const handleToggleListingSuspend = async (id: string, currentStatus: string) => {
    const next = currentStatus === 'suspended_by_farmer' ? 'available' : 'suspended_by_farmer'
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, status: next } : l)))
    const { error } = await supabase.from('produce_listings').update({ status: next }).eq('id', id)
    if (error) { void loadDashboard() } // re-sync on failure
  }

  // Approving requires the farmer to first set a pickup/delivery date — that
  // date is saved alongside the approval and shown to the buyer. The order then
  // stays in the active list (now marked approved) until it's picked up or
  // delivered, so the farmer keeps the schedule in view.
  const handleApprove = async (orderId: string, date: string) => {
    if (!date) return
    setProcessingOrderId(orderId)
    await supabase
      .from('orders')
      .update({ status: 'approved', fulfillment_date: date, confirmed_at: new Date().toISOString() })
      .eq('id', orderId)
    setPendingOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'approved', fulfillment_date: date } : o)),
    )
    setApprovedCount((c) => c + 1)
    setProcessingOrderId(null)
  }

  // Self-pickup: farmer taps "Picked Up" when the buyer collects. Stamps
  // collected_at server-side, which resolves the order — drop it from the
  // active list (it now appears in Order History).
  const handleMarkPickedUp = async (orderId: string) => {
    setProcessingOrderId(orderId)
    const res = await fetch(`/api/farmer/orders/${orderId}/picked-up`, { method: 'POST', credentials: 'same-origin' })
    if (res.ok) {
      setPendingOrders((prev) => prev.filter((o) => o.id !== orderId))
    } else {
      void loadDashboard() // re-sync on failure
    }
    setProcessingOrderId(null)
  }

  // Courier: farmer taps "Shipped" when they hand the parcel over. Stamps
  // shipped_at but the order stays active (awaiting the buyer's "Received").
  const handleMarkShipped = async (orderId: string) => {
    setProcessingOrderId(orderId)
    const res = await fetch(`/api/farmer/orders/${orderId}/ship`, { method: 'POST', credentials: 'same-origin' })
    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as { shipped_at?: string }
      const shippedAt = json.shipped_at ?? new Date().toISOString()
      setPendingOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, shipped_at: shippedAt } : o)))
    } else {
      void loadDashboard() // re-sync on failure
    }
    setProcessingOrderId(null)
  }

  // Farmer sets/clears the pickup-or-delivery date for an order. Saved
  // immediately so the consumer sees the exact date the farmer chose. An empty
  // string clears it back to null.
  const handleSetFulfillmentDate = async (orderId: string, date: string) => {
    const value = date || null
    setPendingOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, fulfillment_date: value } : o)),
    )
    await supabase.from('orders').update({ fulfillment_date: value }).eq('id', orderId)
  }

  const handleConfirmDecline = async (orderId: string, reason: string) => {
    const declined = decliningOrder
    setProcessingOrderId(orderId)
    // Declining runs server-side: it returns the reserved stock and, for a
    // paid order, issues a REAL Razorpay refund (the secret can't live in the
    // browser). If the refund fails the order stays pending so we can retry.
    try {
      const res = await fetch(`/api/farmer/orders/${orderId}/decline`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || 'Could not decline the order. Please try again. / ఆర్డర్ తిరస్కరించలేకపోయాం. మళ్ళీ ప్రయత్నించండి.')
        return
      }
      // Whether a refund went out (real Razorpay refund, or 'initiated' for
      // other paid methods) so we can confirm it to the farmer in plain terms.
      const refundInitiated = !!json.refunded || !!json.refundStatus
      setPendingOrders((prev) => prev.filter((o) => o.id !== orderId))
      setDeclineResult({
        buyerName: declined?.buyer_name ?? null,
        amount: declined?.total_price ?? null,
        refundInitiated,
      })
      setDecliningOrder(null)
    } catch {
      alert('Network error. Please try again. / నెట్‌వర్క్ సమస్య. మళ్ళీ ప్రయత్నించండి.')
    } finally {
      setProcessingOrderId(null)
    }
  }

  const handleMarkPaid = async (orderId: string) => {
    setProcessingPaidId(orderId)
    await supabase.from('orders').update({ payment_status: 'completed', paid_at: new Date().toISOString() }).eq('id', orderId)
    setPendingOrders((prev) =>
      prev.map((o) => o.id === orderId ? { ...o, payment_status: 'completed' } : o)
    )
    setProcessingPaidId(null)
  }

  const handleUpdatePaymentStatus = async (orderId: string, status: 'completed' | 'failed' | 'pending') => {
    setProcessingPaidId(orderId)
    const update: Record<string, string> = { payment_status: status }
    if (status === 'completed') {
      update.status = 'approved'
      update.paid_at = new Date().toISOString()
      update.confirmed_at = new Date().toISOString()
    }
    await supabase.from('orders').update(update).eq('id', orderId)
    setPendingOrders((prev) =>
      prev.map((o) => o.id === orderId ? { ...o, payment_status: status, ...(status === 'completed' ? { status: 'approved' } : {}) } : o)
    )
    setProcessingPaidId(null)
  }

  const filteredPendingOrders = pendingOrders.filter((o) => {
    const t = new Date(o.created_at).getTime()
    const now = Date.now()
    if (ordersFilter === 'today') {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      return t >= todayStart.getTime()
    }
    if (ordersFilter === 'week') return t >= now - 7 * 86400000
    return t >= now - 30 * 86400000
  })

  if (loading) return <LoadingScreen />
  if (notFound) return <FarmerNotFound onLogout={handleLogout} />

  // The list now also holds approved-but-unresolved orders; the stat card should
  // still reflect only the orders that genuinely need a response.
  const pendingCount = pendingOrders.filter((o) => o.status === 'pending').length
  // Active = visible-to-buyers listings, derived so the count stays in sync when
  // the farmer suspends/resumes from the inline produce list below.
  const activeListings = listings.filter((l) => l.status === 'available').length

  const profileComplete = isProfileComplete(farmer)
  const displayName = farmer!.name?.trim() || tx.welcome

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-green-900 px-4 pt-6 pb-10">
        <div className="flex justify-end mb-2">
          <LanguageToggle />
        </div>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-green-400 text-xs font-semibold mb-0.5 uppercase tracking-wide">
              {tx.farmerDashboard}
            </p>
            <h1 className="text-white text-xl font-extrabold leading-tight">{displayName}</h1>
            <p className="text-green-300 text-sm mt-0.5">
              {profileComplete
                ? `${farmer!.village}, ${farmer!.district}`
                : tx.completeProfilePrompt}
            </p>
            <p className="text-green-500 text-xs mt-1">+91 {farmer!.phone}</p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {profileComplete ? (
              <Link
                href={`/farmer/${farmer!.slug}`}
                className="bg-white text-green-800 text-xs font-bold px-3 py-2 rounded-xl"
              >
                {tx.viewProfile} ↗
              </Link>
            ) : (
              <span className="bg-amber-400 text-amber-900 text-[10px] font-bold px-2 py-1 rounded-full">
                {tx.incomplete}
              </span>
            )}
            <button
              onClick={() => setShowProfileEdit(true)}
              className="text-white text-xs underline"
            >
              {tx.editProfile}
            </button>
            <Link href="/farmer/complaints" className="inline-flex items-center gap-1 bg-amber-400 text-green-950 text-xs font-bold px-3 py-1.5 rounded-full shadow-md active:bg-amber-500">
              🛟 {tx.complaints}
            </Link>
            <button onClick={handleLogout} className="text-green-500 text-xs underline">
              {tx.logout}
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-5 space-y-4">
        {/* Notification permission banner — shown only if browser supports it
            and the farmer hasn't decided yet. Permission must be requested via
            a user gesture so we can't auto-call it on mount. */}
        <NotificationPermissionBanner />

        {/* Complete profile banner */}
        {!profileComplete && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">📝</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-extrabold text-amber-900 text-base leading-tight">
                {tx.completeProfileTitle}
              </h3>
              <p className="text-amber-700 text-xs mt-0.5">
                {tx.completeProfileHelp}
              </p>
              <button
                onClick={() => setShowProfileEdit(true)}
                className="mt-3 bg-amber-600 text-white font-bold px-4 py-2.5 rounded-xl text-sm"
              >
                {tx.fillDetails}
              </button>
            </div>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowListings(true)}
            className="border-green-200 bg-green-50 border rounded-2xl p-4 text-left active:bg-green-100 relative"
          >
            <div className="text-3xl font-black text-green-800">{activeListings}</div>
            <div className="text-sm font-semibold text-gray-800 mt-1 leading-tight">{tx.activeListings}</div>
            <div className="text-[11px] font-bold text-green-700 mt-2 flex items-center gap-1">
              {tx.manage} <span aria-hidden>→</span>
            </div>
          </button>
          {[
            { label: tx.pendingOrders, value: pendingCount, color: pendingCount > 0 ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50', vcolor: pendingCount > 0 ? 'text-orange-700' : 'text-gray-500' },
            { label: tx.approvedThisWeek, value: approvedCount, color: 'border-green-200 bg-green-50', vcolor: 'text-green-800' },
            { label: tx.totalRevenue, value: totalRevenue > 0 ? `₹${totalRevenue}` : '—', color: 'border-purple-200 bg-purple-50', vcolor: 'text-purple-800' },
          ].map((s) => (
            <div key={s.label} className={`${s.color} border rounded-2xl p-4`}>
              <div className={`text-3xl font-black ${s.vcolor}`}>{s.value}</div>
              <div className="text-sm font-semibold text-gray-800 mt-1 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Your produce — inline list with quick suspend/resume */}
        <DashboardProduceSection
          listings={listings}
          onManage={() => setShowListings(true)}
          onToggleSuspend={handleToggleListingSuspend}
        />

        {/* Monthly earnings summary */}
        <EarningsCard
          revenue={monthlyRevenue}
          orderCount={monthlyOrderCount}
          weekly={weeklyEarnings}
        />

        {/* Today's pickups & deliveries */}
        {farmer && <TodayScheduleSection farmerId={farmer.id} />}

        {/* Orders section */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-gray-100">
            <div>
              <h2 className="font-extrabold text-gray-900 text-base leading-tight">
                {tx.ordersTab}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">Pending orders need your response</p>
            </div>
            <Link href="/farmer/dashboard/orders" className="text-xs font-bold text-green-700">
              {tx.viewOrderHistory}
            </Link>
          </div>

          <div className="px-4 pt-3 pb-2 flex gap-2">
            {(['today', 'week', 'month'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setOrdersFilter(period)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  ordersFilter === period
                    ? 'bg-green-700 text-white'
                    : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}
              >
                {period === 'today' ? tx.filterToday : period === 'week' ? tx.filterWeek : tx.filterMonth}
              </button>
            ))}
          </div>

          <div className="px-4 pb-4 space-y-3">
            {filteredPendingOrders.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">📭</div>
                <p className="font-semibold text-gray-500 text-sm">{tx.noPendingOrders}</p>
                <p className="text-xs text-gray-400 mt-1">{tx.noPendingHelp}</p>
              </div>
            ) : (
              filteredPendingOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  processing={processingOrderId === order.id}
                  processingPaid={processingPaidId === order.id}
                  onApprove={(date) => handleApprove(order.id, date)}
                  onDecline={() => setDecliningOrder(order)}
                  onMarkPaid={() => handleMarkPaid(order.id)}
                  onUpdatePaymentStatus={(s) => handleUpdatePaymentStatus(order.id, s)}
                  onSetFulfillmentDate={(d) => handleSetFulfillmentDate(order.id, d)}
                  onMarkPickedUp={() => handleMarkPickedUp(order.id)}
                  onMarkShipped={() => handleMarkShipped(order.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Demand chart */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="font-extrabold text-gray-900 text-base leading-tight">
            {tx.localDemand}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5 mb-4">
            {tx.localDemandHelp}
          </p>

          {demandBars.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-gray-400 text-sm">{tx.noDemandSignals}</p>
              <p className="text-gray-400 text-xs mt-1">{tx.shareProfileLink}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {demandBars.map((bar) => {
                const pct = Math.round((bar.total_qty / demandBars[0].total_qty) * 100)
                return (
                  <div key={bar.crop_name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-gray-800">{bar.crop_name}</span>
                      <span className="text-xs text-gray-400 font-medium">{bar.total_qty} kg</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-600 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Add listing button */}
        {profileComplete ? (
          !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full bg-white border-2 border-green-700 text-green-700 font-bold py-4 rounded-2xl text-base flex items-center justify-center gap-2 active:bg-green-50"
            >
              <span className="text-xl leading-none">+</span>
              {tx.addNewProduce}
            </button>
          )
        ) : (
          <div className="w-full bg-gray-100 text-gray-500 font-semibold py-4 rounded-2xl text-sm text-center">
            {tx.completeBeforeAdd}
          </div>
        )}

        {/* Listing form */}
        {showForm && profileComplete && (
          <ProduceListingForm
            farmerId={farmer!.id}
            farmerSlug={farmer!.slug}
            farmerRegion={farmer!.region_slug}
            defaultMethod={farmer!.method}
            onClose={() => setShowForm(false)}
            onPublished={() => { setShowForm(false); loadDashboard() }}
          />
        )}

        {/* Farm photos */}
        {farmer && <FarmPhotosSection farmerId={farmer.id} />}
      </div>

      {/* Manage listings modal */}
      {showListings && farmer && (
        <ManageListingsModal
          farmerId={farmer.id}
          farmerSlug={farmer.slug}
          farmerRegion={farmer.region_slug}
          defaultMethod={farmer.method ?? 'natural'}
          onClose={() => setShowListings(false)}
          onChanged={loadDashboard}
        />
      )}

      {/* Edit profile modal */}
      {showProfileEdit && farmer && (
        <ProfileEditModal
          farmer={farmer}
          onClose={() => {
            // If profile still incomplete, don't allow close (keep banner as fallback)
            if (isProfileComplete(farmer)) setShowProfileEdit(false)
            else setShowProfileEdit(false) // allow dismiss; banner still shown
          }}
          onSaved={(updated) => {
            setFarmer(updated)
            setShowProfileEdit(false)
          }}
        />
      )}

      {/* Decline reason sheet — mandatory reason capture */}
      {decliningOrder && (
        <DeclineReasonSheet
          order={decliningOrder}
          processing={processingOrderId === decliningOrder.id}
          onCancel={() => setDecliningOrder(null)}
          onConfirm={(reason) => handleConfirmDecline(decliningOrder.id, reason)}
        />
      )}

      {/* Refund confirmation shown to the farmer right after declining */}
      {declineResult && (
        <DeclineSuccessSheet
          result={declineResult}
          onClose={() => setDeclineResult(null)}
        />
      )}
    </main>
  )
}

/* ─── Decline success / refund confirmation sheet ──────────── */
function DeclineSuccessSheet({
  result,
  onClose,
}: {
  result: { buyerName: string | null; amount: number | null; refundInitiated: boolean }
  onClose: () => void
}) {
  const buyer = result.buyerName || 'the customer'
  return (
    <div className="fixed inset-0 z-[130] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 text-center space-y-3">
        <div className="text-4xl">✅</div>
        <h2 className="font-extrabold text-gray-900 text-lg leading-tight">
          Order declined / ఆర్డర్ తిరస్కరించబడింది
        </h2>

        {result.refundInitiated ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-left space-y-1.5">
            <p className="font-bold text-green-800 text-sm flex items-center gap-1.5">
              <span>💸</span> Refund initiated / రీఫండ్ ప్రారంభమైంది
            </p>
            <p className="text-sm text-gray-700 leading-snug">
              {result.amount != null && result.amount > 0 ? (
                <>A refund of <span className="font-extrabold text-green-800">₹{result.amount}</span> has been started to {buyer}.</>
              ) : (
                <>A refund has been started to {buyer}.</>
              )}
            </p>
            <p className="text-xs text-gray-500 leading-snug">
              It will reach their account in <span className="font-semibold">3–5 business days</span>.
              The customer has been told this automatically.
              <br />
              కొనుగోలుదారు ఖాతాకు 3–5 పని దినాలలో జమ అవుతుంది.
            </p>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-left">
            <p className="text-sm text-gray-700 leading-snug">
              {buyer} hadn&apos;t paid yet, so no refund is needed.
              <br />
              <span className="text-gray-500 text-xs">చెల్లింపు జరగలేదు, రీఫండ్ అవసరం లేదు.</span>
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full bg-green-700 text-white font-bold py-3 rounded-xl text-sm active:bg-green-800"
        >
          Done / సరే
        </button>
      </div>
    </div>
  )
}

/* ─── Decline reason bottom sheet ──────────────────────────── */
const DECLINE_PRESETS = [
  'Stock finished',
  'Not available this week',
  'Price changed',
  'Incorrect order details',
]

function DeclineReasonSheet({
  order,
  processing,
  onCancel,
  onConfirm,
}: {
  order: Order
  processing: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [custom, setCustom] = useState('')

  const finalReason = selected ?? custom.trim()
  const canSubmit = finalReason.length >= 3 && !processing

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-end justify-center">
      <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-gray-900 text-lg leading-tight">
              Why decline this order? / ఎందుకు తిరస్కరిస్తున్నారు?
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">
              The reason will be shown to the buyer / కారణం కొనుగోలుదారుకు చూపబడుతుంది
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={processing}
            className="text-gray-400 text-3xl leading-none p-1 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-700">
          <span className="font-semibold">{order.buyer_name || 'Buyer'}</span>
          {order.produce_name && <> · {order.produce_name}</>}
          {order.quantity != null && <> · {order.quantity} {order.unit || 'kg'}</>}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">
            Pick a reason / కారణం ఎంచుకోండి
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DECLINE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => { setSelected(preset); setCustom('') }}
                className={`px-3 py-2.5 rounded-xl text-xs font-bold border-2 transition-colors text-left leading-snug ${
                  selected === preset
                    ? 'border-red-500 bg-red-50 text-red-800'
                    : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1.5">
            Or type your reason / లేదా టైప్ చేయండి
          </label>
          <textarea
            value={custom}
            onChange={(e) => { setCustom(e.target.value); if (e.target.value.trim()) setSelected(null) }}
            placeholder="e.g. Heavy rain damaged the harvest"
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none resize-none"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={processing}
            className="flex-1 border-2 border-gray-300 text-gray-700 font-bold py-3 rounded-xl text-sm disabled:opacity-50"
          >
            Cancel / రద్దు
          </button>
          <button
            onClick={() => onConfirm(finalReason)}
            disabled={!canSubmit}
            className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50 active:bg-red-700"
          >
            {processing ? 'Declining...' : 'Confirm decline'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Notification permission banner ───────────────────────── */
function NotificationPermissionBanner() {
  const [perm, setPerm] = useState<'unsupported' | 'default' | 'granted' | 'denied'>('unsupported')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPerm('unsupported')
      return
    }
    setPerm(Notification.permission as 'default' | 'granted' | 'denied')
    setDismissed(localStorage.getItem('yff_notif_banner_dismissed') === '1')
  }, [])

  const handleEnable = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    const result = await Notification.requestPermission()
    setPerm(result)
    if (result === 'granted') {
      try { new Notification('YourFamilyFarmer', { body: 'You will be alerted on every new order.' }) } catch {}
    }
  }

  const handleDismiss = () => {
    localStorage.setItem('yff_notif_banner_dismissed', '1')
    setDismissed(true)
  }

  if (perm === 'unsupported' || perm === 'granted') return null
  if (dismissed) return null

  if (perm === 'denied') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-3">
        <span className="text-xl flex-shrink-0">🔕</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-amber-900 leading-snug">
            Notifications blocked / నోటిఫికేషన్‌లు బ్లాక్
          </p>
          <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
            Enable notifications in your browser settings to get alerted on new orders.
          </p>
        </div>
        <button onClick={handleDismiss} className="text-amber-700 text-xl leading-none px-1">×</button>
      </div>
    )
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 flex items-start gap-3">
      <span className="text-xl flex-shrink-0">🔔</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-blue-900 leading-snug">
          Get notified instantly / తక్షణ నోటిఫికేషన్
        </p>
        <p className="text-[11px] text-blue-700 mt-0.5 leading-snug">
          Allow notifications to be alerted the moment a buyer places an order.
        </p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleEnable}
            className="bg-blue-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs active:bg-blue-700"
          >
            Enable / ఆన్ చేయండి
          </button>
          <button
            onClick={handleDismiss}
            className="border border-blue-300 text-blue-700 font-semibold px-3 py-1.5 rounded-lg text-xs"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Profile edit modal ─────────────────────────────────── */
function ProfileEditModal({
  farmer,
  onClose,
  onSaved,
}: {
  farmer: Farmer
  onClose: () => void
  onSaved: (updated: Farmer) => void
}) {
  const { tx } = useLang()
  const [name, setName] = useState(farmer.name ?? '')
  const [village, setVillage] = useState(farmer.village ?? '')
  const [district, setDistrict] = useState(farmer.district ?? '')
  const [method, setMethod] = useState(farmer.method ?? 'natural')
  const [sinceYear, setSinceYear] = useState(
    farmer.farming_since_year ? String(farmer.farming_since_year) : '',
  )
  const [pickupLocations, setPickupLocations] = useState<string[]>(
    Array.isArray(farmer.pickup_locations) ? farmer.pickup_locations : [],
  )
  const [newPickup, setNewPickup] = useState('')
  const [farmAddress, setFarmAddress] = useState(farmer.farm_address ?? '')

  // Cover photo
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [existingCoverUrl, setExistingCoverUrl] = useState(farmer.cover_photo_url ?? '')

  // Avatar photo
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [existingAvatarUrl, setExistingAvatarUrl] = useState(farmer.photo_url ?? '')

  // Pesticide cert
  const [certFile, setCertFile] = useState<File | null>(null)
  const [certPreview, setCertPreview] = useState('')
  const [existingCertUrl, setExistingCertUrl] = useState(farmer.pesticide_cert_url ?? '')

  // UPI ID + QR
  const [upiId, setUpiId] = useState(farmer.upi_id ?? '')
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [qrPreview, setQrPreview] = useState('')
  const [existingQrUrl, setExistingQrUrl] = useState(farmer.upi_qr_code_url ?? '')

  // Cash on Delivery acceptance — default off
  const [codEnabled, setCodEnabled] = useState<boolean>(farmer.cod_enabled === true)

  // Change password
  const [showPwSection, setShowPwSection] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwLoading, setPwLoading]         = useState(false)
  const [pwError, setPwError]             = useState('')
  const [pwSuccess, setPwSuccess]         = useState(false)

  // Farm GPS location
  const [farmerLat, setFarmerLat] = useState<number | null>(farmer.lat ?? null)
  const [farmerLng, setFarmerLng] = useState<number | null>(farmer.lng ?? null)
  const [farmerLocationName, setFarmerLocationName] = useState(farmer.location_name ?? '')
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleFarmerGPS = () => {
    if (!navigator.geolocation) {
      setLocError('Geolocation not supported on this device.')
      return
    }
    setLocating(true)
    setLocError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setFarmerLat(latitude)
        setFarmerLng(longitude)
        // Use village name as display name since we have it
        setFarmerLocationName(farmer.village || 'Farm')
        setLocating(false)
      },
      (err) => {
        setLocError(
          err.code === 1
            ? 'Location permission denied / లొకేషన్ అనుమతి లేదు. Please allow location in browser settings.'
            : 'Could not get location. Please try again. / మళ్ళీ ప్రయత్నించండి.'
        )
        setLocating(false)
      },
      { timeout: 15000, enableHighAccuracy: true },
    )
  }

  const handlePickFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (f: File | null) => void,
    setPreview: (s: string) => void,
    currentPreview: string,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError(tx.pickImageFile); return }
    if (file.size > 8 * 1024 * 1024) { setError(tx.imageTooLarge); return }
    setError('')
    if (currentPreview) URL.revokeObjectURL(currentPreview)
    const compressed = await compressImage(file)
    setFile(compressed)
    setPreview(URL.createObjectURL(compressed))
  }

  const uploadProfileImage = async (file: File, pathSuffix: string): Promise<{ url: string | null; err: string | null }> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    // Include timestamp in path so each upload gets a unique URL, busting browser cache
    const path = `${farmer.id}/${pathSuffix}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('farm-images')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (upErr) return { url: null, err: `Upload failed: ${upErr.message}` }
    const { data } = supabase.storage.from('farm-images').getPublicUrl(path)
    return { url: data.publicUrl, err: null }
  }

  const addPickup = () => {
    const v = newPickup.trim()
    if (!v) return
    if (pickupLocations.includes(v)) { setNewPickup(''); return }
    setPickupLocations((prev) => [...prev, v])
    setNewPickup('')
  }
  const removePickup = (loc: string) =>
    setPickupLocations((prev) => prev.filter((l) => l !== loc))

  const handleSave = async () => {
    if (!name.trim()) { setError(tx.nameRequired); return }
    if (!village.trim()) { setError(tx.villageRequired); return }
    if (upiId.trim() && !/^[a-zA-Z0-9._\-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim())) {
      setError('Invalid UPI ID format. Example: yourname@ybl or 9876543210@paytm')
      return
    }
    setLoading(true)
    setError('')

    // Build unique slug from name if current slug is still auto-generated
    const isAutoSlug = /^f-\d{10}-[a-z0-9]{4}$/.test(farmer.slug ?? '')
    const baseSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'farmer'
    let newSlug = farmer.slug
    if (isAutoSlug && baseSlug) {
      const rand = Math.random().toString(36).slice(2, 5)
      newSlug = `${baseSlug}-${rand}`
    }

    // Upload photos in parallel
    const [coverRes, avatarRes, certRes, qrRes] = await Promise.all([
      coverFile ? uploadProfileImage(coverFile, 'cover') : Promise.resolve({ url: null, err: null }),
      avatarFile ? uploadProfileImage(avatarFile, 'avatar') : Promise.resolve({ url: null, err: null }),
      certFile  ? uploadProfileImage(certFile,  'pesticide-cert') : Promise.resolve({ url: null, err: null }),
      qrFile    ? uploadProfileImage(qrFile,    'upi-qr') : Promise.resolve({ url: null, err: null }),
    ])
    const uploadErr = coverRes.err ?? avatarRes.err ?? certRes.err ?? qrRes.err
    if (uploadErr) { setError(uploadErr); setLoading(false); return }

    const payload: Record<string, unknown> = {
      name:             name.trim(),
      village:          village.trim(),
      district:         district.trim(),
      method,
      slug:             newSlug,
      pickup_locations: pickupLocations,
      farm_address:     farmAddress.trim() || null,
      cover_photo_url:  (coverRes.url ?? existingCoverUrl) || null,
      photo_url:        (avatarRes.url ?? existingAvatarUrl) || null,
      pesticide_cert_url: (certRes.url ?? existingCertUrl) || null,
      upi_id:           upiId.trim() || null,
      upi_qr_code_url:  (qrRes.url ?? existingQrUrl) || null,
      cod_enabled:      codEnabled,
      lat: farmerLat,
      lng: farmerLng,
      location_name: farmerLat ? (farmerLocationName || name.trim()) : null,
    }
    if (sinceYear) payload.farming_since_year = Number(sinceYear)

    const { data, error: err } = await supabase
      .from('farmers')
      .update(payload)
      .eq('id', farmer.id)
      .select('*')
      .single()

    setLoading(false)

    if (err || !data) {
      setError(err?.message ?? tx.couldNotSave)
      return
    }

    localStorage.setItem('yff_farmer_slug', data.slug)
    onSaved(data)
  }

  const handleChangePassword = async () => {
    if (!currentPassword) { setPwError('Current password is required / ప్రస్తుత పాస్‌వర్డ్ అవసరం'); return }
    if (newPassword.length < 6) { setPwError('Minimum 6 characters / కనీసం 6 అక్షరాలు'); return }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match / పాస్‌వర్డ్‌లు సరిపోలలేదు'); return }
    setPwLoading(true)
    setPwError('')
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    const json = await res.json().catch(() => ({}))
    setPwLoading(false)
    if (!res.ok) { setPwError(json.error ?? 'Could not update password.'); return }
    setPwSuccess(true)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setTimeout(() => { setPwSuccess(false); setShowPwSection(false) }, 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <h3 className="font-extrabold text-gray-900 text-base">
              {tx.profileModalTitle}
            </h3>
            <p className="text-xs text-gray-500">{tx.profileModalSubtitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-3xl leading-none p-1">×</button>
        </div>

        <div className="p-4 space-y-4">
          {/* ── Section 1: Farm Profile ── */}
          <div className="pt-1 border-t-2 border-green-100 first:border-t-0">
            <h4 className="text-sm font-extrabold text-green-800">Farm Profile / పొలం వివరాలు</h4>
            <p className="text-[11px] text-gray-500">Name, photo, certifications</p>
          </div>

          <Field
            label={tx.yourNameLabel}
            placeholder="Ramu Reddy"
            value={name}
            onChange={setName}
          />
          <Field
            label={tx.villageLabel}
            placeholder="Tadepalligudem"
            value={village}
            onChange={setVillage}
          />
          <Field
            label={tx.districtLabel}
            placeholder="West Godavari"
            value={district}
            onChange={setDistrict}
          />

          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
              {tx.farmingMethodLabel}
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-green-500 focus:outline-none"
            >
              <option value="natural">{tx.methodNatural}</option>
              <option value="organic">{tx.methodOrganic}</option>
              <option value="low_chemical">{tx.methodLowChemical}</option>
              <option value="chemical">{tx.methodChemical}</option>
            </select>
          </div>

          <Field
            label={tx.farmingSinceLabel}
            placeholder="e.g. 2005"
            value={sinceYear}
            onChange={setSinceYear}
            type="number"
          />

          {/* Farm GPS location */}
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
              Farm location / పొలం లొకేషన్
            </label>
            <p className="text-[11px] text-gray-500 mb-2 leading-snug">
              Set your farm location so nearby buyers discover your produce first.<br />
              దగ్గరలో ఉన్న కొనుగోలుదారులు మీ పంటను ముందుగా కనుగొంటారు.
            </p>
            {farmerLat && farmerLng ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <span className="text-sm font-semibold text-green-800">
                  ✓ 📍 {farmerLocationName || 'Location set'}
                </span>
                <button
                  type="button"
                  onClick={() => { setFarmerLat(null); setFarmerLng(null); setFarmerLocationName('') }}
                  className="text-xs text-green-700 underline font-semibold"
                >
                  Change / మార్చు
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleFarmerGPS}
                  disabled={locating}
                  className="w-full flex items-center justify-center gap-2 bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm active:bg-green-800 disabled:opacity-50"
                >
                  {locating ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Getting location... / లొకేషన్ తెస్తోంది
                    </>
                  ) : (
                    <>📍 Use GPS (most accurate) / GPS వాడండి</>
                  )}
                </button>
                <div className="flex items-center gap-2">
                  <div className="flex-1 border-t border-gray-200" />
                  <span className="text-[10px] text-gray-400 font-semibold">OR / లేదా</span>
                  <div className="flex-1 border-t border-gray-200" />
                </div>
                <LocationSearch
                  placeholder="Search farm location / పొలం లొకేషన్ వెతకండి"
                  onSelect={(lat, lng, name) => {
                    setFarmerLat(lat)
                    setFarmerLng(lng)
                    setFarmerLocationName(name)
                  }}
                />
              </div>
            )}
            {locError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mt-2">{locError}</p>
            )}
          </div>

          {/* Farm cover photo */}
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
              {tx.coverPhotoLabel}
            </label>
            <p className="text-[11px] text-gray-500 mb-2">{tx.coverPhotoHelp}</p>
            <ProfilePhotoUpload
              preview={coverPreview}
              existingUrl={existingCoverUrl}
              onPick={(e) => handlePickFile(e, setCoverFile, setCoverPreview, coverPreview)}
              onClear={() => { if (coverPreview) URL.revokeObjectURL(coverPreview); setCoverFile(null); setCoverPreview(''); setExistingCoverUrl('') }}
              takeLabel={tx.takePhoto}
              galleryLabel={tx.fromGallery}
              aspectClass="aspect-[3/1]"
            />
          </div>

          {/* Farmer avatar */}
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
              {tx.avatarLabel}
            </label>
            <p className="text-[11px] text-gray-500 mb-2">{tx.avatarHelp}</p>
            <ProfilePhotoUpload
              preview={avatarPreview}
              existingUrl={existingAvatarUrl}
              onPick={(e) => handlePickFile(e, setAvatarFile, setAvatarPreview, avatarPreview)}
              onClear={() => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); setAvatarFile(null); setAvatarPreview(''); setExistingAvatarUrl('') }}
              takeLabel={tx.takePhoto}
              galleryLabel={tx.fromGallery}
              aspectClass="aspect-square max-w-[120px]"
            />
          </div>

          {/* Pesticide cert */}
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
              {tx.pesticideCertLabel}
            </label>
            <p className="text-[11px] text-gray-500 mb-2">{tx.pesticideCertHelp}</p>
            {existingCertUrl && !certPreview ? (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3">
                <span className="text-green-700 font-semibold text-sm">{tx.certUploaded}</span>
                <a href={existingCertUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-green-700 underline font-semibold ml-auto">{tx.viewCertificate}</a>
                <button type="button" onClick={() => setExistingCertUrl('')}
                  className="text-xs text-red-500 underline">{tx.removeCert}</button>
              </div>
            ) : (
              <ProfilePhotoUpload
                preview={certPreview}
                existingUrl=""
                onPick={(e) => handlePickFile(e, setCertFile, setCertPreview, certPreview)}
                onClear={() => { if (certPreview) URL.revokeObjectURL(certPreview); setCertFile(null); setCertPreview('') }}
                takeLabel={tx.takePhoto}
                galleryLabel={tx.uploadCert}
                aspectClass="aspect-[4/3]"
              />
            )}
          </div>

          {/* ── Section 2: Pickup & Schedule ── */}
          <div className="pt-3 border-t-2 border-green-100">
            <h4 className="text-sm font-extrabold text-green-800">Pickup &amp; Schedule / పికప్ &amp; షెడ్యూల్</h4>
            <p className="text-[11px] text-gray-500">Where and when buyers collect</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
              Farm pickup address / పొలం చిరునామా
            </label>
            <p className="text-[11px] text-gray-500 mb-2 leading-snug">
              Where should the delivery rider come to collect the produce? Include door number, street and landmark.
              <br />
              డెలివరీ రైడర్ ఎక్కడకు వచ్చి సరుకు తీసుకోవాలి? డోర్ నంబర్, వీధి, ల్యాండ్‌మార్క్ ఇవ్వండి.
            </p>
            <textarea
              value={farmAddress}
              onChange={(e) => setFarmAddress(e.target.value)}
              rows={3}
              maxLength={400}
              placeholder="H. No. 12-34, Mango Grove Road, near water tank, Anand Nagar"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
              {tx.pickupLocationsLabel}
            </label>
            <p className="text-[11px] text-gray-500 mb-2 leading-snug">
              {tx.pickupLocationsHelp}
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder={tx.pickupPlaceholder}
                value={newPickup}
                onChange={(e) => setNewPickup(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addPickup() }
                }}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={addPickup}
                className="bg-green-700 text-white font-bold px-4 rounded-xl text-sm"
              >
                {tx.addBtn}
              </button>
            </div>
            {pickupLocations.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pickupLocations.map((loc) => (
                  <span
                    key={loc}
                    className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-800 rounded-full pl-3 pr-1 py-1 text-xs font-semibold"
                  >
                    📍 {loc}
                    <button
                      type="button"
                      onClick={() => removePickup(loc)}
                      className="w-5 h-5 rounded-full bg-green-200 text-green-800 text-sm leading-none flex items-center justify-center"
                      aria-label={`Remove ${loc}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Section 3: Payment Details ── */}
          <div className="pt-3 border-t-2 border-green-100">
            <h4 className="text-sm font-extrabold text-green-800">Payment Details / చెల్లింపు వివరాలు</h4>
            <p className="text-[11px] text-gray-500">UPI ID, QR code, cash on delivery</p>
          </div>

          {/* Payment Details */}
          <div className="space-y-4 border border-gray-200 rounded-2xl p-4">
            {/* UPI ID */}
            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1">
                UPI ID
              </label>
              <p className="text-[11px] text-gray-500 mb-2">
                Buyers will pay directly to this ID. Example: yourname@ybl, 9876543210@paytm
              </p>
              <input
                type="text"
                inputMode="email"
                placeholder="yourname@ybl"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value.trim())}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
              />
              {upiId.trim() && (
                <p className="text-[11px] text-green-700 mt-1 font-medium">
                  ✓ Buyers can pay directly to this UPI ID
                </p>
              )}
            </div>

            {/* UPI QR Code */}
            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1">
                UPI QR Code (optional) / UPI QR కోడ్
              </label>
              <p className="text-[11px] text-gray-500 mb-2">
                Buyers can scan this to pay. Get your QR from PhonePe, GPay, or BHIM app.
              </p>
              {(existingQrUrl && !qrPreview) ? (
                <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={existingQrUrl} alt="QR Code" className="w-12 h-12 object-contain rounded" />
                  <span className="text-green-700 font-semibold text-sm flex-1">✓ QR code uploaded</span>
                  <button
                    type="button"
                    onClick={() => setExistingQrUrl('')}
                    className="text-xs text-red-500 underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <ProfilePhotoUpload
                  preview={qrPreview}
                  existingUrl=""
                  onPick={(e) => handlePickFile(e, setQrFile, setQrPreview, qrPreview)}
                  onClear={() => { if (qrPreview) URL.revokeObjectURL(qrPreview); setQrFile(null); setQrPreview('') }}
                  takeLabel="Take photo"
                  galleryLabel="Upload QR"
                  aspectClass="aspect-square max-w-[180px]"
                />
              )}
            </div>

            {/* Cash on Delivery toggle */}
            <div>
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={codEnabled}
                  onChange={(e) => setCodEnabled(e.target.checked)}
                  className="mt-1 h-5 w-5 accent-green-600"
                />
                <span className="flex-1">
                  <span className="block text-sm font-bold text-gray-900">
                    Accept Cash on Delivery / నగదు చెల్లింపు అంగీకరించు
                  </span>
                  <span className="block text-[11px] text-gray-500 mt-0.5">
                    {codEnabled
                      ? 'Buyers can choose to pay in cash on pickup. / కొనుగోలుదారులు పికప్ సమయంలో నగదు చెల్లించవచ్చు.'
                      : 'Off — buyers must pay via UPI before pickup. / ఆఫ్ — కొనుగోలుదారులు పికప్‌కు ముందు UPI ద్వారా చెల్లించాలి.'}
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Change Password */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => { setShowPwSection((v) => !v); setPwError(''); setPwSuccess(false) }}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 bg-gray-50 active:bg-gray-100"
            >
              <span>🔑 Change Password / పాస్‌వర్డ్ మార్చండి</span>
              <span className="text-gray-400 text-lg leading-none">{showPwSection ? '−' : '+'}</span>
            </button>

            {showPwSection && (
              <div className="px-4 py-3 space-y-3">
                {pwSuccess ? (
                  <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2 text-center font-semibold">
                    ✓ Password updated! / పాస్‌వర్డ్ మార్చబడింది!
                  </p>
                ) : (
                  <>
                    <input
                      type="password"
                      placeholder="Current password / ప్రస్తుత పాస్‌వర్డ్"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
                    />
                    <input
                      type="password"
                      placeholder="New password / కొత్త పాస్‌వర్డ్"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
                    />
                    <input
                      type="password"
                      placeholder="Confirm password / నిర్ధారించండి"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
                    />
                    {pwError && (
                      <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{pwError}</p>
                    )}
                    <button
                      onClick={handleChangePassword}
                      disabled={pwLoading || !currentPassword || newPassword.length < 6}
                      className="w-full bg-gray-800 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50 active:bg-gray-900"
                    >
                      {pwLoading ? 'Updating… / మారుస్తోంది…' : 'Update Password / పాస్‌వర్డ్ అప్‌డేట్ చేయండి'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 border-2 border-gray-300 text-gray-700 font-bold py-4 rounded-xl text-base disabled:opacity-50 active:bg-gray-50"
            >
              {tx.cancel}
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !name.trim() || !village.trim()}
              className="flex-1 bg-green-700 text-white font-bold py-4 rounded-xl text-base disabled:opacity-50 active:bg-green-800"
            >
              {loading ? tx.saving : tx.saveProfile}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Reusable photo upload widget for profile modal ────────── */
function ProfilePhotoUpload({
  preview,
  existingUrl,
  onPick,
  onClear,
  takeLabel,
  galleryLabel,
  aspectClass,
}: {
  preview: string
  existingUrl: string
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClear: () => void
  takeLabel: string
  galleryLabel: string
  aspectClass: string
}) {
  const shown = preview || existingUrl
  if (shown) {
    return (
      <div className={`relative ${aspectClass} rounded-xl overflow-hidden border border-gray-200 bg-gray-50`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shown} alt="" className="w-full h-full object-cover" />
        <button
          type="button"
          onClick={onClear}
          className="absolute top-2 right-2 bg-white/90 text-gray-700 rounded-full w-8 h-8 flex items-center justify-center text-base font-bold shadow"
        >
          ×
        </button>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="flex items-center justify-center gap-2 border-2 border-dashed border-green-300 rounded-xl py-4 px-2 text-green-700 text-xs font-bold cursor-pointer active:bg-green-50">
        <span>📷</span> {takeLabel}
        <input type="file" accept="image/*" onChange={onPick} className="hidden" />
      </label>
      <label className="flex items-center justify-center gap-2 border-2 border-dashed border-green-300 rounded-xl py-4 px-2 text-green-700 text-xs font-bold cursor-pointer active:bg-green-50">
        <span>🖼</span> {galleryLabel}
        <input type="file" accept="image/*" onChange={onPick} className="hidden" />
      </label>
    </div>
  )
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  placeholder?: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
      />
    </div>
  )
}

/* ─── Produce listing form ──────────────────────────────────── */
function ProduceListingForm({
  farmerId,
  farmerSlug = '',
  farmerRegion = '',
  defaultMethod,
  editData,
  onClose,
  onPublished,
}: {
  farmerId: string
  farmerSlug?: string
  farmerRegion?: string
  defaultMethod: string
  editData?: ListingRow | null
  onClose: () => void
  onPublished: (saved?: Partial<ListingRow>) => void
}) {
  const { tx } = useLang()
  const isEdit = !!editData
  const [name, setName] = useState(editData?.name ?? '')
  const [variety, setVariety] = useState(editData?.variety ?? '')
  const [emoji, setEmoji] = useState(editData?.emoji ?? '🌿')
  const [qty, setQty] = useState(editData?.stock_qty != null ? String(editData.stock_qty) : '')
  const [period, setPeriod] = useState(editData?.availability_period ?? '')
  const [farmingMethod, setFarmingMethod] = useState(editData?.method ?? defaultMethod ?? 'natural')
  const [price1, setPrice1] = useState(editData?.price_tier_1_price != null ? String(editData.price_tier_1_price) : '')
  const [price1Qty, setPrice1Qty] = useState(editData?.price_tier_1_qty != null ? String(editData.price_tier_1_qty) : '5')
  const [price2, setPrice2] = useState(editData?.price_tier_2_price != null ? String(editData.price_tier_2_price) : '')
  const [price2Qty, setPrice2Qty] = useState(editData?.price_tier_2_qty != null ? String(editData.price_tier_2_qty) : '20')
  const [price3, setPrice3] = useState(editData?.price_tier_3_price != null ? String(editData.price_tier_3_price) : '')
  const [description, setDescription] = useState(editData?.description ?? '')
  const [brix, setBrix] = useState(editData?.brix != null ? String(editData.brix) : '')
  const [soc, setSoc] = useState(editData?.soil_organic_carbon != null ? String(editData.soil_organic_carbon) : '')
  const [unit, setUnit] = useState(editData?.unit ?? 'kg')
  // #11 — delivery method for this listing: pickup only, farmer courier, or both.
  // Courier collects a flat charge within a radius (km) the farmer sets.
  const [deliveryMode, setDeliveryMode] = useState<'pickup' | 'courier' | 'both'>(
    (editData?.delivery_mode as 'pickup' | 'courier' | 'both') ?? 'pickup',
  )
  const [deliveryCharge, setDeliveryCharge] = useState(editData?.delivery_charge != null ? String(editData.delivery_charge) : '')
  const [deliveryRadius, setDeliveryRadius] = useState(editData?.delivery_radius_km != null ? String(editData.delivery_radius_km) : '')
  // harvest_date is a Postgres `date`, but guard against a full timestamp
  // ever coming back so the <input type="date"> always gets YYYY-MM-DD.
  const [harvestDate, setHarvestDate] = useState(editData?.harvest_date ? editData.harvest_date.slice(0, 10) : '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [existingImageUrl, setExistingImageUrl] = useState(editData?.image_url ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)
  const [published, setPublished] = useState(false)
  const [publishedSlug, setPublishedSlug] = useState('')
  const [saved, setSaved] = useState(false)
  // Suggested price range the zone moderator set for this crop (MOD-8.4).
  const [priceHint, setPriceHint] = useState<{ min_price: number | null; max_price: number | null; unit: string } | null>(null)

  // When the produce name settles, ask the moderator's price guideline for the
  // zone. Debounced so typing "Tomato" doesn't fire seven requests. Guidance
  // only — it never blocks what the farmer can enter.
  useEffect(() => {
    const crop = name.trim()
    if (!crop || !farmerRegion) { setPriceHint(null); return }
    let cancelled = false
    const t = setTimeout(() => {
      fetch(`/api/prices?crop=${encodeURIComponent(crop)}&region=${encodeURIComponent(farmerRegion)}`)
        .then((r) => r.json())
        .then((j) => { if (!cancelled) setPriceHint(j?.price ?? null) })
        .catch(() => { if (!cancelled) setPriceHint(null) })
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [name, farmerRegion])

  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError(tx.pickImageFile)
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError(tx.imageTooLarge)
      return
    }
    setError('')
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    const compressed = await compressImage(file)
    setImageFile(compressed)
    setImagePreview(URL.createObjectURL(compressed))
  }

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview('')
    setExistingImageUrl('')
  }

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${farmerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('farm-images')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (upErr) {
      setError(`Image upload failed: ${upErr.message}`)
      return null
    }
    const { data } = supabase.storage.from('farm-images').getPublicUrl(path)
    return data.publicUrl
  }

  const previewData: PreviewData = {
    name: name || 'Produce name',
    variety: variety || '',
    emoji,
    price: price1 || '—',
    method: farmingMethod,
    stock: qty || '—',
  }

  const handlePublish = async () => {
    if (!name.trim()) { setError(tx.produceNameRequired); return }
    const price1Num = Number(price1)
    if (!price1 || !Number.isFinite(price1Num) || price1Num <= 0) {
      setError(tx.priceRequired)
      return
    }
    setLoading(true)
    setError('')

    let imageUrl: string | null = null
    if (imageFile) {
      imageUrl = await uploadImage(imageFile)
      if (!imageUrl) { setLoading(false); return }
    } else if (existingImageUrl) {
      imageUrl = existingImageUrl
    }

    if (isEdit && editData) {
      // Edit mode: always send all fields so clearing a value actually clears it in DB
      const editPayload: Record<string, unknown> = {
        name: name.trim(),
        emoji,
        method: farmingMethod,
        unit,
        variety: variety.trim() || null,
        stock_qty: qty ? Number(qty) : null,
        description: description.trim() || null,
        brix: brix ? Number(brix) : null,
        soil_organic_carbon: soc ? Number(soc) : null,
        price_tier_1_price: price1 ? Number(price1) : null,
        price_tier_1_qty: price1 ? Number(price1Qty) : null,
        price_tier_2_price: price2 ? Number(price2) : null,
        price_tier_2_qty: price2 ? Number(price2Qty) : null,
        price_tier_3_price: price3 ? Number(price3) : null,
        price_tier_3_qty: price3 ? Number(Number(price2Qty) + 1) : null,
        image_url: imageUrl,
        harvest_date: harvestDate || null,
        availability_period: period.trim() || null,
        delivery_mode: deliveryMode,
        delivery_charge: deliveryMode === 'pickup' ? null : (deliveryCharge ? Number(deliveryCharge) : null),
        delivery_radius_km: deliveryMode === 'pickup' ? null : (deliveryRadius ? Number(deliveryRadius) : null),
      }

      let res: Response
      try {
        res = await fetch('/api/farmer/update-listing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ listingId: editData.id, payload: editPayload }),
        })
      } catch {
        setLoading(false)
        setError('Network error — is the server running?')
        return
      }
      const json = await res.json().catch(() => ({}))
      setLoading(false)
      if (!res.ok) { setError(json.error ?? 'Could not save changes'); return }
      // The server may have refreshed the sold-out flag based on the new
      // quantity (e.g. raising stock above 0 clears a stuck "Sold out").
      // Merge its resolved status so the card updates immediately.
      const resolved: Partial<ListingRow> = {
        ...editPayload,
        ...(json.status ? { status: json.status } : {}),
      }
      setSaved(true)
      setTimeout(() => onPublished(resolved), 1200)
      return
    }

    // Insert mode: only include fields that have values
    const payload: Record<string, unknown> = {
      name: name.trim(),
      emoji,
      method: farmingMethod,
      unit,
    }
    if (variety.trim()) payload.variety = variety.trim()
    if (qty) payload.stock_qty = Number(qty)
    if (description.trim()) payload.description = description.trim()
    else payload.description = null
    if (brix) payload.brix = Number(brix)
    if (soc) payload.soil_organic_carbon = Number(soc)
    if (price1) { payload.price_tier_1_price = Number(price1); payload.price_tier_1_qty = Number(price1Qty) }
    if (price2) { payload.price_tier_2_price = Number(price2); payload.price_tier_2_qty = Number(price2Qty) }
    if (price3) { payload.price_tier_3_price = Number(price3); payload.price_tier_3_qty = Number(price2Qty) + 1 }
    payload.image_url = imageUrl
    payload.harvest_date = harvestDate || null
    payload.availability_period = period.trim() || null
    payload.delivery_mode = deliveryMode
    if (deliveryMode !== 'pickup') {
      if (deliveryCharge) payload.delivery_charge = Number(deliveryCharge)
      if (deliveryRadius) payload.delivery_radius_km = Number(deliveryRadius)
    }

    const insertPayload = { ...payload, farmer_id: farmerId, status: 'available' }
    const { error: err } = await supabase.from('produce_listings').insert(insertPayload)
    setLoading(false)

    if (err) { setError(err.message); return }

    setPublished(true)
    setPublishedSlug(farmerSlug)
    setTimeout(() => onPublished(), 2500)
  }

  if (published) {
    return (
      <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-6 text-center space-y-3">
        <div className="text-4xl">✅</div>
        <p className="font-extrabold text-green-800 text-lg">{tx.publishedTitle}</p>
        <p className="text-green-700 text-sm">{tx.listingLive}</p>
        <Link
          href={`/farmer/${publishedSlug}`}
          className="inline-block bg-green-700 text-white font-bold px-6 py-3 rounded-xl text-sm"
        >
          {tx.viewYourProfile} ↗
        </Link>
      </div>
    )
  }

  if (saved && isEdit) {
    return (
      <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-6 text-center space-y-3">
        <div className="text-4xl">✅</div>
        <p className="font-extrabold text-green-800 text-lg">{tx.savedTitle}</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Form header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="font-extrabold text-gray-900 text-base">
          {isEdit ? tx.editProduceListing : tx.newProduceListing}
        </h3>
        <button onClick={onClose} className="text-gray-400 text-2xl leading-none p-1">×</button>
      </div>

      <div className="p-4 space-y-5">
        {/* Emoji picker */}
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">{tx.pickIcon}</p>
          <div className="flex flex-wrap gap-2">
            {EMOJI_OPTIONS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                  emoji === e ? 'bg-green-100 ring-2 ring-green-500' : 'bg-gray-50'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5">
            📦 = Other / ఇతర — pick this for any produce without its own icon
          </p>
        </div>

        {/* Unit selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Unit / కొలత
          </label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-green-500 focus:outline-none"
          >
            {UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Name + variety */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {tx.produceDetails}
          </label>
          <input
            type="text"
            placeholder={tx.produceNamePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder={tx.varietyPlaceholder}
            value={variety}
            onChange={(e) => setVariety(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
          />
        </div>

        {/* Qty + harvest date */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {tx.availability}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              placeholder={`Quantity (${unit})`}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder={tx.periodPlaceholder}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
            />
          </div>
          <div>
            <p className="text-[11px] text-gray-500 mb-1">
              Harvest date (actual or expected) / కోత తేదీ (అసలు లేదా అంచనా)
            </p>
            {/* No max — farmers can list produce before harvest with an
                expected date, so today AND future dates are allowed. */}
            <input
              type="date"
              value={harvestDate}
              onChange={(e) => setHarvestDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Farming method */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {tx.farmingMethodLabel}
          </label>
          <select
            value={farmingMethod}
            onChange={(e) => setFarmingMethod(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-green-500 focus:outline-none"
          >
            <option value="natural">{tx.methodNatural}</option>
            <option value="organic">{tx.methodOrganic}</option>
            <option value="low_chemical">{tx.methodLowChemical}</option>
            <option value="chemical">{tx.methodChemical}</option>
          </select>
        </div>

        {/* Delivery method — pickup only, farmer courier, or both (#11) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {tx.deliveryMethod}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: 'pickup', label: 'Pickup only', te: 'పికప్ మాత్రమే', icon: '🧺' },
              { key: 'courier', label: 'I will courier', te: 'నేను డెలివరీ చేస్తా', icon: '🛵' },
              { key: 'both', label: 'Both', te: 'రెండూ', icon: '🔁' },
            ] as const).map((opt) => {
              const active = deliveryMode === opt.key
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setDeliveryMode(opt.key)}
                  className={`rounded-xl px-2 py-3 text-center border-2 transition-colors ${
                    active ? 'border-green-600 bg-green-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <span className="block text-lg leading-none">{opt.icon}</span>
                  <span className={`block text-[11px] font-bold mt-1 leading-tight ${active ? 'text-green-800' : 'text-gray-600'}`}>
                    {opt.label}
                  </span>
                  <span className={`block text-[10px] leading-tight ${active ? 'text-green-700' : 'text-gray-400'}`}>
                    {opt.te}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Courier details — only when the farmer offers delivery. */}
          {deliveryMode !== 'pickup' && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Delivery charge / డెలివరీ ఛార్జ్"
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div className="relative">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Radius / పరిధి"
                  value={deliveryRadius}
                  onChange={(e) => setDeliveryRadius(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl pl-3 pr-9 py-2.5 text-sm focus:border-green-500 focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">km</span>
              </div>
            </div>
          )}
        </div>

        {/* Pricing tiers */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {tx.pricingTiers}
          </label>
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-500 w-14 flex-shrink-0">Tier 1</span>
              <input
                type="number"
                placeholder={`Up to ${price1Qty}`}
                value={price1Qty}
                onChange={(e) => setPrice1Qty(e.target.value)}
                className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm"
              />
              <span className="text-xs text-gray-400">{unit} →</span>
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                <input
                  type="number"
                  placeholder={`Price/${unit}`}
                  value={price1}
                  onChange={(e) => setPrice1(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-500 w-14 flex-shrink-0">Tier 2</span>
              <input
                type="number"
                placeholder={`Up to`}
                value={price2Qty}
                onChange={(e) => setPrice2Qty(e.target.value)}
                className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm"
              />
              <span className="text-xs text-gray-400">{unit} →</span>
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                <input
                  type="number"
                  placeholder={`Price/${unit}`}
                  value={price2}
                  onChange={(e) => setPrice2(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-500 w-14 flex-shrink-0">Tier 3</span>
              <span className="text-xs text-gray-400 w-20 text-center">{Number(price2Qty) + 1}+ {unit}</span>
              <span className="text-xs text-gray-400">→</span>
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                <input
                  type="number"
                  placeholder={`Price/${unit}`}
                  value={price3}
                  onChange={(e) => setPrice3(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
          {priceHint && (priceHint.min_price != null || priceHint.max_price != null) && (
            <p className="text-[11px] text-green-700 bg-green-50 rounded-lg px-3 py-1.5">
              💡 Suggested for {name.trim()}:{' '}
              {priceHint.min_price != null && priceHint.max_price != null
                ? `₹${priceHint.min_price}–₹${priceHint.max_price}`
                : priceHint.min_price != null
                  ? `₹${priceHint.min_price}+`
                  : `up to ₹${priceHint.max_price}`}
              /{priceHint.unit}
            </p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {tx.description}
          </label>
          <textarea
            placeholder={tx.descriptionPlaceholder}
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:border-green-500 focus:outline-none"
          />
          <p className="text-right text-xs text-gray-400">{description.length}/500</p>
        </div>

        {/* Produce photo */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {tx.photoOptional}
          </label>
          {(imagePreview || existingImageUrl) ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview || existingImageUrl}
                alt="Preview"
                className="w-full max-h-64 object-cover rounded-xl border border-gray-200 bg-gray-50"
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute top-2 right-2 bg-white/90 text-gray-700 rounded-full w-8 h-8 flex items-center justify-center text-base font-bold shadow"
                aria-label="Remove photo"
              >
                ×
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-green-300 rounded-xl py-4 px-3 text-green-700 text-sm font-bold cursor-pointer active:bg-green-50">
                <span className="text-lg leading-none">📷</span>
                {tx.takePhoto}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePickImage}
                  className="hidden"
                />
              </label>
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-green-300 rounded-xl py-4 px-3 text-green-700 text-sm font-bold cursor-pointer active:bg-green-50">
                <span className="text-lg leading-none">🖼</span>
                {tx.fromGallery}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePickImage}
                  className="hidden"
                />
              </label>
            </div>
          )}
          <p className="text-[11px] text-gray-500">
            {tx.buyersSeeCard}
          </p>
        </div>

        {/* Quality params */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {tx.qualityParams}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-gray-500 mb-1">BRIX reading</p>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 8.5"
                value={brix}
                onChange={(e) => setBrix(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Soil Organic Carbon %</p>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 2.1"
                value={soc}
                onChange={(e) => setSoc(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>
        )}

        {/* Preview + Publish buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => setPreview(true)}
            className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-3.5 rounded-xl text-sm"
          >
            {tx.preview}
          </button>
          <button
            onClick={handlePublish}
            disabled={loading || !name.trim()}
            className="flex-1 bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50"
          >
            {loading ? (isEdit ? tx.saving : tx.publishing) : (isEdit ? tx.saveChanges : tx.publish)}
          </button>
        </div>
      </div>

      {/* Preview modal */}
      {preview && (
        <PreviewModal data={previewData} onClose={() => setPreview(false)} />
      )}
    </div>
  )
}

/* ─── Preview modal ─────────────────────────────────────────── */
function PreviewModal({ data, onClose }: { data: PreviewData; onClose: () => void }) {
  const { tx } = useLang()
  const EMOJI_BG: Record<string, string> = {
    '🍅': 'bg-red-100', '🥬': 'bg-green-100', '🥭': 'bg-orange-100',
    '🍆': 'bg-purple-100', '🥕': 'bg-orange-100', '🌽': 'bg-yellow-100',
    '🍌': 'bg-yellow-100', '🫑': 'bg-green-100', '🌿': 'bg-green-50',
    '🌾': 'bg-amber-100', '🍓': 'bg-red-50',
  }
  const bg = EMOJI_BG[data.emoji] ?? 'bg-green-50'

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-end justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="font-bold text-gray-800 text-sm">
            {tx.previewHeading}
          </p>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        <div className="p-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden max-w-[180px] mx-auto">
            <div className={`${bg} flex items-center justify-center py-8`}>
              <span className="text-5xl">{data.emoji}</span>
            </div>
            <div className="p-3">
              <h3 className="font-extrabold text-gray-900 text-base">{data.name}</h3>
              {data.variety && <p className="text-xs text-gray-400 mt-0.5">{data.variety}</p>}
              <div className="flex items-center justify-between mt-2">
                <span className="text-green-700 font-black text-lg">
                  {data.price !== '—' ? `₹${data.price}` : '—'}
                  <span className="text-xs font-normal text-gray-400">/kg</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                  {data.method}
                </span>
              </div>
              {data.stock !== '—' && (
                <p className="text-xs text-gray-400 mt-1">{data.stock} kg left</p>
              )}
              <div className="mt-2 w-full bg-green-700 text-white text-xs font-bold py-2.5 rounded-xl text-center">
                {tx.previewOrderBtn}
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center mt-3">
            {tx.previewFooter}
          </p>
        </div>
        <div className="px-4 pb-4">
          <button
            onClick={onClose}
            className="w-full border-2 border-gray-300 text-gray-700 font-semibold py-3 rounded-xl text-sm"
          >
            {tx.close}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Manage listings modal ────────────────────────────────── */
function ManageListingsModal({
  farmerId,
  farmerSlug = '',
  farmerRegion = '',
  defaultMethod,
  onClose,
  onChanged,
}: {
  farmerId: string
  farmerSlug?: string
  farmerRegion?: string
  defaultMethod: string
  onClose: () => void
  onChanged: () => void
}) {
  const { tx } = useLang()
  const [rows, setRows] = useState<ListingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [editingRow, setEditingRow] = useState<ListingRow | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('produce_listings')
      .select('id, name, variety, emoji, status, method, stock_qty, price_tier_1_price, price_tier_1_qty, price_tier_2_price, price_tier_2_qty, price_tier_3_price, description, image_url, brix, soil_organic_carbon, unit, harvest_date, availability_period, delivery_mode, delivery_charge, delivery_radius_km, created_at')
      .eq('farmer_id', farmerId)
      .order('created_at', { ascending: false })
    setLoading(false)
    if (err) { setError(err.message); return }
    setRows((data ?? []) as ListingRow[])
  }, [farmerId])

  useEffect(() => { load() }, [load])

  // Pause hides a listing from consumers without deleting it; Resume brings it
  // back. Unlike Delete this is fully reversible. We flip the status between
  // 'paused' and 'available' — consumer queries only ever show 'available'.
  const handleTogglePause = async (row: ListingRow) => {
    const next = row.status === 'paused' ? 'available' : 'paused'
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: next } : r)))
    setError('')
    const { error: err } = await supabase
      .from('produce_listings')
      .update({ status: next })
      .eq('id', row.id)
    if (err) { setError(err.message); load() } else { onChanged() }
  }

  // Suspend is a second, independent reversible take-down (status
  // 'suspended_by_farmer'), distinct from Pause and from a moderator suspension.
  // Like Pause it hides the listing from buyers; Resume returns it to available.
  const handleToggleSuspend = async (row: ListingRow) => {
    const next = row.status === 'suspended_by_farmer' ? 'available' : 'suspended_by_farmer'
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: next } : r)))
    setError('')
    const { error: err } = await supabase
      .from('produce_listings')
      .update({ status: next })
      .eq('id', row.id)
    if (err) { setError(err.message); load() } else { onChanged() }
  }

  const handleDelete = async (row: ListingRow) => {
    if (!confirm(tx.confirmDelete.replace('{name}', row.name))) return

    setDeletingId(row.id)
    setError('')
    const { data, error: err } = await supabase
      .from('produce_listings')
      .delete()
      .eq('id', row.id)
      .select('id')
    setDeletingId(null)

    if (err) {
      setError(err.message)
      return
    }
    if (!data || data.length === 0) {
      setError(tx.deleteBlocked)
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    onChanged()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <h3 className="font-extrabold text-gray-900 text-base leading-tight">
              {tx.yourProduce}
            </h3>
            <p className="text-xs text-gray-500">{tx.manageOrDelete}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-3xl leading-none p-1">×</button>
        </div>

        <div className="p-4 space-y-3">
          {/* Add produce from inside the popup too (second entry point
              besides the dashboard button). */}
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 active:bg-green-800"
          >
            <span className="text-lg leading-none">+</span>
            Add New Produce / కొత్త పంట చేర్చండి
          </button>

          {loading && (
            <div className="text-center py-10">
              <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-gray-500 text-sm mt-3">{tx.loadingLabel}</p>
            </div>
          )}

          {!loading && error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          {!loading && rows.length === 0 && !error && (
            <div className="text-center py-10">
              <div className="text-5xl mb-2">🌾</div>
              <p className="font-semibold text-gray-700 text-sm">{tx.noProduceYet}</p>
            </div>
          )}

          {!loading && rows.map((row) => (
            <ListingRowCard
              key={row.id}
              row={row}
              deleting={deletingId === row.id}
              onDelete={() => handleDelete(row)}
              onEdit={() => setEditingRow(row)}
              onTogglePause={() => handleTogglePause(row)}
              onToggleSuspend={() => handleToggleSuspend(row)}
            />
          ))}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-3">
          <button
            onClick={onClose}
            className="w-full border-2 border-gray-300 text-gray-700 font-semibold py-3 rounded-xl text-sm"
          >
            {tx.close}
          </button>
        </div>
      </div>

      {/* Edit listing overlay */}
      {editingRow && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <ProduceListingForm
              farmerId={farmerId}
              farmerSlug={farmerSlug}
              farmerRegion={farmerRegion}
              defaultMethod={defaultMethod}
              editData={editingRow}
              onClose={() => setEditingRow(null)}
              onPublished={(saved) => {
                if (saved && editingRow) {
                  setRows((prev) => prev.map((r) => r.id === editingRow.id ? { ...r, ...saved } : r))
                }
                setEditingRow(null)
                load()
                onChanged()
              }}
            />
          </div>
        </div>
      )}

      {/* Add listing overlay — opened by the in-popup "Add New Produce" button */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <ProduceListingForm
              farmerId={farmerId}
              farmerSlug={farmerSlug}
              farmerRegion={farmerRegion}
              defaultMethod={defaultMethod}
              onClose={() => setShowAddForm(false)}
              onPublished={() => {
                setShowAddForm(false)
                load()
                onChanged()
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Today's Schedule (pickups + deliveries on a chosen date) ──── */
type ScheduleOrder = {
  id: string
  buyer_name: string | null
  buyer_phone: string | null
  produce_name: string | null
  quantity: number | null
  unit: string | null
  pickup_location: string | null
  delivery_type: 'self_pickup' | 'home_delivery' | null
  created_at: string
}

function TodayScheduleSection({ farmerId }: { farmerId: string }) {
  const { tx } = useLang()
  const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local
  const [date, setDate] = useState(todayStr)
  const [orders, setOrders] = useState<ScheduleOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('orders')
      .select('id, buyer_name, buyer_phone, produce_name, quantity, unit, pickup_location, delivery_type, created_at')
      .eq('farmer_id', farmerId)
      .eq('status', 'approved')
      .eq('fulfillment_date', date)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        setOrders((data ?? []) as ScheduleOrder[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [farmerId, date])

  const pickups = orders.filter((o) => o.delivery_type !== 'home_delivery')
  const deliveries = orders.filter((o) => o.delivery_type === 'home_delivery')

  const Row = ({ o }: { o: ScheduleOrder }) => (
    <div className="border border-gray-100 rounded-xl px-3 py-2.5 bg-gray-50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{o.produce_name} · {o.quantity} {o.unit || 'kg'}</p>
          <p className="text-xs text-gray-600 truncate">🧑 {o.buyer_name || 'Buyer / కొనుగోలుదారు'}</p>
          {o.pickup_location && <p className="text-[11px] text-gray-500 truncate">📍 {o.pickup_location}</p>}
        </div>
        {o.buyer_phone && (
          <a href={`tel:+91${o.buyer_phone}`} className="text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5 whitespace-nowrap">
            📞 {o.buyer_phone}
          </a>
        )}
      </div>
    </div>
  )

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-gray-100 gap-2">
        <h2 className="font-extrabold text-gray-900 text-base leading-tight">
          📅 {"Today's Schedule / నేటి షెడ్యూల్"}
        </h2>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value || todayStr)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:border-green-500 focus:outline-none"
        />
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-4">{tx.loadingLabel}</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">{"Nothing scheduled for this date / ఈ తేదీకి ఏమీ లేదు"}</p>
        ) : (
          <>
            <div>
              <p className="text-xs font-bold text-green-800 uppercase tracking-wide mb-2">
                🧺 {"Pickups / పికప్‌లు"} ({pickups.length})
              </p>
              {pickups.length === 0 ? (
                <p className="text-xs text-gray-400">{"No pickups / పికప్‌లు లేవు"}</p>
              ) : (
                <div className="space-y-2">{pickups.map((o) => <Row key={o.id} o={o} />)}</div>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2">
                🛵 {"Deliveries / డెలివరీలు"} ({deliveries.length})
              </p>
              {deliveries.length === 0 ? (
                <p className="text-xs text-gray-400">{"No deliveries / డెలివరీలు లేవు"}</p>
              ) : (
                <div className="space-y-2">{deliveries.map((o) => <Row key={o.id} o={o} />)}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ListingRowCard({
  row,
  deleting,
  onDelete,
  onEdit,
  onTogglePause,
  onToggleSuspend,
}: {
  row: ListingRow
  deleting: boolean
  onDelete: () => void
  onEdit: () => void
  onTogglePause: () => void
  onToggleSuspend: () => void
}) {
  const { tx } = useLang()
  const emoji = row.emoji ?? '🌿'
  const isPaused = row.status === 'paused'
  const isSuspended = row.status === 'suspended_by_farmer'
  const statusLabel =
    row.status === 'available'
      ? tx.availableLabel
      : row.status === 'coming_soon'
      ? tx.comingSoon
      : row.status === 'paused'
      ? 'Paused by farmer / రైతు నిలిపివేశారు'
      : row.status === 'suspended_by_farmer'
      ? 'Suspended by you / మీరు నిలిపివేశారు'
      : row.status === 'suspended'
      ? 'Suspended / నిలిపివేయబడింది'
      : row.status === 'sold_out'
      ? 'Sold out / అయిపోయింది'
      : row.status
  const statusColor =
    row.status === 'available'
      ? 'bg-green-100 text-green-800'
      : row.status === 'coming_soon'
      ? 'bg-amber-100 text-amber-800'
      : row.status === 'paused'
      ? 'bg-purple-100 text-purple-800'
      : row.status === 'suspended_by_farmer'
      ? 'bg-red-100 text-red-800'
      : row.status === 'suspended'
      ? 'bg-orange-100 text-orange-800'
      : 'bg-gray-100 text-gray-700'
  // Farmer can pause/resume their own active or sold-out listings (not
  // moderator-suspended or coming-soon ones). Pause and Suspend are mutually
  // exclusive states, so each control hides while the other is active.
  const canPause = row.status === 'available' || row.status === 'sold_out' || row.status === 'paused'
  const canSuspend = row.status === 'available' || row.status === 'sold_out' || row.status === 'suspended_by_farmer'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex gap-3 p-3">
        {row.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.image_url}
            alt={row.name}
            loading="lazy"
            className="rounded-xl w-16 h-16 object-cover flex-shrink-0 bg-gray-100"
          />
        ) : (
          <div className="bg-green-50 rounded-xl w-16 h-16 flex items-center justify-center text-3xl flex-shrink-0">
            {emoji}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="font-bold text-gray-900 text-sm truncate">{row.name}</h4>
              {row.variety && <p className="text-xs text-gray-500 truncate">{row.variety}</p>}
            </div>
            <span className={`${statusColor} text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap`}>
              {statusLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-600 flex-wrap">
            {row.price_tier_1_price != null && (
              <span className="font-bold text-green-700 text-sm">
                ₹{row.price_tier_1_price}
                <span className="text-gray-400 font-normal text-xs">/{row.unit || 'kg'}</span>
              </span>
            )}
            {row.stock_qty != null && (
              <span className="font-semibold text-gray-700">{row.stock_qty} {row.unit || tx.kgLabel}</span>
            )}
            {row.method && (
              <span className="bg-green-50 text-green-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                {row.method}
              </span>
            )}
            {row.harvest_date && (
              <FreshnessBadge harvestDate={row.harvest_date} />
            )}
          </div>
        </div>
      </div>

      <div className="px-3 pb-3 space-y-2">
        {/* Pause / Suspend — two independent reversible hide-from-buyers
            controls, both distinct from Delete. Only the relevant one shows
            once a listing is already paused or suspended. */}
        {(canPause || canSuspend) && (
          <div className="flex gap-2">
            {canPause && (
              <button
                onClick={onTogglePause}
                className={`flex-1 font-bold py-2.5 rounded-xl text-sm border ${
                  isPaused
                    ? 'border-green-600 text-green-700 active:bg-green-50'
                    : 'border-purple-300 text-purple-700 active:bg-purple-50'
                }`}
              >
                {isPaused ? '▶ Resume / తిరిగి చూపించు' : '⏸ Pause / అమ్మకం ఆపండి'}
              </button>
            )}
            {canSuspend && (
              <button
                onClick={onToggleSuspend}
                className={`flex-1 font-bold py-2.5 rounded-xl text-sm border ${
                  isSuspended
                    ? 'border-green-600 text-green-700 active:bg-green-50'
                    : 'border-red-300 text-red-600 active:bg-red-50'
                }`}
              >
                {isSuspended ? '▶ Resume / తిరిగి చూపించు' : '⛔ Suspend / నిలిపివేయి'}
              </button>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="flex-1 border border-blue-200 text-blue-700 font-bold py-2.5 rounded-xl text-sm active:bg-blue-50"
          >
            ✏️ {tx.editListing}
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="flex-1 border border-red-200 text-red-600 font-bold py-2.5 rounded-xl text-sm active:bg-red-50 disabled:opacity-50"
          >
            {deleting ? tx.deleting : `🗑 ${tx.deleteProduce}`}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Order card ─────────────────────────────────────────────── */
function OrderCard({
  order,
  processing,
  processingPaid,
  onApprove,
  onDecline,
  onMarkPaid,
  onUpdatePaymentStatus,
  onSetFulfillmentDate,
  onMarkPickedUp,
  onMarkShipped,
}: {
  order: Order
  processing: boolean
  processingPaid: boolean
  onApprove: (date: string) => void
  onDecline: () => void
  onMarkPaid: () => void
  onUpdatePaymentStatus: (status: 'completed' | 'failed' | 'pending') => void
  onSetFulfillmentDate: (date: string) => void
  onMarkPickedUp: () => void
  onMarkShipped: () => void
}) {
  const { tx } = useLang()
  const isDelivery = order.delivery_type === 'home_delivery'
  const isCourier = order.delivery_type === 'courier'
  const isPickup = !isDelivery && !isCourier
  const isShipped = !!order.shipped_at
  const isApproved = order.status === 'approved'
  const fulfillmentDate = order.fulfillment_date ?? ''
  // Local (not UTC) "today" so the picker still allows today's date in IST
  // evenings. Used as the minimum selectable pickup/delivery date. Computed
  // once on mount via the lazy initializer.
  const [todayStr] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  const isCod = !order.payment_method || order.payment_method === 'cod'
  const isUpi = order.payment_method === 'upi'
  const isPaid = order.payment_status === 'completed'
  const isPaymentClaimed = order.payment_status === 'payment_claimed' || order.payment_status === 'pending_confirmation'

  return (
    <div className={`border rounded-2xl overflow-hidden ${isApproved ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}>
      <div className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-extrabold text-gray-900 text-sm leading-tight">
                {order.buyer_name || '—'}
              </p>
              {isApproved && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800 whitespace-nowrap">
                  {tx.statusApproved}
                </span>
              )}
            </div>
            {order.buyer_phone && (
              <a href={`tel:+91${order.buyer_phone}`} className="text-xs font-semibold text-green-700">
                📞 +91 {order.buyer_phone}
              </a>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
            {isCod && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                isPaid ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {isPaid ? `✓ ${tx.paymentReceived}` : tx.codBadge}
              </span>
            )}
            {isUpi && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                isPaid ? 'bg-green-100 text-green-800'
                : isPaymentClaimed ? 'bg-orange-100 text-orange-800'
                : 'bg-blue-100 text-blue-700'
              }`}>
                {isPaid ? '✓ UPI Paid' : isPaymentClaimed ? '⏳ Buyer Paid — Verify' : '📲 UPI'}
              </span>
            )}
            <span className="text-[11px] text-gray-400 whitespace-nowrap">
              {timeAgo(order.created_at)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="font-semibold text-gray-800">{order.produce_name || '—'}</span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-600">{order.quantity} {order.unit || 'kg'}</span>
          {order.total_price != null && order.total_price > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span className="font-bold text-green-700">₹{order.total_price}</span>
            </>
          )}
        </div>

        {order.pickup_location && (
          <p className="text-xs text-gray-500">📍 {order.pickup_location}</p>
        )}

        {order.delivery_type === 'home_delivery' && (
          <DeliveryTagForFarmer order={order} />
        )}

        {/* Pickup / delivery date. For a pending order this is the gate to
            approval — the farmer chooses a date, then confirms below. For an
            approved order it shows the scheduled date and can still be changed.
            Either way the buyer sees it on their order page. */}
        <div className="pt-1">
          <label className="text-[11px] font-bold text-gray-600 block mb-1">
            📅 {isPickup ? tx.pickupDateLabel : tx.deliveryDateLabel}
          </label>
          <input
            type="date"
            value={fulfillmentDate}
            min={todayStr}
            onChange={(e) => onSetFulfillmentDate(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-green-500 focus:outline-none"
          />
          {isApproved && fulfillmentDate && !(isCourier && isShipped) && (
            <p className="text-[11px] font-semibold text-green-700 mt-1">
              ⏳ {isPickup ? tx.awaitingPickup : tx.awaitingDelivery}
            </p>
          )}
        </div>
      </div>

      {isUpi && isPaymentClaimed && (
        <div className="mx-3 mb-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-3 space-y-2.5">
          <div>
            <p className="text-xs font-bold text-orange-800">
              📲 Buyer says they paid via UPI
            </p>
            <p className="text-[11px] text-orange-700 mt-0.5">
              Open your UPI app and confirm you received ₹{order.total_price ?? '?'} from {order.buyer_name || 'buyer'}.
            </p>
            {order.utr_number && (
              <p className="text-[11px] text-orange-700 mt-0.5">
                UTR: <span className="font-mono font-semibold">{order.utr_number}</span>
              </p>
            )}
          </div>
          <p className="text-xs font-bold text-gray-700">
            Update Payment Status / చెల్లింపు స్థితి నవీకరించండి
          </p>
          <p className="text-[11px] text-gray-500 -mt-1">{tx.receivedApprovesOrderHint}</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onUpdatePaymentStatus('completed')}
              disabled={processingPaid}
              className="bg-green-700 text-white font-bold py-2.5 rounded-xl text-[11px] leading-tight disabled:opacity-50 active:bg-green-800 px-1"
            >
              ✓ Received<br />& Approve<br /><span className="font-normal">అందింది & ఆమోదం</span>
            </button>
            <button
              onClick={() => onUpdatePaymentStatus('failed')}
              disabled={processingPaid}
              className="border-2 border-red-300 text-red-600 font-bold py-2.5 rounded-xl text-xs disabled:opacity-50 active:bg-red-50"
            >
              ✕ Not Received<br /><span className="font-normal">రాలేదు</span>
            </button>
            <button
              onClick={() => onUpdatePaymentStatus('pending')}
              disabled={processingPaid}
              className="border-2 border-amber-300 text-amber-700 font-bold py-2.5 rounded-xl text-xs disabled:opacity-50 active:bg-amber-50"
            >
              ⏳ Pending<br /><span className="font-normal">పెండింగ్</span>
            </button>
          </div>
        </div>
      )}

      <div className="px-3 pb-3 space-y-2">
        {!isApproved ? (
          <>
            {/* Pending: confirming the chosen pickup/delivery date approves the
                order. The confirm button stays disabled until a date is set. */}
            <div className={`grid gap-2 ${isUpi && isPaymentClaimed ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {!(isUpi && isPaymentClaimed) && (
                <button
                  onClick={() => onApprove(fulfillmentDate)}
                  disabled={processing || !fulfillmentDate}
                  className="bg-green-600 text-white font-bold py-3 rounded-xl text-sm active:bg-green-700 disabled:opacity-50"
                >
                  {processing ? tx.approving : (isPickup ? tx.confirmPickupDate : tx.confirmDeliveryDate)}
                </button>
              )}
              <button
                onClick={onDecline}
                disabled={processing}
                className="border-2 border-red-300 text-red-600 font-bold py-3 rounded-xl text-sm active:bg-red-50 disabled:opacity-50"
              >
                {processing ? tx.declining : `✕ ${tx.decline}`}
              </button>
            </div>
            {!fulfillmentDate && !(isUpi && isPaymentClaimed) && (
              <p className="text-[11px] text-gray-500 text-center">{tx.chooseDateToApprove}</p>
            )}
          </>
        ) : isPickup ? (
          // Approved self-pickup: one tap to mark collected once the buyer comes.
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onMarkPickedUp}
              disabled={processing}
              className="bg-green-600 text-white font-bold py-2.5 rounded-xl text-sm active:bg-green-700 disabled:opacity-50"
            >
              {processing ? '…' : '✓ Picked Up / తీసుకువెళ్ళారు'}
            </button>
            <button
              onClick={onDecline}
              disabled={processing}
              className="border-2 border-red-300 text-red-600 font-bold py-2.5 rounded-xl text-sm active:bg-red-50 disabled:opacity-50"
            >
              {processing ? tx.declining : `✕ ${tx.decline}`}
            </button>
          </div>
        ) : isCourier ? (
          // Approved courier: farmer marks Shipped, then waits for the buyer to
          // confirm receipt (which finally resolves the order).
          isShipped ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-center">
              <p className="text-xs font-bold text-amber-800">📦 Shipped / షిప్ చేయబడింది</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Awaiting buyer&apos;s receipt confirmation / అందుకున్నట్టు ధృవీకరణ కోసం వేచి ఉంది
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onMarkShipped}
                disabled={processing}
                className="bg-amber-600 text-white font-bold py-2.5 rounded-xl text-sm active:bg-amber-700 disabled:opacity-50"
              >
                {processing ? '…' : '📦 Shipped / షిప్ చేయబడింది'}
              </button>
              <button
                onClick={onDecline}
                disabled={processing}
                className="border-2 border-red-300 text-red-600 font-bold py-2.5 rounded-xl text-sm active:bg-red-50 disabled:opacity-50"
              >
                {processing ? tx.declining : `✕ ${tx.decline}`}
              </button>
            </div>
          )
        ) : (
          // Approved home-delivery (rider flow): the farmer can still cancel;
          // the rider closes it out at the door.
          <button
            onClick={onDecline}
            disabled={processing}
            className="w-full border-2 border-red-300 text-red-600 font-bold py-2.5 rounded-xl text-sm active:bg-red-50 disabled:opacity-50"
          >
            {processing ? tx.declining : `✕ ${tx.decline}`}
          </button>
        )}
        {isCod && !isPaid && (
          <button
            onClick={onMarkPaid}
            disabled={processingPaid}
            className="w-full bg-amber-500 text-white font-bold py-3 rounded-xl text-sm active:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            💵 {processingPaid ? tx.markingPaid : tx.markPaid}
          </button>
        )}
      </div>
    </div>
  )
}

export { FreshnessBadge } from '@/components/FreshnessBadge'

/* ─── Dashboard "Your produce" section ───────────────────────── */
function DashboardProduceSection({
  listings,
  onManage,
  onToggleSuspend,
}: {
  listings: DashboardListing[]
  onManage: () => void
  onToggleSuspend: (id: string, currentStatus: string) => void
}) {
  // Status chips mirror the Manage Listings card so the two stay consistent.
  const chip = (status: string): { label: string; color: string } => {
    switch (status) {
      case 'available': return { label: 'Live / అందుబాటులో', color: 'bg-green-100 text-green-800' }
      case 'paused': return { label: 'Paused / నిలిపివేశారు', color: 'bg-purple-100 text-purple-800' }
      case 'suspended_by_farmer': return { label: 'Suspended / నిలిపివేశారు', color: 'bg-red-100 text-red-800' }
      case 'suspended': return { label: 'Suspended by team', color: 'bg-orange-100 text-orange-800' }
      case 'sold_out': return { label: 'Sold out / అయిపోయింది', color: 'bg-gray-100 text-gray-700' }
      case 'coming_soon': return { label: 'Coming soon', color: 'bg-amber-100 text-amber-800' }
      default: return { label: status, color: 'bg-gray-100 text-gray-700' }
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-gray-100">
        <div>
          <h2 className="font-extrabold text-gray-900 text-base leading-tight">
            Your produce / మీ పంట
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Suspend or resume any item</p>
        </div>
        <button onClick={onManage} className="text-xs font-bold text-green-700">
          Manage →
        </button>
      </div>

      {listings.length === 0 ? (
        <div className="text-center py-8 px-4">
          <div className="text-4xl mb-2">🌾</div>
          <p className="font-semibold text-gray-500 text-sm">No produce listed yet</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {listings.map((l) => {
            const isSuspended = l.status === 'suspended_by_farmer'
            // Only the dashboard's own suspend/resume states are togglable here;
            // pause / moderator-suspend / coming-soon are handled in Manage.
            const canToggle = l.status === 'available' || l.status === 'sold_out' || isSuspended
            const c = chip(l.status)
            return (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center text-xl flex-shrink-0">
                  {l.emoji ?? '🌿'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-900 text-sm truncate">{l.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {l.price_tier_1_price != null && (
                      <span className="text-xs font-bold text-green-700">
                        ₹{l.price_tier_1_price}
                        <span className="text-gray-400 font-normal">/{l.unit || 'kg'}</span>
                      </span>
                    )}
                    <span className={`${c.color} text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap`}>
                      {c.label}
                    </span>
                  </div>
                </div>
                {canToggle ? (
                  <button
                    onClick={() => onToggleSuspend(l.id, l.status)}
                    className={`font-bold py-2 px-3 rounded-lg text-xs border flex-shrink-0 ${
                      isSuspended
                        ? 'border-green-600 text-green-700 active:bg-green-50'
                        : 'border-red-300 text-red-600 active:bg-red-50'
                    }`}
                  >
                    {isSuspended ? '▶ Resume' : '⛔ Suspend'}
                  </button>
                ) : (
                  <button onClick={onManage} className="text-xs font-semibold text-gray-400 px-2 flex-shrink-0">
                    Manage
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Earnings summary card ──────────────────────────────────── */
function EarningsCard({
  revenue,
  orderCount,
  weekly,
}: {
  revenue: number
  orderCount: number
  weekly: number[]
}) {
  const { tx } = useLang()
  const maxWeek = Math.max(...weekly, 1)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <h2 className="font-extrabold text-gray-900 text-base leading-tight">
        {tx.earningsTitle}
      </h2>

      {revenue === 0 ? (
        <p className="text-gray-400 text-sm mt-3">{tx.earningsNoData}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-green-800">
              {tx.earningsRevenue.replace('{amount}', String(revenue))}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {tx.earningsOrders.replace('{n}', String(orderCount))}
          </p>

          {/* 4-week bar chart */}
          <div className="flex items-end gap-2 mt-4 h-14">
            {weekly.map((amt, i) => {
              const pct = Math.round((amt / maxWeek) * 100)
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-gray-100 rounded-t-md relative" style={{ height: '40px' }}>
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-green-600 rounded-t-md transition-all"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">
                    {tx.weekLabel.replace('{n}', String(i + 1))}
                  </span>
                  {amt > 0 && (
                    <span className="text-[9px] font-bold text-green-700">₹{amt}</span>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Farm photos section ───────────────────────────────────── */
type MediaRow = { id: string; url: string; caption?: string }

function FarmPhotosSection({ farmerId }: { farmerId: string }) {
  const [photos, setPhotos] = useState<MediaRow[]>([])
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('media')
      .select('id, url, caption')
      .eq('farmer_id', farmerId)
      .eq('type', 'photo')
      .order('sort_order', { ascending: true })
      .then(({ data }) => setPhotos((data ?? []) as MediaRow[]))
  }, [farmerId])

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Please pick an image file.'); return }
    if (file.size > 8 * 1024 * 1024) { setError('Image must be under 8 MB.'); return }
    setError('')
    setUploading(true)

    const compressed = await compressImage(file)
    const path = `${farmerId}/gallery/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`
    const { error: upErr } = await supabase.storage
      .from('farm-images')
      .upload(path, compressed, { contentType: 'image/jpeg', upsert: false })

    if (upErr) { setError(`Upload failed: ${upErr.message}`); setUploading(false); return }

    const { data: urlData } = supabase.storage.from('farm-images').getPublicUrl(path)
    const { data: inserted } = await supabase
      .from('media')
      .insert({ farmer_id: farmerId, type: 'photo', url: urlData.publicUrl, sort_order: photos.length })
      .select('id, url, caption')
      .single()

    if (inserted) setPhotos((prev) => [...prev, inserted as MediaRow])
    setUploading(false)
  }

  const handleDelete = async (photo: MediaRow) => {
    if (!confirm('Remove this photo?')) return
    setDeletingId(photo.id)
    await supabase.from('media').delete().eq('id', photo.id)
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
    setDeletingId(null)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-extrabold text-gray-900 text-base leading-tight">Farm Photos</h2>
          <p className="text-xs text-gray-500 mt-0.5">Visible on your public profile</p>
        </div>
        <label className={`flex items-center gap-1.5 bg-green-700 text-white text-xs font-bold px-3 py-2 rounded-xl cursor-pointer active:bg-green-800 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          {uploading ? (
            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>+</span>
          )}
          {uploading ? 'Uploading…' : 'Add Photo'}
          <input type="file" accept="image/*" onChange={handlePick} className="hidden" />
        </label>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</p>
      )}

      {photos.length === 0 && !uploading ? (
        <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-3xl mb-2">📷</p>
          <p className="text-sm font-semibold text-gray-500">No farm photos yet</p>
          <p className="text-xs text-gray-400 mt-1">Add photos of your farm, fields, and produce</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
              <button
                onClick={() => handleDelete(photo)}
                disabled={deletingId === photo.id}
                className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full text-xs font-bold flex items-center justify-center"
              >
                {deletingId === photo.id ? '…' : '×'}
              </button>
            </div>
          ))}
          {uploading && (
            <div className="aspect-square rounded-xl border-2 border-dashed border-green-300 bg-green-50 flex items-center justify-center">
              <span className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Loading screen ────────────────────────────────────────── */
function LoadingScreen() {
  const { tx } = useLang()
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 border-4 border-green-700 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 text-sm">{tx.loadingLabel}</p>
      </div>
    </main>
  )
}

/* ─── Home-delivery tag with assigned rider contact ─────────── */
function DeliveryTagForFarmer({ order }: { order: Order }) {
  const [rider, setRider] = useState<{ name: string | null; phone: string } | null>(null)
  const riderId = order.delivery_boy_id ?? null

  useEffect(() => {
    if (!riderId) { setRider(null); return }
    let cancelled = false
    supabase
      .from('delivery_boys')
      .select('name, phone')
      .eq('id', riderId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setRider({ name: data.name ?? null, phone: data.phone as string })
      })
    return () => { cancelled = true }
  }, [riderId])

  const statusText = (() => {
    switch (order.delivery_status) {
      case 'assigned': return 'Rider assigned'
      case 'picked_up': return 'Picked up'
      case 'out_for_delivery': return 'Out for delivery'
      case 'delivered': return 'Delivered'
      default: return 'Waiting for rider'
    }
  })()

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mt-1 space-y-1.5">
      <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wide">
        🛵 Home delivery · {statusText}
      </p>
      {rider ? (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900 truncate">{rider.name || 'Rider'}</p>
            <p className="text-[11px] text-gray-500">For pickup coordination</p>
          </div>
          <a
            href={`tel:${rider.phone}`}
            className="bg-blue-600 text-white font-bold text-xs px-3 py-2 rounded-xl whitespace-nowrap active:bg-blue-700"
          >
            📞 Call · {rider.phone}
          </a>
        </div>
      ) : (
        <p className="text-[11px] text-blue-700">
          A delivery boy will pick up the order. You&apos;ll see their contact here when assigned.
        </p>
      )}
    </div>
  )
}

/* ─── Farmer not found ──────────────────────────────────────── */
function FarmerNotFound({ onLogout }: { onLogout: () => void }) {
  const { tx } = useLang()
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-sm space-y-4">
        <div className="text-6xl">🌾</div>
        <h2 className="text-xl font-extrabold text-gray-900">{tx.sessionExpired}</h2>
        <p className="text-gray-500 text-sm">{tx.sessionExpiredHelp}</p>
        <button onClick={onLogout} className="bg-green-700 text-white font-bold px-6 py-3 rounded-xl text-sm">
          {tx.loginAgain}
        </button>
      </div>
    </main>
  )
}

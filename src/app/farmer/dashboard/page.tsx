'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import NextImage from 'next/image'
import LanguageToggle from '@/components/LanguageToggle'
import { useLang } from '@/lib/LanguageContext'
import LocationSearch from '@/components/LocationSearch'
import { normalizePickupSchedule, emptyPickupSlot, type PickupSchedule } from '@/lib/pickup-slots'
import { type FarmerOrder as Order, isResolved } from '@/components/farmer/OrderCard'
import DemandSupplyChart from '@/components/DemandSupplyChart'
import { type CropBalance } from '@/lib/demand-supply'
import HarvestManager from '@/components/HarvestManager'
import { isLikelyUrl, normalizeUrl } from '@/lib/links'
import {
  clearFarmerLocalSession,
  farmerFetch,
  isFarmerSessionExpired,
  requireFarmerSession,
} from '@/lib/farmer-auth-client'

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
  farm_size_acres: number | null
  soil_organic_carbon: number | null
  soil_ph: number | null
  water_source: string | null
  story_quote: string | null
  pickup_locations: string[] | null
  farm_address: string | null
  facebook_url?: string | null
  instagram_url?: string | null
  youtube_url?: string | null
  cover_photo_url: string | null
  photo_url: string | null
  pesticide_cert_url: string | null
  pickup_slots: unknown
  lat: number | null
  lng: number | null
  location_name: string | null
  upi_id: string | null
  upi_qr_code_url: string | null
  cod_enabled: boolean | null
}

// An open crop request raised by a consumer in this farmer's area. The chart
// below only shows totals; farmers also need the individual asks — with a phone
// number — because the consumer form promises "they'll reach out when available".
type DemandRequest = {
  id: string
  crop_name: string
  quantity_kg: number | null
  needed_by_date: string | null
  delivery_location: string | null
  requester_name: string | null
  requester_phone: string | null
  created_at: string
}

// Demand-vs-supply rows for the area chart come from /api/demand-supply.

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
  image_urls: string[] | null
  category: string | null
  brix: number | null
  soil_organic_carbon: number | null
  soil_ph: number | null
  pesticide_result: string | null
  how_we_grow: string | null
  video_url?: string | null
  unit: string | null
  availability_from: string | null
  availability_to: string | null
  harvest_frequency: string | null
  harvest_frequency_count: number | null
  harvest_date: string | null
  shelf_life_days: number | null
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
  rating_avg: number | null
  review_count: number | null
}

// The Order shape, DeliveryStatus and isResolved() now live in the shared
// farmer OrderCard component and are imported above.

const UNIT_OPTIONS = (L: (en: string, te: string) => string) => [
  { value: 'kg', label: 'kg' },
  { value: 'gram', label: 'gram' },
  { value: 'piece', label: L('piece', 'నగ') },
  { value: 'bunch', label: L('bunch', 'కట్ట') },
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

// 📦 is a generic L('Other', 'ఇతర') icon so a farmer can list any produce
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
  const { tx, L } = useLang()
  const [farmer, setFarmer] = useState<Farmer | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [listings, setListings] = useState<DashboardListing[]>([])
  const [pendingOrders, setPendingOrders] = useState<Order[]>([])
  const [todayCount, setTodayCount] = useState(0)
  const [approvedCount, setApprovedCount] = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [supplyDemand, setSupplyDemand] = useState<CropBalance[]>([])
  const [demandRequests, setDemandRequests] = useState<DemandRequest[]>([])
  const [monthlyRevenue, setMonthlyRevenue] = useState(0)
  const [monthlyOrderCount, setMonthlyOrderCount] = useState(0)
  const [weeklyEarnings, setWeeklyEarnings] = useState<number[]>([0, 0, 0, 0])
  const [showForm, setShowForm] = useState(false)
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [showListings, setShowListings] = useState(false)

  // ?edit=profile opens the profile modal straight away — the "Edit profile"
  // button on the farmer's own public page links here. Read off
  // window.location rather than useSearchParams so this page needs no Suspense
  // boundary. The param is stripped afterwards, so a refresh (or a Back) doesn't
  // reopen the modal the farmer just closed.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('edit') !== 'profile') return
    setShowProfileEdit(true)
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const loadDashboard = useCallback(async () => {
    // Cookie-verified: a farmer whose session died must land on the login page,
    // not on a dashboard whose every action answers "Please log in."
    const farmerId = await requireFarmerSession()
    if (!farmerId) return

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

    // Local midnight today — matches the Orders page ?time=today window.
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [listingsRes, pendingRes, approvedRes, monthlyRes, todayRes] = await Promise.all([
      // Full (lightweight) listing rows so the dashboard can show them inline
      // with a quick suspend/resume; the active-listings count is derived below.
      supabase.from('produce_listings').select('id, name, emoji, status, price_tier_1_price, unit, stock_qty, rating_avg, review_count').eq('farmer_id', farmerData.id).order('created_at', { ascending: false }),
      // Active orders = still pending, OR approved but not yet picked up/delivered,
      // OR buyer-cancelled but not yet acknowledged by the farmer. Approved orders
      // stay here so the farmer keeps the scheduled date in view until the buyer
      // collects (or the rider delivers); a buyer-cancelled order stays until the
      // farmer taps Acknowledge so the cancellation never goes unnoticed.
      supabase.from('orders').select('*').eq('farmer_id', farmerData.id).or('status.eq.pending,status.eq.approved,and(status.eq.cancelled,acknowledged_at.is.null)').order('created_at', { ascending: false }),
      supabase.from('orders').select('id, total_price').eq('farmer_id', farmerData.id).eq('status', 'approved').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
      supabase.from('orders').select('id, total_price, created_at').eq('farmer_id', farmerData.id).eq('status', 'approved').gte('created_at', monthStart.toISOString()),
      // Today's orders — every order placed since local midnight, any status,
      // to match the Orders list opened by the tile's ?time=today link.
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('farmer_id', farmerData.id).gte('created_at', todayStart.toISOString()),
    ])

    setListings((listingsRes.data ?? []) as DashboardListing[])
    // Drop approved orders that are already resolved (collected / delivered).
    const activeOrders = (pendingRes.data ?? []).filter((o) => !isResolved(o as Order)) as Order[]
    setPendingOrders(activeOrders)
    setTodayCount(todayRes.count ?? 0)
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

    // Demand vs supply across the whole area (all farmers' orders + intents vs
    // all farmers' available produce), computed server-side with the service role.
    const dsRes = await fetch(
      `/api/demand-supply?region=${encodeURIComponent(farmerData.region_slug)}`,
    ).catch(() => null)
    if (dsRes?.ok) {
      const json = await dsRes.json().catch(() => ({}))
      setSupplyDemand(((json.crops ?? []) as CropBalance[]).slice(0, 6))
    } else {
      setSupplyDemand([])
    }

    // The individual open requests behind those demand bars.
    const { data: intents } = await supabase
      .from('demand_intents')
      .select('id, crop_name, quantity_kg, needed_by_date, delivery_location, requester_name, requester_phone, created_at')
      .eq('region_slug', farmerData.region_slug)
      .eq('fulfilled', false)
      .order('created_at', { ascending: false })
    setDemandRequests((intents ?? []) as DemandRequest[])

    setLoading(false)
  }, [])

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
          // A freshly inserted order is placed today, so it counts toward the
          // "Today's orders" tile regardless of its initial status.
          setTodayCount((c) => c + 1)
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
          // An order stays in the active list while it's pending, approved-and-
          // awaiting fulfillment, or buyer-cancelled-but-not-yet-acknowledged.
          // Anything else (declined, resolved, acknowledged cancel) drops out.
          const stillActive =
            row.status === 'pending'
            || (row.status === 'approved' && !isResolved(row))
            || (row.status === 'cancelled' && !row.acknowledged_at)
          if (!stillActive) {
            // Buyer just confirmed receipt of a courier order — tell the farmer
            // before it drops out of the active list and into history.
            if (row.received_at && !prev.received_at) {
              fireNotification(
                L('Order received ✓', 'అందుకున్నారు'),
                `${row.buyer_name ?? 'Buyer'} confirmed they received ${row.produce_name ?? 'the order'}`,
              )
            }
            setPendingOrders((cur) => cur.filter((o) => o.id !== row.id))
            return
          }
          // Still active (pending, approved-and-awaiting, or a fresh buyer
          // cancellation): update or insert.
          setPendingOrders((cur) => {
            const exists = cur.some((o) => o.id === row.id)
            return exists ? cur.map((o) => o.id === row.id ? row : o) : [row, ...cur]
          })
          // Buyer just cancelled — surface it so the farmer notices instead of
          // the order quietly slipping away.
          if (row.status === 'cancelled' && prev.status !== 'cancelled') {
            fireNotification(
              L('Order cancelled by buyer', 'కొనుగోలుదారు ఆర్డర్ రద్దు చేశారు'),
              `${row.buyer_name ?? 'Buyer'} cancelled ${row.produce_name ?? 'an order'}`,
            )
          }
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

  const handleLogout = async () => {
    // Drop the server cookie too — clearing localStorage alone leaves a live
    // session behind on the device.
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null)
    clearFarmerLocalSession()
    router.replace('/farmer/login')
  }

  if (loading) return <LoadingScreen />
  if (notFound) return <FarmerNotFound onLogout={handleLogout} />

  // The list now also holds approved-but-unresolved orders; the stat card should
  // still reflect only the orders that genuinely need a response.
  const pendingCount = pendingOrders.filter((o) => o.status === 'pending').length
  // Active = visible-to-buyers listings, derived so the count stays in sync when
  // the farmer suspends/resumes from the inline produce list below.
  const activeListings = listings.filter((l) => l.status === 'available').length

  // Overall rating across ALL of this farmer's harvests — a review-count-weighted
  // mean (a harvest with more reviews pulls proportionally harder) so it matches
  // the single number a buyer would infer from the whole catalogue. Only harvests
  // that actually carry reviews contribute; with none, we hide the badge rather
  // than show a misleading 0.0.
  const ratedListings = listings.filter((l) => (l.review_count ?? 0) > 0 && l.rating_avg != null)
  const totalReviews = ratedListings.reduce((sum, l) => sum + (l.review_count ?? 0), 0)
  const overallRating =
    totalReviews > 0
      ? ratedListings.reduce((sum, l) => sum + (l.rating_avg ?? 0) * (l.review_count ?? 0), 0) / totalReviews
      : null

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
            {/* Overall rating across all harvests, sits above the dashboard title.
                Tapping it opens the public profile on its Reviews tab. */}
            {overallRating != null && (
              <Link
                href={`/farmer/${farmer!.slug}?tab=reviews`}
                className="flex items-center gap-1 mb-1 w-fit active:opacity-70"
                aria-label={L('View all reviews', 'అన్ని సమీక్షలు చూడండి')}
              >
                <span className="text-amber-400 text-sm leading-none">★</span>
                <span className="text-white text-sm font-bold leading-none">{overallRating.toFixed(1)}</span>
                <span className="text-green-400 text-[11px] leading-none underline">
                  ({totalReviews}{' '}
                  {totalReviews === 1 ? L('review', 'సమీక్ష') : L('reviews', 'సమీక్షలు')})
                </span>
              </Link>
            )}
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
            <button onClick={handleLogout} className="text-green-500 text-xs underline">
              {tx.logout}
            </button>
          </div>
        </div>
        <h2 className="text-white text-lg sm:text-xl font-extrabold leading-snug mt-4">
          {L('Your Harvest. Your Price. Your Consumer', 'మీ కోత. మీ ధర. మీ కొనుగోలుదారు')}
        </h2>
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

        {/* Pending orders need your response — slim, urgent, links to the
            Orders page pre-filtered to Pending. Only shown when there are any. */}
        {pendingCount > 0 && (
          <Link
            href="/farmer/dashboard/orders?status=pending"
            className="flex items-center justify-between gap-3 bg-orange-50 border-2 border-orange-300 rounded-2xl px-4 py-3 active:bg-orange-100"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-2xl flex-shrink-0">⚠️</span>
              <div className="min-w-0">
                <p className="font-extrabold text-orange-900 text-sm leading-tight">
                  {pendingCount} {pendingCount === 1
                    ? L('order needs your response', 'ఆర్డర్‌కు మీ స్పందన కావాలి')
                    : L('orders need your response', 'ఆర్డర్‌లకు మీ స్పందన కావాలి')}
                </p>
                <p className="text-[11px] text-orange-700 mt-0.5">{L('Tap to approve or decline', 'ఆమోదించడానికి/తిరస్కరించడానికి నొక్కండి')}</p>
              </div>
            </div>
            <span className="text-orange-700 font-bold text-lg flex-shrink-0">→</span>
          </Link>
        )}

        {/* Stat cards — fixed order per client spec: 1) Today's orders,
            2) Active listings, 3) Approved this week, 4) Revenue. Tiles deep-link
            into the relevant Orders view rather than separate dashboard sections. */}
        <div className="grid grid-cols-2 gap-3">
          {/* 1. Today's orders — placed/due today; opens Orders ?time=today */}
          <Link
            href="/farmer/dashboard/orders?time=today"
            className={`border rounded-2xl p-4 text-left active:opacity-80 ${
              todayCount > 0 ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className={`text-3xl font-black ${todayCount > 0 ? 'text-orange-700' : 'text-gray-500'}`}>{todayCount}</div>
            <div className="text-sm font-semibold text-gray-800 mt-1 leading-tight">{L("Today's orders", 'నేటి ఆర్డర్లు')}</div>
            <div className="text-[11px] font-bold text-orange-700 mt-2 flex items-center gap-1">
              {L('View', 'చూడండి')} <span aria-hidden>→</span>
            </div>
          </Link>
          {/* 2. Active listings — opens the managed produce list */}
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
          {/* 3. Approved this week — opens Orders filtered to approved, all time */}
          <Link
            href="/farmer/dashboard/orders?status=approved&time=all"
            className="border-green-200 bg-green-50 border rounded-2xl p-4 text-left active:bg-green-100"
          >
            <div className="text-3xl font-black text-green-800">{approvedCount}</div>
            <div className="text-sm font-semibold text-gray-800 mt-1 leading-tight">{tx.approvedThisWeek}</div>
            <div className="text-[11px] font-bold text-green-700 mt-2 flex items-center gap-1">
              {L('View all', 'అన్నీ చూడండి')} <span aria-hidden>→</span>
            </div>
          </Link>
          {/* 4. Revenue */}
          <div className="border-purple-200 bg-purple-50 border rounded-2xl p-4">
            <div className="text-3xl font-black text-purple-800">{totalRevenue > 0 ? `₹${totalRevenue}` : '—'}</div>
            <div className="text-sm font-semibold text-gray-800 mt-1 leading-tight">{tx.totalRevenue}</div>
          </div>
        </div>

        {/* Monthly earnings summary */}
        <EarningsCard
          revenue={monthlyRevenue}
          orderCount={monthlyOrderCount}
          weekly={weeklyEarnings}
        />

        {/* Orders hub — the full orders list (all statuses + filters) lives on
            its own page now, keeping the dashboard clean. */}
        <Link
          href="/farmer/dashboard/orders"
          className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between gap-3 active:bg-gray-50"
        >
          <div className="min-w-0">
            <h2 className="font-extrabold text-gray-900 text-base leading-tight">
              {tx.ordersTab}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {L('View, filter & manage all your orders', 'మీ అన్ని ఆర్డర్‌లను చూడండి & నిర్వహించండి')}
            </p>
          </div>
          <span className="text-green-700 font-bold text-sm whitespace-nowrap flex-shrink-0">
            {L('Open', 'తెరవండి')} →
          </span>
        </Link>

        {/* Individual crop requests raised by consumers in this farmer's area */}
        <div className="bg-amber-50 rounded-2xl border-2 border-amber-200 p-4">
            <h2 className="font-extrabold text-gray-900 text-base leading-tight flex items-center gap-2">
              <span>📣</span>
              {L('Crop requests near you', 'మీ ప్రాంతంలో పంట అభ్యర్థనలు')}
              {demandRequests.length > 0 && (
                <span className="ml-auto text-xs font-bold text-amber-800 bg-amber-200 rounded-full px-2 py-0.5">
                  {demandRequests.length}
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-600 mt-0.5 mb-3">
              {L('Buyers asked for these. Call them if you can supply.',
                 'కొనుగోలుదారులు వీటిని అడిగారు. మీరు సరఫరా చేయగలిగితే కాల్ చేయండి.')}
            </p>

            {demandRequests.length === 0 && (
              <p className="text-center text-gray-500 text-sm py-4">
                {L('No crop requests in your area yet.',
                   'మీ ప్రాంతంలో ఇంకా పంట అభ్యర్థనలు లేవు.')}
              </p>
            )}

            <div className="space-y-2">
              {demandRequests.map((r) => (
                <div key={r.id} className="bg-white rounded-xl border border-amber-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm truncate">
                        {r.crop_name}
                        {r.quantity_kg != null && (
                          <span className="font-normal text-gray-600"> — {r.quantity_kg} kg</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {r.requester_name || L('Buyer', 'కొనుగోలుదారు')}
                        {r.delivery_location && ` · ${r.delivery_location}`}
                      </p>
                      {r.needed_by_date && (
                        <p className="text-xs text-amber-800 mt-0.5">
                          {L('Needed by', 'కావలసిన తేదీ')} {r.needed_by_date}
                        </p>
                      )}
                    </div>
                    {r.requester_phone && (
                      <div className="flex gap-1.5 flex-shrink-0">
                        <a
                          href={`tel:${r.requester_phone}`}
                          className="bg-green-700 text-white rounded-lg px-3 py-2 text-xs font-bold"
                        >
                          {L('Call', 'కాల్')}
                        </a>
                        <a
                          href={`https://wa.me/91${r.requester_phone.replace(/\D/g, '').slice(-10)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-white border border-green-700 text-green-700 rounded-lg px-3 py-2 text-xs font-bold"
                        >
                          WhatsApp
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
        </div>

        {/* Demand vs supply chart for the area */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="font-extrabold text-gray-900 text-base leading-tight">
            {tx.demandVsSupply}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5 mb-4">
            {tx.demandVsSupplyHelp}
          </p>

          {supplyDemand.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-gray-400 text-sm">{tx.noDemandSignals}</p>
              <p className="text-gray-400 text-xs mt-1">{tx.shareProfileLink}</p>
            </div>
          ) : (
            <DemandSupplyChart
              crops={supplyDemand}
              demandLabel={tx.demand}
              supplyLabel={tx.supply}
            />
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
            farmerSoilPh={farmer!.soil_ph ?? null}
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
          farmerSoilPh={farmer.soil_ph ?? null}
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

    </main>
  )
}

/* ─── Notification permission banner ───────────────────────── */
function NotificationPermissionBanner() {
  const { L } = useLang()
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
            {L('Notifications blocked', 'నోటిఫికేషన్‌లు బ్లాక్')}
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
          {L('Get notified instantly', 'తక్షణ నోటిఫికేషన్')}
        </p>
        <p className="text-[11px] text-blue-700 mt-0.5 leading-snug">
          Allow notifications to be alerted the moment a buyer places an order.
        </p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleEnable}
            className="bg-blue-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs active:bg-blue-700"
          >
            {L('Enable', 'ఆన్ చేయండి')}
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
  const { tx, L } = useLang()
  const [name, setName] = useState(farmer.name ?? '')
  const [village, setVillage] = useState(farmer.village ?? '')
  const [district, setDistrict] = useState(farmer.district ?? '')
  const [method, setMethod] = useState(farmer.method ?? 'natural')
  const [sinceYear, setSinceYear] = useState(
    farmer.farming_since_year ? String(farmer.farming_since_year) : '',
  )
  const initialLocations = Array.isArray(farmer.pickup_locations) ? farmer.pickup_locations : []
  const [pickupLocations, setPickupLocations] = useState<string[]>(initialLocations)
  const [newPickup, setNewPickup] = useState('')
  const [farmAddress, setFarmAddress] = useState(farmer.farm_address ?? '')
  // Social channels the farmer already runs. Stored on `farmers`; see
  // scripts/farmer-social-links-migration.sql.
  const [facebookUrl, setFacebookUrl]   = useState(farmer.facebook_url ?? '')
  const [instagramUrl, setInstagramUrl] = useState(farmer.instagram_url ?? '')
  const [youtubeUrl, setYoutubeUrl]     = useState(farmer.youtube_url ?? '')

  // Farm & soil details (also editable by moderators) — surfaced here so farmers
  // can fill their own WhatsApp, farm size, soil health and story from the dashboard.
  const [whatsapp, setWhatsapp] = useState(farmer.phone ?? '')
  const [farmSize, setFarmSize] = useState(farmer.farm_size_acres ? String(farmer.farm_size_acres) : '')
  const [soilCarbon, setSoilCarbon] = useState(farmer.soil_organic_carbon ? String(farmer.soil_organic_carbon) : '')
  const [soilPh, setSoilPh] = useState(farmer.soil_ph ? String(farmer.soil_ph) : '')
  const [waterSource, setWaterSource] = useState(farmer.water_source ?? '')
  const [storyQuote, setStoryQuote] = useState(farmer.story_quote ?? '')

  // Pickup schedule — keyed by location. Each location has its own one-or-more
  // windows (days + time range), so a farmer can offer e.g. weekday mornings at
  // one pickup point and weekend evenings at another.
  const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const [schedule, setSchedule] = useState<PickupSchedule>(
    () => normalizePickupSchedule(farmer.pickup_slots, initialLocations),
  )

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
            ? L('Location permission denied', 'లొకేషన్ అనుమతి లేదు. Please allow location in browser settings.')
            : L('Could not get location. Please try again.', 'మళ్ళీ ప్రయత్నించండి.')
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
    // Start the new location with one blank timing so the editor is ready.
    setSchedule((prev) => ({ ...prev, [v]: [emptyPickupSlot()] }))
    setNewPickup('')
  }
  const removePickup = (loc: string) => {
    setPickupLocations((prev) => prev.filter((l) => l !== loc))
    setSchedule((prev) => {
      const next = { ...prev }
      delete next[loc]
      return next
    })
  }

  // Per-location timing editors. Each operates on schedule[loc].
  const addTiming = (loc: string) =>
    setSchedule((prev) => ({ ...prev, [loc]: [...(prev[loc] ?? []), emptyPickupSlot()] }))
  const removeTiming = (loc: string, idx: number) =>
    setSchedule((prev) => ({ ...prev, [loc]: (prev[loc] ?? []).filter((_, i) => i !== idx) }))
  const toggleTimingDay = (loc: string, idx: number, day: string) =>
    setSchedule((prev) => ({
      ...prev,
      [loc]: (prev[loc] ?? []).map((s, i) =>
        i === idx
          ? { ...s, days: s.days.includes(day) ? s.days.filter((d) => d !== day) : [...s.days, day] }
          : s,
      ),
    }))
  const setTimingTime = (loc: string, idx: number, key: 'time_from' | 'time_to', val: string) =>
    setSchedule((prev) => ({
      ...prev,
      [loc]: (prev[loc] ?? []).map((s, i) => (i === idx ? { ...s, [key]: val } : s)),
    }))

  const handleSave = async () => {
    if (!name.trim()) { setError(tx.nameRequired); return }
    if (!village.trim()) { setError(tx.villageRequired); return }
    if (upiId.trim() && !/^[a-zA-Z0-9._\-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim())) {
      setError('Invalid UPI ID format. Example: yourname@ybl or 9876543210@paytm')
      return
    }
    // Pickup location + timing is mandatory: a buyer choosing self-pickup must
    // always know WHERE and WHEN to collect, so every farmer needs at least one
    // pickup point and a timing window for each.
    if (pickupLocations.length === 0) {
      setError(L('Add at least one pickup location so buyers know where to collect their order.', 'కొనుగోలుదారులు ఆర్డర్ ఎక్కడ తీసుకోవాలో తెలియడానికి కనీసం ఒక పికప్ స్థలాన్ని జోడించండి.'))
      return
    }
    const cleanSlots = normalizePickupSchedule(schedule, pickupLocations)
    const missingTiming = pickupLocations.filter((loc) => !(cleanSlots[loc]?.length))
    if (missingTiming.length > 0) {
      setError(L(`Add pickup timings for: ${missingTiming.join(', ')}`, `వీటికి పికప్ సమయాలను జోడించండి: ${missingTiming.join(', ')}`))
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
      pickup_slots: (() => {
        const clean = normalizePickupSchedule(schedule, pickupLocations)
        return Object.keys(clean).length > 0 ? clean : null
      })(),
      lat: farmerLat,
      lng: farmerLng,
      location_name: farmerLat ? (farmerLocationName || name.trim()) : null,
      phone:               whatsapp.trim() || farmer.phone,
      farm_size_acres:     farmSize ? Number(farmSize) : null,
      soil_organic_carbon: soilCarbon ? Number(soilCarbon) : null,
      water_source:        waterSource.trim() || null,
      story_quote:         storyQuote.trim() || null,
    }
    if (sinceYear) payload.farming_since_year = Number(sinceYear)

    const { data, error: err } = await supabase
      .from('farmers')
      .update(payload)
      .eq('id', farmer.id)
      .select('*')
      .single()

    if (err || !data) {
      setLoading(false)
      setError(err?.message ?? tx.couldNotSave)
      return
    }

    // Soil pH is best-effort: the soil_ph column may not exist until
    // scripts/farmer-soil-ph-migration.sql is applied, so a missing column must
    // never block the rest of the profile save.
    const phValue = soilPh ? Number(soilPh) : null
    if (soilPh) {
      await supabase.from('farmers').update({ soil_ph: phValue }).eq('id', farmer.id)
    }

    // Social links are best-effort for the same reason: their columns don't
    // exist until scripts/farmer-social-links-migration.sql runs, and a farmer
    // must still be able to save their name and pickup points before then.
    const socialPatch = {
      facebook_url:  normalizeUrl(facebookUrl),
      instagram_url: normalizeUrl(instagramUrl),
      youtube_url:   normalizeUrl(youtubeUrl),
    }
    await supabase.from('farmers').update(socialPatch).eq('id', farmer.id)

    setLoading(false)
    localStorage.setItem('yff_farmer_slug', data.slug)
    onSaved({ ...(data as Farmer), soil_ph: phValue, ...socialPatch })
  }

  const handleChangePassword = async () => {
    if (!currentPassword) { setPwError(L('Current password is required', 'ప్రస్తుత పాస్‌వర్డ్ అవసరం')); return }
    if (newPassword.length < 6) { setPwError(L('Minimum 6 characters', 'కనీసం 6 అక్షరాలు')); return }
    if (newPassword !== confirmPassword) { setPwError(L('Passwords do not match', 'పాస్‌వర్డ్‌లు సరిపోలలేదు')); return }
    setPwLoading(true)
    setPwError('')
    let res: Response
    try {
      res = await farmerFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
    } catch (e) {
      if (isFarmerSessionExpired(e)) return
      setPwLoading(false)
      setPwError('Network error. Please try again.')
      return
    }
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
            <h4 className="text-sm font-extrabold text-green-800">{L('Farm Profile', 'పొలం వివరాలు')}</h4>
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

          {/* Farm & soil details — shown on the public profile (Story & Quality
              tabs). Previously only moderators could fill these. */}
          <Field
            label={L('WhatsApp number', 'వాట్సాప్ నంబర్')}
            placeholder="e.g. 9876543210"
            value={whatsapp}
            onChange={setWhatsapp}
            type="tel"
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={L('Farm size (acres)', 'పొలం పరిమాణం')}
              placeholder="e.g. 2.5"
              value={farmSize}
              onChange={setFarmSize}
              type="number"
            />
            <Field
              label={L('Soil organic carbon (%)', 'నేల సేంద్రియ కార్బన్')}
              placeholder="e.g. 0.85"
              value={soilCarbon}
              onChange={setSoilCarbon}
              type="number"
            />
          </div>
          <Field
            label={L('Soil pH', 'నేల pH')}
            placeholder="e.g. 6.8"
            value={soilPh}
            onChange={setSoilPh}
            type="number"
          />
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
              {L('Water source', 'నీటి వనరు')}
            </label>
            <select
              value={waterSource}
              onChange={(e) => setWaterSource(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-green-500 focus:outline-none"
            >
              <option value="">{L('Select a water source…', 'నీటి వనరును ఎంచుకోండి…')}</option>
              <option value="Borewell">{L('Borewell', 'బోర్‌వెల్')}</option>
              <option value="Open well">{L('Open well', 'బావి')}</option>
              <option value="Rain-fed">{L('Rain-fed', 'వర్షాధారం')}</option>
              <option value="Canal">{L('Canal', 'కాలువ')}</option>
              <option value="River">{L('River', 'నది')}</option>
              <option value="Pond / Tank">{L('Pond / Tank', 'చెరువు')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
              {L('How we grow', 'మేము ఎలా పండిస్తాము')}
            </label>
            <textarea
              value={storyQuote}
              onChange={(e) => setStoryQuote(e.target.value)}
              rows={3}
              placeholder={L('A line about your farm and how you grow…', 'మీ పొలం గురించి ఒక మాట…')}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
            />
          </div>

          {/* Farm GPS location */}
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
              {L('Farm location', 'పొలం లొకేషన్')}
            </label>
            <p className="text-[11px] text-gray-500 mb-2 leading-snug">
              {L('Set your farm location so nearby buyers discover your harvests first.', 'దగ్గరలో ఉన్న కొనుగోలుదారులు మీ కోతలను ముందుగా కనుగొంటారు.')}
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
                  {L('Change', 'మార్చు')}
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
                      {L('Getting location...', 'లొకేషన్ తెస్తోంది')}
                    </>
                  ) : (
                    <>{L('📍 Use GPS (most accurate)', 'GPS వాడండి')}</>
                  )}
                </button>
                <div className="flex items-center gap-2">
                  <div className="flex-1 border-t border-gray-200" />
                  <span className="text-[10px] text-gray-400 font-semibold">{L('OR', 'లేదా')}</span>
                  <div className="flex-1 border-t border-gray-200" />
                </div>
                <LocationSearch
                  placeholder={L('Search farm location', 'పొలం లొకేషన్ వెతకండి')}
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
            <h4 className="text-sm font-extrabold text-green-800">{L('Pickup & Schedule', 'పికప్ & షెడ్యూల్')}</h4>
            <p className="text-[11px] text-gray-500">Where and when buyers collect</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
              {L('Farm Address', 'పొలం చిరునామా')}
            </label>
            <p className="text-[11px] text-gray-500 mb-2 leading-snug">
              {L('Where should the delivery rider come to collect the harvest? Include door number, street and landmark.', 'డెలివరీ రైడర్ ఎక్కడకు వచ్చి కోత తీసుకోవాలి? డోర్ నంబర్, వీధి, ల్యాండ్‌మార్క్ ఇవ్వండి.')}
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

          {/* Social channels. A farm page a buyer can go and look at does more
              for trust than anything we can say about a new seller ourselves.
              All optional — the profile shows only what's filled in. */}
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
              {L('Your channels (optional)', 'మీ ఛానెల్‌లు')}
            </label>
            <p className="text-[11px] text-gray-500 mb-2 leading-snug">
              {L('Already post about your farm? Add the links and buyers can follow you.', 'మీ పొలం గురించి పోస్ట్ చేస్తున్నారా? లింక్‌లు జోడిస్తే కొనుగోలుదారులు ఫాలో అవుతారు.')}
            </p>
            <div className="space-y-2">
              {([
                { label: 'Facebook',  icon: '📘', value: facebookUrl,  set: setFacebookUrl,  ph: 'facebook.com/yourfarm' },
                { label: 'Instagram', icon: '📸', value: instagramUrl, set: setInstagramUrl, ph: 'instagram.com/yourfarm' },
                { label: 'YouTube',   icon: '▶️', value: youtubeUrl,   set: setYoutubeUrl,   ph: 'youtube.com/@yourfarm' },
              ] as const).map((row) => (
                <div key={row.label}>
                  <div className="flex items-center gap-2">
                    <span className="w-8 text-center text-lg" aria-hidden>{row.icon}</span>
                    <input
                      type="url"
                      inputMode="url"
                      aria-label={row.label}
                      value={row.value}
                      onChange={(e) => row.set(e.target.value.slice(0, 300))}
                      placeholder={row.ph}
                      className="flex-1 min-w-0 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
                    />
                  </div>
                  {row.value.trim() && !isLikelyUrl(row.value) && (
                    <p className="text-[11px] text-amber-700 mt-1 ml-10">
                      {L('That does not look like a link.', 'ఇది లింక్‌లా లేదు.')}
                    </p>
                  )}
                </div>
              ))}
            </div>
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
            {pickupLocations.length === 0 && (
              <p className="text-[11px] text-gray-400 italic">
                {L('Add a pickup location above to set its timings.', 'సమయాలు సెట్ చేయడానికి పైన పికప్ స్థలాన్ని జోడించండి.')}
              </p>
            )}

            {/* Each pickup location carries its own pickup timings. */}
            <div className="space-y-4 mt-1">
              {pickupLocations.map((loc) => {
                const timings = schedule[loc] ?? []
                return (
                  <div key={loc} className="border border-green-200 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between bg-green-50 px-3 py-2.5 border-b border-green-100">
                      <span className="text-sm font-bold text-green-900 truncate">📍 {loc}</span>
                      <button
                        type="button"
                        onClick={() => removePickup(loc)}
                        className="text-red-500 text-xs font-bold active:text-red-700 whitespace-nowrap"
                        aria-label={`Remove ${loc}`}
                      >
                        {L('✕ Remove location', 'స్థలం తీసివేయి')}
                      </button>
                    </div>

                    <div className="p-3">
                      <p className="text-[11px] text-gray-500 mb-2 leading-snug">
                        {L('Days & times buyers can pick up from here.', 'ఇక్కడ నుండి కొనుగోలుదారులు పికప్ చేసుకునే రోజులు & సమయాలు.')}
                      </p>

                      <div className="space-y-3">
                        {timings.map((slot, idx) => (
                          <div key={idx} className="border border-gray-200 rounded-xl p-3 bg-gray-50">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] font-bold text-gray-500">
                                {L('Timing', 'సమయం')} {idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeTiming(loc, idx)}
                                className="text-red-500 text-xs font-bold active:text-red-700"
                              >
                                {L('✕ Remove', 'తీసివేయి')}
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2 mb-3">
                              {ALL_DAYS.map((day) => (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => toggleTimingDay(loc, idx, day)}
                                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                                    slot.days.includes(day)
                                      ? 'bg-green-700 text-white border-green-700'
                                      : 'bg-white text-gray-600 border-gray-200'
                                  }`}
                                >
                                  {day.slice(0, 3)}
                                </button>
                              ))}
                            </div>
                            {slot.days.length > 0 && (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-[11px] text-gray-500 mb-1">{tx.pickupFrom}</p>
                                  <input
                                    type="time"
                                    value={slot.time_from}
                                    onChange={(e) => setTimingTime(loc, idx, 'time_from', e.target.value)}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-green-500 focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <p className="text-[11px] text-gray-500 mb-1">{tx.pickupTo}</p>
                                  <input
                                    type="time"
                                    value={slot.time_to}
                                    onChange={(e) => setTimingTime(loc, idx, 'time_to', e.target.value)}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-green-500 focus:outline-none"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => addTiming(loc)}
                        className="mt-2 text-sm font-bold text-green-700 active:text-green-900"
                      >
                        {L('+ Add timing', 'సమయం జోడించు')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Section 3: Payment Details ── */}
          <div className="pt-3 border-t-2 border-green-100">
            <h4 className="text-sm font-extrabold text-green-800">{L('Payment Details', 'చెల్లింపు వివరాలు')}</h4>
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
                {L('UPI QR Code (optional)', 'UPI QR కోడ్')}
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
                    {L('Accept Cash on Delivery', 'నగదు చెల్లింపు అంగీకరించు')}
                  </span>
                  <span className="block text-[11px] text-gray-500 mt-0.5">
                    {codEnabled
                      ? L('Buyers can choose to pay in cash on pickup.', 'కొనుగోలుదారులు పికప్ సమయంలో నగదు చెల్లించవచ్చు.')
                      : L('Off — buyers must pay via UPI before pickup.', 'ఆఫ్ — కొనుగోలుదారులు పికప్‌కు ముందు UPI ద్వారా చెల్లించాలి.')}
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
              <span>{L('🔑 Change Password', 'పాస్‌వర్డ్ మార్చండి')}</span>
              <span className="text-gray-400 text-lg leading-none">{showPwSection ? '−' : '+'}</span>
            </button>

            {showPwSection && (
              <div className="px-4 py-3 space-y-3">
                {pwSuccess ? (
                  <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2 text-center font-semibold">
                    {L('✓ Password updated!', 'పాస్‌వర్డ్ మార్చబడింది!')}
                  </p>
                ) : (
                  <>
                    <input
                      type="password"
                      placeholder={L('Current password', 'ప్రస్తుత పాస్‌వర్డ్')}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
                    />
                    <input
                      type="password"
                      placeholder={L('New password', 'కొత్త పాస్‌వర్డ్')}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
                    />
                    <input
                      type="password"
                      placeholder={L('Confirm password', 'నిర్ధారించండి')}
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
                      {pwLoading ? L('Updating…', 'మారుస్తోంది…') : L('Update Password', 'పాస్‌వర్డ్ అప్‌డేట్ చేయండి')}
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
  farmerSoilPh = null,
  editData,
  onClose,
  onPublished,
}: {
  farmerId: string
  farmerSlug?: string
  farmerRegion?: string
  defaultMethod: string
  farmerSoilPh?: number | null
  editData?: ListingRow | null
  onClose: () => void
  onPublished: (saved?: Partial<ListingRow>) => void
}) {
  const { tx, L } = useLang()
  const isEdit = !!editData
  const [name, setName] = useState(editData?.name ?? '')
  const [variety, setVariety] = useState(editData?.variety ?? '')
  const [emoji, setEmoji] = useState(editData?.emoji ?? '🌿')
  const [qty, setQty] = useState(editData?.stock_qty != null ? String(editData.stock_qty) : '')
  // Availability is a date range (From → To). Guard against full timestamps so
  // the <input type="date"> always receives YYYY-MM-DD.
  // Availability range + harvesting frequency inputs were removed from the form
  // (superseded by the harvests model). We still read any existing values so a
  // save preserves them rather than wiping the columns — hence no setters.
  const [availFrom] = useState(editData?.availability_from ? editData.availability_from.slice(0, 10) : '')
  const [availTo] = useState(editData?.availability_to ? editData.availability_to.slice(0, 10) : '')
  const [harvestFreq] = useState(editData?.harvest_frequency ?? '')
  const [harvestFreqCount] = useState(
    editData?.harvest_frequency_count != null ? String(editData.harvest_frequency_count) : '',
  )
  // Harvest date & time is no longer set on the produce itself — it now lives
  // per-pick in the harvests model (HarvestManager below). We still read any
  // existing value so a save preserves it rather than wiping the column; there
  // is no input or setter (like availFrom / harvestFreq above).
  const [harvestDate] = useState(() => {
    if (!editData?.harvest_date) return ''
    const d = new Date(editData.harvest_date)
    if (isNaN(d.getTime())) return ''
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  })
  // Shelf life (days) — how long this produce stays fresh. A produce-level
  // property (the harvest just records when + how much).
  const [shelfLifeDays, setShelfLifeDays] = useState(
    editData?.shelf_life_days != null ? String(editData.shelf_life_days) : '',
  )
  const [farmingMethod, setFarmingMethod] = useState(editData?.method ?? defaultMethod ?? 'natural')
  const [price1, setPrice1] = useState(editData?.price_tier_1_price != null ? String(editData.price_tier_1_price) : '')
  const [price1Qty, setPrice1Qty] = useState(editData?.price_tier_1_qty != null ? String(editData.price_tier_1_qty) : '5')
  const [price2, setPrice2] = useState(editData?.price_tier_2_price != null ? String(editData.price_tier_2_price) : '')
  const [price2Qty, setPrice2Qty] = useState(editData?.price_tier_2_qty != null ? String(editData.price_tier_2_qty) : '20')
  const [price3, setPrice3] = useState(editData?.price_tier_3_price != null ? String(editData.price_tier_3_price) : '')
  const [description, setDescription] = useState(editData?.description ?? '')
  const [brix, setBrix] = useState(editData?.brix != null ? String(editData.brix) : '')
  const [soc, setSoc] = useState(editData?.soil_organic_carbon != null ? String(editData.soil_organic_carbon) : '')
  // Soil pH defaults from the farm profile but can be overridden per produce.
  const [soilPh, setSoilPh] = useState(
    editData?.soil_ph != null ? String(editData.soil_ph) : (farmerSoilPh != null ? String(farmerSoilPh) : ''),
  )
  // Chemicals / pesticide info reuses the existing pesticide_result column.
  const [pesticide, setPesticide] = useState(editData?.pesticide_result ?? '')
  const [howWeGrow, setHowWeGrow] = useState(editData?.how_we_grow ?? '')
  const [videoUrl, setVideoUrl] = useState(editData?.video_url ?? '')
  // #9 — explicit produce category (drives the consumer category filter).
  const [category, setCategory] = useState(editData?.category ?? '')
  const [unit, setUnit] = useState(editData?.unit ?? 'kg')
  // #11 — delivery method for this listing: pickup only, farmer courier, or both.
  // Courier collects a flat charge within a radius (km) the farmer sets.
  const [deliveryMode, setDeliveryMode] = useState<'pickup' | 'courier' | 'both'>(
    (editData?.delivery_mode as 'pickup' | 'courier' | 'both') ?? 'pickup',
  )
  const [deliveryCharge, setDeliveryCharge] = useState(editData?.delivery_charge != null ? String(editData.delivery_charge) : '')
  const [deliveryRadius, setDeliveryRadius] = useState(editData?.delivery_radius_km != null ? String(editData.delivery_radius_km) : '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [existingImageUrl, setExistingImageUrl] = useState(editData?.image_url ?? '')
  // #12 — extra photos beyond the cover (image_url). New picks + already-saved ones.
  const [extraFiles, setExtraFiles] = useState<File[]>([])
  const [extraPreviews, setExtraPreviews] = useState<string[]>([])
  const [existingExtraUrls, setExistingExtraUrls] = useState<string[]>(
    (editData?.image_urls ?? []).filter((u) => u && u !== (editData?.image_url ?? '')),
  )
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

  // #12 — add/remove extra produce photos (beyond the cover).
  const handlePickExtra = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError(tx.pickImageFile); return }
    if (file.size > 8 * 1024 * 1024) { setError(tx.imageTooLarge); return }
    setError('')
    const compressed = await compressImage(file)
    setExtraFiles((f) => [...f, compressed])
    setExtraPreviews((p) => [...p, URL.createObjectURL(compressed)])
    e.target.value = '' // allow picking the same file again
  }
  const removeNewExtra = (idx: number) => {
    setExtraPreviews((p) => { if (p[idx]) URL.revokeObjectURL(p[idx]); return p.filter((_, i) => i !== idx) })
    setExtraFiles((f) => f.filter((_, i) => i !== idx))
  }
  const removeExistingExtra = (url: string) =>
    setExistingExtraUrls((p) => p.filter((u) => u !== url))

  const previewData: PreviewData = {
    name: name || 'Harvest name',
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
    // Shelf life is mandatory — it drives the freshness label buyers rely on.
    // (Harvest date/time is now per-pick in the harvests model, not on the
    // produce, so it's no longer required here.)
    const shelfNum = parseInt(shelfLifeDays, 10)
    if (!shelfLifeDays || !Number.isFinite(shelfNum) || shelfNum <= 0) {
      setError(L('Shelf life (days) is required.', 'తాజా (రోజులు) తప్పనిసరి.'))
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

    // #12 — upload any new extra photos, then assemble the full ordered set
    // (cover first). Best-effort: persisted via the secondary update below.
    const uploadedExtra: string[] = []
    for (const f of extraFiles) {
      const u = await uploadImage(f)
      if (u) uploadedExtra.push(u)
    }
    const allImages = [imageUrl, ...existingExtraUrls, ...uploadedExtra].filter(Boolean) as string[]

    // Harvest date+time (datetime-local, local time) → stored UTC ISO string.
    // Shelf life is an optional non-negative day count.
    const harvestDateIso = harvestDate ? new Date(harvestDate).toISOString() : null
    const shelfLifeVal = shelfLifeDays ? Math.max(0, parseInt(shelfLifeDays, 10)) : null

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
        availability_from: availFrom || null,
        availability_to: availTo || null,
        harvest_frequency: harvestFreq || null,
        harvest_frequency_count: harvestFreqCount ? Number(harvestFreqCount) : null,
        harvest_date: harvestDateIso,
        shelf_life_days: shelfLifeVal,
        delivery_mode: deliveryMode,
        delivery_charge: deliveryMode === 'pickup' ? null : (deliveryCharge ? Number(deliveryCharge) : null),
        delivery_radius_km: deliveryMode === 'pickup' ? null : (deliveryRadius ? Number(deliveryRadius) : null),
      }

      let res: Response
      try {
        res = await farmerFetch('/api/farmer/update-listing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId: editData.id, payload: editPayload }),
        })
      } catch (e) {
        if (isFarmerSessionExpired(e)) return
        setLoading(false)
        setError('Network error — is the server running?')
        return
      }
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setLoading(false); setError(json.error ?? 'Could not save changes'); return }
      // Quality fields are best-effort: their columns may not exist until
      // scripts/produce-quality-fields-migration.sql is applied, so they must
      // never block the core listing save. Written directly (client-side) here.
      const qualityPatch = {
        soil_ph: soilPh ? Number(soilPh) : null,
        pesticide_result: pesticide.trim() || null,
        how_we_grow: howWeGrow.trim() || null,
        category: category || null,
        image_urls: allImages.length ? allImages : null,
        video_url: normalizeUrl(videoUrl),
      }
      await supabase.from('produce_listings').update(qualityPatch).eq('id', editData.id)
      setLoading(false)
      // The server may have refreshed the sold-out flag based on the new
      // quantity (e.g. raising stock above 0 clears a stuck "Sold out").
      // Merge its resolved status so the card updates immediately.
      const resolved: Partial<ListingRow> = {
        ...editPayload,
        ...qualityPatch,
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
    payload.availability_from = availFrom || null
    payload.availability_to = availTo || null
    payload.harvest_frequency = harvestFreq || null
    payload.harvest_frequency_count = harvestFreqCount ? Number(harvestFreqCount) : null
    payload.harvest_date = harvestDateIso
    payload.shelf_life_days = shelfLifeVal
    payload.delivery_mode = deliveryMode
    if (deliveryMode !== 'pickup') {
      if (deliveryCharge) payload.delivery_charge = Number(deliveryCharge)
      if (deliveryRadius) payload.delivery_radius_km = Number(deliveryRadius)
    }

    const insertPayload = { ...payload, farmer_id: farmerId, status: 'available' }
    const { data: inserted, error: err } = await supabase
      .from('produce_listings')
      .insert(insertPayload)
      .select('id')
      .single()

    if (err) { setLoading(false); setError(err.message); return }

    // Quality fields are best-effort (columns may not exist until the migration
    // scripts/produce-quality-fields-migration.sql runs) — never block the listing.
    if (inserted?.id) {
      await supabase.from('produce_listings').update({
        soil_ph: soilPh ? Number(soilPh) : null,
        pesticide_result: pesticide.trim() || null,
        how_we_grow: howWeGrow.trim() || null,
        category: category || null,
        image_urls: allImages.length ? allImages : null,
        video_url: normalizeUrl(videoUrl),
      }).eq('id', inserted.id)
    }
    setLoading(false)

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
            {L('📦 = Other — pick this for any harvest without its own icon', '📦 = ఇతర — ప్రత్యేక ఐకాన్ లేని ఏ కోతకైనా దీన్ని ఎంచుకోండి')}
          </p>
        </div>

        {/* Unit selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {L('Unit', 'కొలత')}
          </label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-green-500 focus:outline-none"
          >
            {UNIT_OPTIONS(L).map((o) => (
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

        {/* Quantity */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {tx.availability}
          </label>
          <input
            type="number"
            placeholder={`Quantity (${unit})`}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
          />
        </div>

        {/* Availability range + harvesting frequency removed — the harvests
            model (per-pick date/time + shelf life) supersedes them. */}

        {/* Shelf life (required) for this listing. Harvest date & time is set
            per-pick in the harvests model (HarvestManager below), not here. */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {L('Shelf life (days)', 'తాజా (రోజులు)')} <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            required
            placeholder={L('e.g. 5', 'ఉదా. 5')}
            value={shelfLifeDays}
            onChange={(e) => setShelfLifeDays(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
          />
        </div>

        {/* Harvest timings — log/edit individual harvests (each a sellable pick
            with its own date, shelf life and qty). Only when editing an existing
            produce, since a harvest needs a saved produce to attach to. */}
        {isEdit && editData && (
          <HarvestManager
            listingId={editData.id}
            farmerId={farmerId}
            unit={unit}
            produceShelfLife={shelfLifeDays ? parseInt(shelfLifeDays, 10) : null}
          />
        )}

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

        {/* Category (#9) — drives the consumer Vegetables/Fruits/Grains/Leafy filter */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {L('Category', 'వర్గం')}
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-green-500 focus:outline-none"
          >
            <option value="">{L('Select a category…', 'వర్గాన్ని ఎంచుకోండి…')}</option>
            <option value="vegetables">{L('Vegetables', 'కూరగాయలు')}</option>
            <option value="fruits">{L('Fruits', 'పళ్ళు')}</option>
            <option value="grains">{L('Grains & Pulses', 'ధాన్యాలు')}</option>
            <option value="leafy">{L('Leafy Greens', 'ఆకు కూరలు')}</option>
            <option value="spices">{L('Spices', 'మసాలాలు')}</option>
            <option value="other">{L('Other', 'ఇతర')}</option>
          </select>
        </div>

        {/* Delivery method — pickup only, farmer courier, or both (#11) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {tx.deliveryMethod}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: 'pickup', en: 'Pickup only', te: 'పికప్ మాత్రమే', icon: '🧺' },
              { key: 'courier', en: 'I will courier', te: 'నేను డెలివరీ చేస్తా', icon: '🛵' },
              { key: 'both', en: 'Both', te: 'రెండూ', icon: '🔁' },
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
                    {L(opt.en, opt.te)}
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
                  placeholder={L('Delivery charge', 'డెలివరీ ఛార్జ్')}
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div className="relative">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder={L('Radius', 'పరిధి')}
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

        {/* Video link — a link, not an upload. Farmers already post clips to
            YouTube/Instagram/WhatsApp status; asking them to upload video over
            rural 4G would just mean nobody uses it. Buyers get a "Watch video"
            link on the produce page. */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {L('Video link (optional)', 'వీడియో లింక్')}
          </label>
          <input
            type="url"
            inputMode="url"
            placeholder="https://youtube.com/..."
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value.slice(0, 500))}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
          />
          {videoUrl.trim() && !isLikelyUrl(videoUrl) && (
            <p className="text-xs text-amber-700">
              {L('That does not look like a link. Paste the full address, starting with https://', 'ఇది లింక్‌లా లేదు. https:// తో మొదలయ్యే పూర్తి చిరునామా ఇవ్వండి.')}
            </p>
          )}
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

        {/* More photos (#12) — extra images beyond the cover; buyers can view all */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {L('More photos (optional)', 'మరిన్ని ఫోటోలు')}
          </label>
          {(existingExtraUrls.length > 0 || extraPreviews.length > 0) && (
            <div className="flex gap-2 flex-wrap">
              {existingExtraUrls.map((url) => (
                <div key={url} className="relative w-20 h-20">
                  <NextImage src={url} alt="" fill sizes="80px" className="object-cover rounded-xl border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => removeExistingExtra(url)}
                    className="absolute -top-1.5 -right-1.5 bg-white text-gray-700 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold shadow border"
                    aria-label="Remove photo"
                  >×</button>
                </div>
              ))}
              {extraPreviews.map((src, i) => (
                <div key={src} className="relative w-20 h-20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="w-20 h-20 object-cover rounded-xl border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => removeNewExtra(i)}
                    className="absolute -top-1.5 -right-1.5 bg-white text-gray-700 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold shadow border"
                    aria-label="Remove photo"
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-green-300 rounded-xl py-3 px-3 text-green-700 text-sm font-bold cursor-pointer active:bg-green-50">
            <span className="text-lg leading-none">＋</span>
            {L('Add another photo', 'మరో ఫోటో జోడించండి')}
            <input type="file" accept="image/*" onChange={handlePickExtra} className="hidden" />
          </label>
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
            <div>
              <p className="text-xs text-gray-500 mb-1">{L('Soil pH', 'నేల pH')}</p>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 6.8"
                value={soilPh}
                onChange={(e) => setSoilPh(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">{L('Chemicals / pesticide', 'రసాయనాలు / పురుగుమందు')}</p>
              <input
                type="text"
                placeholder={L('e.g. None / Lab tested', 'ఉదా. ఏదీ లేదు')}
                value={pesticide}
                onChange={(e) => setPesticide(e.target.value)}
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

        {/* Cancel, at the bottom where the farmer actually ends up. The only way
            out used to be the × in the header, which meant scrolling this whole
            form back to the top to abandon an edit. Kept on its own row — three
            buttons abreast don't fit 390px — and styled quietly so it can't be
            mistaken for Save. Disabled mid-save so a tap can't close the sheet
            while the write is in flight. */}
        <button
          onClick={onClose}
          disabled={loading}
          className="w-full text-gray-500 font-semibold py-3 rounded-xl text-sm active:bg-gray-50 disabled:opacity-50"
        >
          {tx.cancel}
        </button>
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
  const { tx, L } = useLang()
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
  farmerSoilPh = null,
  onClose,
  onChanged,
}: {
  farmerId: string
  farmerSlug?: string
  farmerRegion?: string
  defaultMethod: string
  farmerSoilPh?: number | null
  onClose: () => void
  onChanged: () => void
}) {
  const { tx, L } = useLang()
  const [rows, setRows] = useState<ListingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [editingRow, setEditingRow] = useState<ListingRow | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    // select('*') keeps this migration-tolerant: the per-produce quality columns
    // (soil_ph, pesticide_result, how_we_grow) may not exist until the migration
    // runs, and naming a missing column in select(...) would error the whole load.
    const { data, error: err } = await supabase
      .from('produce_listings')
      .select('*')
      .eq('farmer_id', farmerId)
      .order('created_at', { ascending: false })
    setLoading(false)
    if (err) { setError(err.message); return }
    setRows((data ?? []) as ListingRow[])
  }, [farmerId])

  useEffect(() => { load() }, [load])

  // Pause/Suspend use the anon client + RLS UPDATE policy — the same public-write
  // model as Add/Delete produce. .select('id') confirms a row actually changed;
  // an empty result means the RLS UPDATE policy is missing (the write would
  // otherwise silently match 0 rows and never persist).
  const setListingStatus = async (row: ListingRow, next: string) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: next } : r)))
    setError('')
    const { data, error: err } = await supabase
      .from('produce_listings')
      .update({ status: next })
      .eq('id', row.id)
      .select('id')
    if (err) { setError(err.message); load() }
    else if (!data?.length) { setError('Could not update — please try again.'); load() }
    else { onChanged() }
  }

  // Pause hides a listing from consumers without deleting it; Resume brings it
  // back. Unlike Delete this is fully reversible. We flip the status between
  // 'paused' and 'available' — consumer queries only ever show 'available'.
  //
  // This is the farmer's only take-down. There used to be a second button,
  // Suspend ('suspended_by_farmer'), that did exactly the same thing; it was
  // removed because two identical controls only raised the question of which to
  // press, and "suspend" already means a *moderator* take-down ('suspended')
  // elsewhere in the app. Legacy rows are migrated to 'paused' by
  // scripts/remove-farmer-suspend-migration.sql.
  const handleTogglePause = (row: ListingRow) =>
    setListingStatus(row, row.status === 'paused' ? 'available' : 'paused')

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
            {L('Add New Harvest', 'కొత్త కోత చేర్చండి')}
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
              farmerId={farmerId}
              deleting={deletingId === row.id}
              onDelete={() => handleDelete(row)}
              onEdit={() => setEditingRow(row)}
              onTogglePause={() => handleTogglePause(row)}
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
              farmerSoilPh={farmerSoilPh}
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
              farmerSoilPh={farmerSoilPh}
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


function ListingRowCard({
  row,
  farmerId,
  deleting,
  onDelete,
  onEdit,
  onTogglePause,
}: {
  row: ListingRow
  farmerId: string
  deleting: boolean
  onDelete: () => void
  onEdit: () => void
  onTogglePause: () => void
}) {
  const { tx, L } = useLang()
  const emoji = row.emoji ?? '🌿'

  const isPaused = row.status === 'paused'
  const statusLabel =
    row.status === 'available'
      ? tx.availableLabel
      : row.status === 'coming_soon'
      ? tx.comingSoon
      : row.status === 'paused'
      ? L('Paused by farmer', 'రైతు నిలిపివేశారు')
      : row.status === 'suspended'
      ? L('Suspended', 'నిలిపివేయబడింది')
      : row.status === 'sold_out'
      ? L('Sold out', 'అయిపోయింది')
      : row.status
  const statusColor =
    row.status === 'available'
      ? 'bg-green-100 text-green-800'
      : row.status === 'coming_soon'
      ? 'bg-amber-100 text-amber-800'
      : row.status === 'paused'
      ? 'bg-purple-100 text-purple-800'
      : row.status === 'suspended'
      ? 'bg-orange-100 text-orange-800'
      : 'bg-gray-100 text-gray-700'
  // Farmer can pause/resume their own active or sold-out listings, but not ones
  // a moderator suspended or that are still coming soon.
  const canPause = row.status === 'available' || row.status === 'sold_out' || row.status === 'paused'

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
          </div>
        </div>
      </div>

      <div className="px-3 pb-3 space-y-2">

        {/* Pause — the farmer's reversible hide-from-buyers control, distinct
            from Delete. Flips to Resume once the listing is paused. */}
        {canPause && (
          <div className="flex gap-2">
            <button
              onClick={onTogglePause}
              className={`flex-1 font-bold py-2.5 rounded-xl text-sm border ${
                isPaused
                  ? 'border-green-600 text-green-700 active:bg-green-50'
                  : 'border-purple-300 text-purple-700 active:bg-purple-50'
              }`}
            >
              {isPaused ? L('▶ Resume', 'తిరిగి చూపించు') : L('⏸ Pause', 'అమ్మకం ఆపండి')}
            </button>
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
  const { tx, L } = useLang()
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
    const { data: inserted, error: insErr } = await supabase
      .from('media')
      .insert({ farmer_id: farmerId, type: 'photo', url: urlData.publicUrl, sort_order: photos.length })
      .select('id, url, caption')
      .single()

    // Surface a failed insert instead of swallowing it — a silent RLS rejection
    // here is exactly what made "Add Photo" appear to do nothing before.
    if (insErr || !inserted) {
      setError(`Could not save photo: ${insErr?.message ?? 'unknown error'}`)
      setUploading(false)
      return
    }
    setPhotos((prev) => [...prev, inserted as MediaRow])
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
          <p className="text-xs text-gray-400 mt-1">Add photos of your farm, fields, and harvests</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
              <NextImage src={photo.url} alt="" fill sizes="33vw" className="object-cover" />
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
  const { tx, L } = useLang()
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 border-4 border-green-700 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 text-sm">{tx.loadingLabel}</p>
      </div>
    </main>
  )
}

/* ─── Farmer not found ──────────────────────────────────────── */
function FarmerNotFound({ onLogout }: { onLogout: () => void }) {
  const { tx, L } = useLang()
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

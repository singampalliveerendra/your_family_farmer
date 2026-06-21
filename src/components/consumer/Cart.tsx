'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { useLang } from '@/lib/LanguageContext'
import { localizeName } from '@/lib/localizeName'
import { compressImage } from '@/lib/imageCompress'
import { DELIVERY_FEE_RUPEES } from '@/lib/delivery-fee'
import { formatPickupSlots, type PickupSchedule } from '@/lib/pickup-slots'

// Razorpay Checkout is loaded lazily — we only pull the script the first time
// a buyer chooses to pay online, so the rest of the catalogue stays light on
// slow connections.
const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'

type RazorpayResponse = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}
type RazorpayOptions = {
  key: string
  amount: number
  currency: string
  name: string
  description?: string
  order_id: string
  handler: (res: RazorpayResponse) => void
  prefill?: { name?: string; contact?: string }
  theme?: { color?: string }
  modal?: { ondismiss?: () => void }
}
type RazorpayInstance = { open: () => void }
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false)
    if (window.Razorpay) return resolve(true)
    const script = document.createElement('script')
    script.src = RAZORPAY_SCRIPT
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export type CartItem = {
  listingId: string
  qty: number
  name: string
  variety?: string
  emoji?: string
  pricePerKg?: number
  priceTier1Qty?: number
  priceTier1Price?: number
  priceTier2Qty?: number
  priceTier2Price?: number
  priceTier3Price?: number
  unit?: string
  stockQty?: number
  farmerId: string
  farmerName: string
  farmerPhone: string
  farmerVillage: string
  farmerSlug: string
  farmerPickupLocations?: string[]
  farmerPickupSlots?: PickupSchedule
  farmerUpiId?: string
  farmerQrCodeUrl?: string
}

export type CartState = Record<string, CartItem>

export type ConsumerInfo = { name: string; phone: string }

// Loose email check for guest checkout — just enough to catch typos.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CART_KEY = 'yff_cart_v1'
const CONSUMER_KEY = 'yff_consumer_v1'
const CART_EVENT = 'yff:cart-change'
const UPI_PENDING_KEY = 'yff_upi_pending_v1'
const UPI_LAUNCHED_KEY = 'yff_upi_launched_v1'

const readCart = (): CartState => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(CART_KEY)
    return raw ? (JSON.parse(raw) as CartState) : {}
  } catch {
    return {}
  }
}

const writeCart = (next: CartState) => {
  localStorage.setItem(CART_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(CART_EVENT))
}

function getActiveTier(qty: number, item: CartItem): { price?: number; isDiscount: boolean } {
  const { priceTier1Qty, priceTier1Price, priceTier2Qty, priceTier2Price, priceTier3Price } = item
  if (priceTier1Qty == null || priceTier1Price == null)
    return { price: item.pricePerKg, isDiscount: false }
  if (qty <= priceTier1Qty)
    return { price: priceTier1Price, isDiscount: false }
  if (priceTier2Qty != null && priceTier2Price != null) {
    if (qty <= priceTier2Qty) return { price: priceTier2Price, isDiscount: true }
    return { price: priceTier3Price ?? priceTier2Price, isDiscount: true }
  }
  if (priceTier3Price != null) return { price: priceTier3Price, isDiscount: true }
  return { price: priceTier1Price, isDiscount: false }
}

export function useCart() {
  const [cart, setCart] = useState<CartState>({})

  useEffect(() => {
    setCart(readCart())
    const sync = () => setCart(readCart())
    window.addEventListener(CART_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CART_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const addItem = useCallback((item: Omit<CartItem, 'qty'>, qty = 1) => {
    const next = { ...readCart() }
    const existing = next[item.listingId]
    const rawQty = Math.max(1, (existing?.qty ?? 0) + qty)
    const newQty = item.stockQty != null ? Math.min(rawQty, item.stockQty) : rawQty
    const merged = { ...item, qty: newQty }
    const { price } = getActiveTier(newQty, merged)
    next[item.listingId] = { ...merged, pricePerKg: price ?? item.pricePerKg }
    writeCart(next)
  }, [])

  const setQty = useCallback((listingId: string, qty: number) => {
    const next = { ...readCart() }
    if (qty <= 0) delete next[listingId]
    else if (next[listingId]) {
      const existing = next[listingId]
      const cappedQty = existing.stockQty != null ? Math.min(qty, existing.stockQty) : qty
      const updated = { ...existing, qty: cappedQty }
      const { price } = getActiveTier(cappedQty, updated)
      next[listingId] = { ...updated, pricePerKg: price ?? updated.pricePerKg }
    }
    writeCart(next)
  }, [])

  const removeItem = useCallback((listingId: string) => {
    const next = { ...readCart() }
    delete next[listingId]
    writeCart(next)
  }, [])

  const clear = useCallback(() => writeCart({}), [])

  const clearFarmer = useCallback((farmerId: string) => {
    const next = { ...readCart() }
    for (const key of Object.keys(next)) {
      if (next[key].farmerId === farmerId) delete next[key]
    }
    writeCart(next)
  }, [])

  const items = Object.values(cart)
  const count = items.reduce((sum, i) => sum + i.qty, 0)

  return { cart, items, count, addItem, setQty, removeItem, clear, clearFarmer }
}

export function useConsumerInfo() {
  const [info, setInfo] = useState<ConsumerInfo>({ name: '', phone: '' })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(CONSUMER_KEY)
      if (raw) setInfo(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  const save = useCallback((next: ConsumerInfo) => {
    setInfo(next)
    localStorage.setItem(CONSUMER_KEY, JSON.stringify(next))
  }, [])

  return { info, save }
}

type UpiPaymentState = {
  farmerName: string
  farmerVillage: string
  farmerPhone: string
  upiId: string
  qrCodeUrl?: string
  amount: number
  orderIds: string[]
  farmerId: string
  buyerName: string
  buyerPhone: string
  items: Array<{ name: string; variety?: string; emoji?: string; qty: number; unit?: string; pricePerKg?: number }>
  pickupLocation?: string
}

/* ─── Cart FAB ───────────────────────────────────────── */
// The cart now lives on its own full-screen route (/consumer/cart) instead of a
// bottom-sheet overlay, so it reads like a proper checkout page (Flipkart /
// Blinkit style). The FAB just navigates there.
export function CartFab() {
  const { count } = useCart()
  const { L } = useLang()
  const router = useRouter()

  // If a UPI payment was in progress (page refreshed mid-payment), send the
  // buyer straight to the cart page so they can finish / record it.
  useEffect(() => {
    const pending = localStorage.getItem(UPI_PENDING_KEY)
    const launched = localStorage.getItem(UPI_LAUNCHED_KEY)
    if (pending && launched) router.push('/consumer/cart')
  }, [router])

  if (count === 0) return null

  return (
    <button
      onClick={() => router.push('/consumer/cart')}
      className="fixed bottom-6 right-4 z-[60] bg-green-700 active:bg-green-800 text-white rounded-full shadow-2xl flex items-center gap-2 pl-4 pr-5 py-3.5"
      style={{ bottom: 'max(24px, env(safe-area-inset-bottom, 24px))' }}
      aria-label="View cart"
    >
      <CartIcon />
      <span className="font-extrabold text-sm">
        {count} {L(count === 1 ? 'item' : 'items', 'బుట్ట')}
      </span>
    </button>
  )
}

/* ─── Cart view (full-page route, or legacy bottom-sheet) ─ */
export function CartSheet({
  items,
  onClose,
  fullPage = false,
}: {
  items: CartItem[]
  onClose: () => void
  // When true, render as a full-screen page (the /consumer/cart route) with a
  // back arrow instead of a dimmed bottom-sheet overlay.
  fullPage?: boolean
}) {
  const { setQty, removeItem, clear, clearFarmer } = useCart()
  const { info, save: saveInfo } = useConsumerInfo()
  const { consumer, openAuth, requireAuth } = useConsumerAuth()
  const { lang, L } = useLang()
  // Guest checkout: when not logged in, the buyer also supplies an email and
  // (always) an address. `isGuest` flips the form into guest mode.
  const isGuest = !consumer
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'upi'>('upi')
  const [showMorePayment, setShowMorePayment] = useState(false)
  // Delivery preference (per checkout). For home_delivery, a flat
  // DELIVERY_FEE_RUPEES is charged once per cart (per farmer group at checkout)
  // and collected by the rider in cash on delivery, regardless of payment method.
  const [deliveryType, setDeliveryType] = useState<'self_pickup' | 'home_delivery'>('self_pickup')
  // Home delivery (the farmer ships it to the buyer) needs a destination
  // address; self-pickup does not.
  const needsAddress = deliveryType === 'home_delivery'
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryLandmark, setDeliveryLandmark] = useState('')
  const [deliveryPincode, setDeliveryPincode] = useState('')
  const [deliveryAltPhone, setDeliveryAltPhone] = useState('')
  const [sentFarmers, setSentFarmers] = useState<Record<string, boolean>>({})
  const [pickupByFarmer, setPickupByFarmer] = useState<Record<string, string>>({})
  const [toast, setToast] = useState('')
  const [placingUpiOrder, setPlacingUpiOrder] = useState<string | null>(null)
  const [submittingResult, setSubmittingResult] = useState(false)
  // One idempotency key per farmer checkout attempt. Kept until the order
  // actually saves, so a retry after a dropped response reuses the same key
  // and the server returns the existing order instead of placing a new one.
  const idempotencyKeys = useRef<Record<string, string>>({})
  const getIdempotencyKey = (farmerId: string): string => {
    if (!idempotencyKeys.current[farmerId]) {
      idempotencyKeys.current[farmerId] =
        (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    }
    return idempotencyKeys.current[farmerId]
  }
  const [paidDone, setPaidDone] = useState(false)
  // Live UPI IDs and QR codes fetched from DB — always up to date, overrides stale cart data
  const [liveUpiIds, setLiveUpiIds] = useState<Record<string, string>>({})
  const [liveQrUrls, setLiveQrUrls] = useState<Record<string, string>>({})
  // Live COD acceptance per farmer (default false until fetched)
  const [liveCodEnabled, setLiveCodEnabled] = useState<Record<string, boolean>>({})
  const [showUpiAppFallback, setShowUpiAppFallback] = useState(false)
  const [utrNote, setUtrNote] = useState('')
  // Mandatory payment screenshot upload (UPI flow)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofPreview, setProofPreview] = useState('')
  const [proofUploading, setProofUploading] = useState(false)
  const [proofUploaded, setProofUploaded] = useState(false)
  const [proofError, setProofError] = useState('')
  const [cashMode, setCashMode] = useState(false)
  const [switchingToCash, setSwitchingToCash] = useState(false)
  const [upiScreen, setUpiScreen] = useState<UpiPaymentState | null>(null)
  // Razorpay online payment: which farmer group is mid-payment, and whether
  // the latest order was paid online (drives the success copy below).
  const [payingOnline, setPayingOnline] = useState<string | null>(null)
  const [onlinePaid, setOnlinePaid] = useState(false)

  // Refs for use inside event listeners (avoids stale closures)
  const upiScreenRef = useRef<UpiPaymentState | null>(null)
  const autoTriggeredRef = useRef(false)

  useEffect(() => { upiScreenRef.current = upiScreen }, [upiScreen])

  // Update payment status to claimed and clear cart. The farmer is alerted via
  // the realtime subscription on their dashboard — no WhatsApp message opened.
  const triggerPostPayment = useCallback(async (screen: UpiPaymentState, utrRef: string) => {
    setSubmittingResult(true)
    const updateData: Record<string, unknown> = { payment_status: 'pending_confirmation' }
    if (utrRef.trim()) updateData.utr_number = utrRef.trim()
    await Promise.all(
      screen.orderIds.map((id) =>
        supabase.from('orders').update(updateData).eq('id', id)
      )
    )
    clearFarmer(screen.farmerId)
    localStorage.removeItem(UPI_PENDING_KEY)
    localStorage.removeItem(UPI_LAUNCHED_KEY)
    setSubmittingResult(false)
    setPaidDone(true)
  }, [clearFarmer])

  // Keep a ref to triggerPostPayment so visibilitychange handler is never stale
  const triggerPostPaymentRef = useRef(triggerPostPayment)
  useEffect(() => { triggerPostPaymentRef.current = triggerPostPayment }, [triggerPostPayment])

  // On mount: only restore payment screen when UPI app was actually launched.
  // If launched is missing the user just viewed (or closed) the payment screen — don't restore.
  useEffect(() => {
    const pending = localStorage.getItem(UPI_PENDING_KEY)
    const launched = localStorage.getItem(UPI_LAUNCHED_KEY)
    if (!pending || !launched) return
    try {
      const saved = JSON.parse(pending) as UpiPaymentState
      setUpiScreen(saved)
      if (!autoTriggeredRef.current) {
        autoTriggeredRef.current = true
        triggerPostPayment(saved, '')
      }
    } catch { /* ignore corrupt data */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs once on mount only

  // Persist upiScreen to localStorage whenever it changes
  useEffect(() => {
    if (upiScreen) localStorage.setItem(UPI_PENDING_KEY, JSON.stringify(upiScreen))
  }, [upiScreen])

  // When user returns from UPI app (no page reload): auto-trigger WhatsApp
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (!localStorage.getItem(UPI_LAUNCHED_KEY)) return
      if (autoTriggeredRef.current) return
      const screen = upiScreenRef.current
      if (!screen) return
      autoTriggeredRef.current = true
      triggerPostPaymentRef.current(screen, '')
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // Fetch latest UPI IDs and QR codes for all farmers in cart when sheet opens
  useEffect(() => {
    const farmerIds = [...new Set(items.map((i) => i.farmerId).filter(Boolean))]
    if (farmerIds.length === 0) return
    supabase
      .from('farmers')
      .select('id, upi_id, upi_qr_code_url, cod_enabled')
      .in('id', farmerIds)
      .then(({ data }) => {
        if (!data) return
        const upiMap: Record<string, string> = {}
        const qrMap: Record<string, string> = {}
        const codMap: Record<string, boolean> = {}
        for (const f of data) {
          if (f.upi_id) upiMap[f.id] = f.upi_id
          if (f.upi_qr_code_url) qrMap[f.id] = f.upi_qr_code_url
          codMap[f.id] = f.cod_enabled === true
        }
        setLiveUpiIds(upiMap)
        setLiveQrUrls(qrMap)
        setLiveCodEnabled(codMap)
      })
  }, [items])

  useEffect(() => {
    setName(info.name)
    setPhone(info.phone)
  }, [info])

  // When the consumer logs in, prefer their authenticated profile over any
  // stale form data from the legacy localStorage entry.
  useEffect(() => {
    if (!consumer) return
    if (consumer.name) setName(consumer.name)
    if (consumer.phone) setPhone(consumer.phone)
  }, [consumer])

  // Group items by farmer
  const byFarmer = items.reduce<Record<string, CartItem[]>>((acc, item) => {
    (acc[item.farmerId] = acc[item.farmerId] ?? []).push(item)
    return acc
  }, {})
  const farmerGroups = Object.values(byFarmer)

  const baseDetailsMissing = !name.trim() || phone.replace(/\D/g, '').length < 10
  const deliveryDetailsMissing = needsAddress
    && (deliveryAddress.trim().length < 10 || !/^\d{6}$/.test(deliveryPincode.trim()))
  const detailsMissing = baseDetailsMissing || deliveryDetailsMissing

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // Server-authoritative order placement. Prices, buyer identity, and COD
  // permission are computed/checked on the server using the consumer's
  // session cookie — never trusted from the cart's client-side state.
  const placeOrderViaApi = async (
    group: CartItem[],
    paymentMethod: 'upi' | 'cod' | 'razorpay',
  ): Promise<{ ok: true; orderIds: string[]; total: number } | { ok: false; error: string }> => {
    const f = group[0]
    const r = await fetch('/api/orders/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        farmerId: f.farmerId,
        paymentMethod,
        pickupLocation: deliveryType === 'self_pickup' ? (pickupByFarmer[f.farmerId] || null) : null,
        items: group.map((it) => ({ listingId: it.listingId, qty: it.qty })),
        deliveryType,
        deliveryAddress: needsAddress ? deliveryAddress.trim() : null,
        deliveryLandmark: needsAddress ? deliveryLandmark.trim() : null,
        deliveryPincode: needsAddress ? deliveryPincode.trim() : null,
        deliveryAltPhone: needsAddress ? deliveryAltPhone.replace(/\D/g, '').slice(-10) : null,
        idempotencyKey: getIdempotencyKey(f.farmerId),
      }),
    }).catch(() => null)
    if (!r) return { ok: false, error: 'Network error. Please try again.' }
    const json = await r.json().catch(() => ({}))
    if (!r.ok || !json?.ok) return { ok: false, error: json?.error ?? 'Could not place order.' }
    // Order saved — drop the key so a genuinely new order later gets a fresh one.
    delete idempotencyKeys.current[f.farmerId]
    return { ok: true, orderIds: json.orderIds, total: json.total }
  }

  // COD flow: save order via server endpoint. Farmer is alerted via realtime
  // subscription on their dashboard — no WhatsApp opened on the consumer side.
  const handleCodOrderFarmer = async (group: CartItem[]) => {
    if (detailsMissing) return
    saveInfo({ name: name.trim(), phone: phone.trim() })
    const f = group[0]
    const result = await placeOrderViaApi(group, 'cod')
    if (!result.ok) {
      showToast(result.error)
      return
    }
    clearFarmer(f.farmerId)
    setSentFarmers((s) => ({ ...s, [f.farmerId]: true }))
  }

  // UPI flow: save orders via server endpoint, then show the payment screen.
  const handleUpiOrderFarmer = async (group: CartItem[]) => {
    if (detailsMissing) return
    const f = group[0]
    const upiId = liveUpiIds[f.farmerId] ?? f.farmerUpiId ?? ''
    const qrCodeUrl = liveQrUrls[f.farmerId] ?? f.farmerQrCodeUrl
    if (!upiId && !qrCodeUrl) return

    setUtrNote('')
    setShowUpiAppFallback(false)
    setCashMode(false)
    // Fresh UPI session — clear any previous screenshot state
    if (proofPreview) URL.revokeObjectURL(proofPreview)
    setProofFile(null)
    setProofPreview('')
    setProofUploaded(false)
    setProofUploading(false)
    setProofError('')
    saveInfo({ name: name.trim(), phone: phone.trim() })
    setPlacingUpiOrder(f.farmerId)

    const buyerPhone = phone.replace(/\D/g, '').slice(-10)
    const result = await placeOrderViaApi(group, 'upi')
    setPlacingUpiOrder(null)

    if (!result.ok) {
      showToast(result.error)
      return
    }

    autoTriggeredRef.current = false
    setUpiScreen({
      farmerName: f.farmerName,
      farmerVillage: f.farmerVillage,
      farmerPhone: f.farmerPhone,
      upiId,
      qrCodeUrl,
      amount: result.total,
      orderIds: result.orderIds,
      farmerId: f.farmerId,
      buyerName: name.trim(),
      buyerPhone: buyerPhone,
      items: group.map((it) => ({
        name: it.name,
        variety: it.variety,
        emoji: it.emoji,
        qty: it.qty,
        unit: it.unit,
        pricePerKg: it.pricePerKg,
      })),
      pickupLocation: deliveryType === 'self_pickup' ? (pickupByFarmer[f.farmerId] || undefined) : undefined,
    })
  }

  // Online flow (Razorpay): place orders → create a Razorpay order → open
  // Checkout → verify the signature server-side → show success. Money is
  // collected into the platform's Razorpay account, not the farmer's UPI.
  const handleRazorpayOrderFarmer = async (group: CartItem[]) => {
    if (detailsMissing) return
    const f = group[0]
    saveInfo({ name: name.trim(), phone: phone.trim() })
    setPayingOnline(f.farmerId)

    const buyerPhone = phone.replace(/\D/g, '').slice(-10)

    // 1. Place the orders (status pending) on the server.
    const result = await placeOrderViaApi(group, 'razorpay')
    if (!result.ok) {
      setPayingOnline(null)
      showToast(result.error)
      return
    }

    // 2. Load Checkout and create the matching Razorpay order in parallel.
    const [scriptOk, createRes] = await Promise.all([
      loadRazorpayScript(),
      fetch('/api/orders/razorpay/create', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: result.orderIds }),
      })
        .then((r) => r.json().catch(() => null))
        .catch(() => null),
    ])

    if (!scriptOk || !window.Razorpay) {
      setPayingOnline(null)
      showToast('Could not load the payment screen. Check your connection.')
      return
    }
    if (!createRes?.ok) {
      setPayingOnline(null)
      showToast(createRes?.error ?? 'Could not start payment. Please try again.')
      return
    }

    // Order summary kept for the success screen once payment verifies.
    const summary: UpiPaymentState = {
      farmerName: f.farmerName,
      farmerVillage: f.farmerVillage,
      farmerPhone: f.farmerPhone,
      upiId: '',
      amount: result.total,
      orderIds: result.orderIds,
      farmerId: f.farmerId,
      buyerName: name.trim(),
      buyerPhone,
      items: group.map((it) => ({
        name: it.name,
        variety: it.variety,
        emoji: it.emoji,
        qty: it.qty,
        unit: it.unit,
        pricePerKg: it.pricePerKg,
      })),
    }

    // 3. Open Razorpay Checkout.
    const rzp = new window.Razorpay({
      key: createRes.keyId,
      amount: createRes.amount,
      currency: createRes.currency,
      name: f.farmerName,
      description: 'YourFamilyFarmer order',
      order_id: createRes.razorpayOrderId,
      prefill: { name: name.trim(), contact: buyerPhone },
      theme: { color: '#15803d' },
      modal: {
        ondismiss: () => {
          // Buyer closed Checkout without paying. The orders stay pending so
          // they can pay later from their orders page — nothing to undo here.
          setPayingOnline(null)
          showToast('Payment cancelled. Your order is saved as unpaid.')
        },
      },
      handler: async (res) => {
        // 4. Verify the signature server-side before trusting the payment.
        const vr = await fetch('/api/orders/razorpay/verify', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpayOrderId: res.razorpay_order_id,
            razorpayPaymentId: res.razorpay_payment_id,
            razorpaySignature: res.razorpay_signature,
          }),
        })
          .then((r) => r.json().catch(() => null))
          .catch(() => null)

        setPayingOnline(null)
        if (!vr?.ok) {
          showToast(vr?.error ?? 'Payment could not be verified. Please contact support.')
          return
        }
        clearFarmer(f.farmerId)
        setOnlinePaid(true)
        setUpiScreen(summary)
        setPaidDone(true)
      },
    })
    rzp.open()
  }

  const handlePickProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file after error
    if (!raw) return
    if (!raw.type.startsWith('image/')) {
      setProofError(L('Please pick an image (JPG/PNG/WEBP).', 'దయచేసి చిత్రం ఎంచుకోండి.'))
      return
    }
    if (raw.size > 12 * 1024 * 1024) {
      setProofError('Screenshot too large (max 12MB before compression).')
      return
    }
    setProofError('')
    if (proofPreview) URL.revokeObjectURL(proofPreview)
    setProofUploaded(false)
    const compressed = await compressImage(raw, 1400, 0.75)
    setProofFile(compressed)
    setProofPreview(URL.createObjectURL(compressed))

    // Auto-upload immediately so the user knows it's saved before they tap "I Have Paid"
    if (!upiScreen) return
    setProofUploading(true)
    const fd = new FormData()
    fd.append('orderIds', upiScreen.orderIds.join(','))
    fd.append('file', compressed)
    const r = await fetch('/api/orders/upload-proof', {
      method: 'POST',
      body: fd,
      credentials: 'same-origin',
    }).catch(() => null)
    setProofUploading(false)
    if (!r) {
      setProofError('Upload failed — check your connection and try again.')
      return
    }
    const json = await r.json().catch(() => ({}))
    if (!r.ok || !json?.ok) {
      setProofError(json?.error ?? 'Upload failed.')
      return
    }
    setProofUploaded(true)
  }

  const handlePaymentSuccess = async () => {
    if (!upiScreen) return
    if (!proofUploaded) {
      setProofError('Please attach your payment screenshot first.')
      return
    }
    await triggerPostPayment(upiScreen, utrNote)
  }

  const handleCashOnPickup = async () => {
    if (!upiScreen) return
    setSwitchingToCash(true)
    await Promise.all(
      upiScreen.orderIds.map((id) =>
        supabase.from('orders').update({ payment_method: 'cod', payment_status: 'pending' }).eq('id', id)
      )
    )
    clearFarmer(upiScreen.farmerId)
    localStorage.removeItem(UPI_PENDING_KEY)
    localStorage.removeItem(UPI_LAUNCHED_KEY)
    setSwitchingToCash(false)
    setCashMode(true)
    setPaidDone(true)
  }

  const handleOpenUpiApp = () => {
    localStorage.setItem(UPI_LAUNCHED_KEY, '1')
    setShowUpiAppFallback(false)
    // target="_blank" keeps the current page alive when the OS hands off to the UPI app
    const a = document.createElement('a')
    a.href = 'upi://pay'
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => setShowUpiAppFallback(true), 2500)
  }

  const handleDownloadQR = async () => {
    if (!upiScreen?.qrCodeUrl) return
    try {
      const response = await fetch(upiScreen.qrCodeUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${upiScreen.farmerName.replace(/\s+/g, '_')}_UPI_QR.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast(L('QR saved!', 'గ్యాలరీకి సేవ్ అయింది'))
    } catch {
      showToast('Could not save — please screenshot the QR')
    }
  }

  // Shell chrome — full-page route (/consumer/cart) vs the legacy dimmed
  // bottom-sheet overlay. The route version reads like a proper checkout page.
  const shellOuter = fullPage
    ? 'min-h-screen bg-gray-50'
    : 'fixed inset-0 z-[200] bg-black/50 flex items-end justify-center'
  const shellInner = fullPage
    ? 'bg-white w-full max-w-md mx-auto min-h-screen flex flex-col'
    : 'bg-white w-full max-w-md rounded-t-3xl max-h-[92vh] flex flex-col'
  const shellInnerCentered = fullPage
    ? 'bg-white w-full max-w-md mx-auto min-h-screen px-6 py-10 flex flex-col items-center justify-center text-center gap-4'
    : 'bg-white w-full max-w-md rounded-t-3xl px-6 py-10 flex flex-col items-center text-center gap-4'
  const headerRound = fullPage ? '' : 'rounded-t-3xl'

  // Success screen — shown after I Have Paid or Cash on Pickup
  if (upiScreen && paidDone) {
    return (
      <div className={shellOuter}>
        <div className={shellInnerCentered}>
          <div className="relative w-16 h-16">
            <span className={`order-success-ring ${cashMode ? 'bg-amber-300' : 'bg-green-300'}`} aria-hidden />
            <div className={`order-success-icon relative w-16 h-16 rounded-full flex items-center justify-center text-3xl font-black ${cashMode ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
              {cashMode ? '💵' : '✓'}
            </div>
          </div>
          <div className="order-success-rise">
            <h2 className="font-extrabold text-gray-900 text-xl">
              {cashMode ? 'Order placed!' : onlinePaid ? 'Payment successful!' : 'Payment recorded!'}
            </h2>
            <p className={`font-semibold mt-0.5 ${cashMode ? 'text-amber-700' : 'text-green-700'}`}>
              {cashMode
                ? L('Cash on Pickup', 'నగదు పికప్')
                : onlinePaid
                  ? L('Paid online', 'ఆన్‌లైన్ చెల్లింపు')
                  : L('Payment recorded!', 'చెల్లింపు నమోదైంది!')}
            </p>
          </div>
          <div className="bg-gray-50 rounded-2xl px-5 py-4 w-full text-left space-y-1">
            <p className="text-xs text-gray-500 font-medium">{cashMode ? 'Order for' : 'Paid to'}</p>
            <p className="font-bold text-gray-900">{upiScreen.farmerName}</p>
            <p className="text-xs text-gray-500">{upiScreen.farmerVillage}</p>
            <p className="text-lg font-black text-green-900 mt-2">₹{upiScreen.amount}</p>
          </div>
          {cashMode ? (
            <p className="text-sm text-gray-600 leading-snug">
              Pay ₹{upiScreen.amount} in cash when you collect your order from the farmer.
            </p>
          ) : onlinePaid ? (
            <>
              <p className="text-sm text-gray-600 leading-snug">
                {L('Payment confirmed', 'చెల్లింపు నిర్ధారించబడింది')}
              </p>
              <p className="text-xs text-gray-400 leading-snug">
                The farmer has been notified and will prepare your order.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 leading-snug">
                {L('Waiting for farmer confirmation', 'రైతు నిర్ధారణ కోసం వేచి ఉంది')}
              </p>
              <p className="text-xs text-gray-400 leading-snug">
                The farmer will check their UPI app and confirm your payment.
              </p>
            </>
          )}
          <Link
            href="/consumer/orders"
            className="w-full text-center text-sm font-semibold text-green-700 underline"
          >
            {L('Check order status', 'ఆర్డర్ స్థితి చూడండి')}
          </Link>
          <button
            onClick={onClose}
            className="w-full bg-green-700 text-white font-bold py-4 rounded-xl text-base active:bg-green-800"
          >
            {L('Done', 'మూసివేయి')}
          </button>
        </div>
      </div>
    )
  }

  // Payment screen shown after placing an order
  if (upiScreen) {
    return (
      <div className={shellOuter}>
        <div className={shellInner}>
          <div className={`sticky top-0 z-10 bg-white flex items-center gap-2 px-4 py-3 border-b border-gray-100 ${headerRound}`}>
            {fullPage && (
              <button onClick={onClose} className="text-gray-600 text-2xl leading-none p-1 -ml-1" aria-label="Back">←</button>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-extrabold text-gray-900 text-lg">{L('Pay Farmer', 'రైతుకు చెల్లించండి')}</h2>
              <p className="text-xs text-gray-500">Pay directly — no middleman</p>
            </div>
            {!fullPage && (
              <button onClick={onClose} className="text-gray-400 text-3xl leading-none p-1">×</button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
            {/* Amount + farmer */}
            <div className="bg-green-50 rounded-2xl p-4 text-center">
              <p className="text-sm font-bold text-green-700">🧑‍🌾 {upiScreen.farmerName}</p>
              <p className="text-xs text-green-600 mt-0.5">{upiScreen.farmerVillage}</p>
              <p className="text-4xl font-black text-green-900 mt-3">₹{upiScreen.amount}</p>
              <p className="text-sm text-green-700 mt-1">Total amount to pay</p>
            </div>

            {/* QR code (if available) */}
            {upiScreen.qrCodeUrl && (
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 flex flex-col items-center gap-2">
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Scan QR Code to Pay</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={upiScreen.qrCodeUrl} alt="UPI QR Code" className="w-48 h-48 object-contain rounded-xl" />
                <p className="text-[11px] text-gray-500 text-center">{L('Open any UPI app → Scan QR', 'QR స్కాన్ చేయండి')}</p>
                <button
                  onClick={handleDownloadQR}
                  className="w-full border border-gray-300 text-gray-700 font-bold py-2.5 rounded-xl text-sm active:bg-gray-50 flex items-center justify-center gap-1.5 mt-1"
                >
                  <span>⬇️</span> {L('Save QR to Gallery', 'గ్యాలరీకి సేవ్ చేయండి')}
                </button>
              </div>
            )}

            {/* UPI pay instructions */}
            {upiScreen.upiId && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-4 space-y-3">
                <p className="text-xs font-extrabold text-blue-800 uppercase tracking-wide">
                  {L('How to pay', 'చెల్లింపు విధానం')}
                </p>

                {/* Steps */}
                <ol className="space-y-2.5">
                  <li className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">1</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{L('Copy the UPI ID below', 'క్రింద ఉన్న UPI ID కాపీ చేయండి')}</p>
                    </div>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">2</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{L('Open your UPI app (PhonePe / GPay / Paytm)', 'మీ UPI యాప్ తెరవండి')}</p>
                    </div>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">3</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{L('Tap "Pay" → "Enter UPI ID" → paste the ID', '"Pay" నొక్కి → "UPI ID" నమోదు చేసి → పేస్ట్ చేయండి')}</p>
                    </div>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">4</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{L(`Enter ₹${upiScreen.amount} and complete payment`, `₹${upiScreen.amount} నమోదు చేసి చెల్లింపు పూర్తి చేయండి`)}</p>
                    </div>
                  </li>
                </ol>

                {/* UPI ID copy row */}
                <div className="bg-white border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-gray-500 mb-0.5 uppercase tracking-wide">UPI ID</p>
                    <p className="font-mono text-sm font-bold text-gray-900 break-all">{upiScreen.upiId}</p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(upiScreen.upiId).catch(() => {})
                      showToast(L('UPI ID copied!', 'కాపీ అయింది'))
                    }}
                    className="flex-shrink-0 bg-blue-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs active:bg-blue-700"
                  >
                    {L('Copy', 'కాపీ')}
                  </button>
                </div>

                {/* Open UPI App button */}
                <button
                  onClick={handleOpenUpiApp}
                  className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl text-base active:bg-blue-700 flex items-center justify-center gap-2"
                >
                  {L('📲 Open UPI App', 'UPI యాప్ తెరవండి')}
                </button>

                {showUpiAppFallback && (
                  <p className="text-xs text-blue-700 text-center">
                    {L('App didn\'t open? Copy the UPI ID and pay manually in PhonePe, GPay, or Paytm.', 'యాప్ తెరుచుకోలేదా? UPI ID కాపీ చేసి మాన్యువల్‌గా చెల్లించండి.')}
                  </p>
                )}
              </div>
            )}

            {/* Optional transaction note */}
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">
                {L('Transaction note (optional)', 'లావాదేవీ నోట్')}
              </label>
              <input
                type="text"
                inputMode="text"
                placeholder="e.g. GPay ref 123456"
                value={utrNote}
                onChange={(e) => setUtrNote(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none"
              />
            </div>

            {/* Mandatory payment screenshot */}
            <div className={`rounded-2xl p-4 border-2 ${proofUploaded ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
              <p className="text-xs font-extrabold uppercase tracking-wide mb-1.5 text-amber-800">
                {L('Payment screenshot (required)', 'చెల్లింపు స్క్రీన్‌షాట్ తప్పనిసరి')}
              </p>
              <p className="text-[11px] text-gray-600 mb-3 leading-snug">
                {L('Attach the success screen from your UPI app so the farmer can verify.', 'మీ UPI యాప్ నుండి సక్సెస్ స్క్రీన్‌షాట్ జతచేయండి.')}
              </p>

              {proofPreview ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proofPreview}
                    alt="Payment screenshot"
                    className="w-full max-h-64 object-contain rounded-xl border border-gray-200 bg-white"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold ${proofUploaded ? 'text-green-700' : 'text-amber-700'}`}>
                      {proofUploading
                        ? L('Uploading...', 'అప్‌లోడ్ అవుతోంది...')
                        : proofUploaded
                          ? L('✓ Saved', 'సేవ్ అయింది')
                          : 'Not uploaded yet'}
                    </span>
                    <label className="text-xs font-bold text-blue-700 underline cursor-pointer">
                      {L('Change', 'మార్చండి')}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handlePickProof}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="w-full bg-white border-2 border-dashed border-amber-400 text-amber-800 font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer active:bg-amber-100">
                  {L('📎 Attach screenshot', 'స్క్రీన్‌షాట్ జతచేయండి')}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handlePickProof}
                  />
                </label>
              )}

              {proofError && (
                <p className="text-xs text-red-700 mt-2 font-semibold">{proofError}</p>
              )}
            </div>

            {/* I Have Paid */}
            <button
              onClick={handlePaymentSuccess}
              disabled={submittingResult || proofUploading || !proofUploaded}
              className="w-full bg-green-700 text-white font-bold py-4 rounded-xl text-base disabled:opacity-50 active:bg-green-800"
            >
              {submittingResult
                ? 'Saving...'
                : proofUploading
                  ? 'Uploading screenshot...'
                  : !proofUploaded
                    ? L('Attach screenshot first', 'మొదట స్క్రీన్‌షాట్ జతచేయండి')
                    : L('✓ I Have Paid', 'చెల్లించాను')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={shellOuter}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 left-0 right-0 flex justify-center z-[210] pointer-events-none px-4">
          <div className="bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-xl">
            {toast}
          </div>
        </div>
      )}
      <div className={shellInner}>
        {/* Header */}
        <div className={`sticky top-0 z-10 bg-white flex items-center gap-2 px-4 py-3 border-b border-gray-100 ${headerRound}`}>
          {fullPage && (
            <button onClick={onClose} className="text-gray-600 text-2xl leading-none p-1 -ml-1" aria-label="Back">←</button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-extrabold text-gray-900 text-lg">{L('Your cart', 'మీ బుట్ట')}</h2>
            <p className="text-xs text-gray-500">
              {deliveryType === 'home_delivery'
                ? L('Home delivery', 'ఇంటికి డెలివరీ')
                : L('Self pickup from farm', 'పొలం నుండి స్వీయ పికప్')}
            </p>
          </div>
          {!fullPage && (
            <button onClick={onClose} className="text-gray-400 text-3xl leading-none p-1">×</button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {items.length === 0 ? (
            <div className="text-center py-14 text-gray-400">
              <div className="text-5xl mb-3">🛒</div>
              <p className="font-semibold">{L('Your cart is empty', 'బుట్ట ఖాళీగా ఉంది')}</p>
              <Link href="/consumer" className="mt-4 inline-block text-green-700 text-sm font-bold underline">
                {L('Browse produce →', 'పంట చూడండి →')}
              </Link>
            </div>
          ) : (
            <>
              {/* Consumer details */}
              <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
                    {L('Your name', 'మీ పేరు')}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ramya"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
                    {L('Your WhatsApp number', 'వాట్సాప్ నంబర్')}
                  </label>
                  <div className="flex gap-2">
                    <span className="flex items-center px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 font-medium">
                      +91
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="9876543210"
                      maxLength={10}
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-green-500 focus:outline-none bg-white"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 leading-snug">
                  {L('The farmer needs this to confirm pickup time.', 'పికప్ సమయం కోసం రైతుకు ఇది అవసరం.')}
                </p>
              </div>

              {/* Delivery choice — pickup-self (free) or home delivery. The
                  delivery charge is collected by the owner manually for now,
                  so we don't add a fee here. */}
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                  {L('How will you receive your order?', 'ఎలా అందుకుంటారు?')}
                </p>
                <button
                  type="button"
                  onClick={() => setDeliveryType('self_pickup')}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-sm font-bold transition-colors ${
                    deliveryType === 'self_pickup'
                      ? 'border-green-600 bg-green-50 text-green-900'
                      : 'border-gray-200 bg-white text-gray-700'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base">🚶</span>
                    {L('I will pick up', 'నేను తీసుకుంటాను')}
                  </span>
                  {deliveryType === 'self_pickup' && <span className="text-green-600 text-base">✓</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryType('home_delivery')}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-sm font-bold transition-colors ${
                    deliveryType === 'home_delivery'
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-gray-200 bg-white text-gray-700'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base">🛵</span>
                    {L('Home delivery', 'ఇంటికి డెలివరీ')}
                  </span>
                  {deliveryType === 'home_delivery' && <span className="text-blue-600 text-base">✓</span>}
                </button>
                {deliveryType === 'home_delivery' && (
                  <p className="text-[11px] text-blue-700 bg-blue-50 rounded-xl px-3 py-2 leading-snug">
                    {L(
                      'The farmer ships it to your address. Confirm receipt on your order page once it arrives.',
                      'రైతు మీ చిరునామాకు పంపుతారు. అందిన తర్వాత మీ ఆర్డర్ పేజీలో ధృవీకరించండి.',
                    )}
                  </p>
                )}
              </div>

              {/* Address form — needed for home delivery and farmer courier */}
              {needsAddress && (
                <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                    {L('Delivery address', 'డెలివరీ చిరునామా')}
                  </p>
                  <div>
                    <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1">
                      Full address (door no, street, area)
                    </label>
                    <textarea
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value.slice(0, 400))}
                      rows={3}
                      placeholder="H.No 12-3, Main Road, Anand Nagar"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-green-500 focus:outline-none resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1">
                      {L('Landmark (optional)', 'గుర్తు')}
                    </label>
                    <input
                      type="text"
                      value={deliveryLandmark}
                      onChange={(e) => setDeliveryLandmark(e.target.value.slice(0, 200))}
                      placeholder="Near the temple"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-green-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1">
                      {L('PIN code', 'పిన్ కోడ్')}
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={deliveryPincode}
                      onChange={(e) => setDeliveryPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      placeholder="522001"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-green-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1">
                      Alternate phone (optional)
                    </label>
                    <div className="flex gap-2">
                      <span className="flex items-center px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 font-medium">
                        +91
                      </span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={deliveryAltPhone}
                        onChange={(e) => setDeliveryAltPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        maxLength={10}
                        placeholder="Family member / spouse"
                        className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:border-green-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  {deliveryDetailsMissing && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
                      Please fill the full address and a valid 6-digit pincode.
                    </p>
                  )}
                </div>
              )}

              {/* Payment method selection — COD only shown if at least one farmer accepts it */}
              {(() => {
                const anyFarmerAcceptsCod = farmerGroups.some((g) => liveCodEnabled[g[0].farmerId])
                if (!anyFarmerAcceptsCod && paymentMethod === 'cod') {
                  // Defensive: ensure UPI is selected when no farmer in cart accepts COD
                  setTimeout(() => setPaymentMethod('upi'), 0)
                }
                return (
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                      {L('Payment method', 'చెల్లింపు విధానం')}
                    </p>
                    <button
                      onClick={() => setPaymentMethod('upi')}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-sm font-bold transition-colors ${
                        paymentMethod === 'upi'
                          ? 'border-blue-600 bg-blue-50 text-blue-900'
                          : 'border-gray-200 bg-white text-gray-700'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-base">💳</span>
                        {L('Pay Online (UPI / Card)', 'ఆన్‌లైన్ చెల్లింపు (UPI / కార్డ్)')}
                      </span>
                      {paymentMethod === 'upi' && (
                        <span className="text-blue-600 text-base">✓</span>
                      )}
                    </button>
                    {anyFarmerAcceptsCod && (
                      showMorePayment ? (
                        <button
                          onClick={() => setPaymentMethod('cod')}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-sm font-bold transition-colors ${
                            paymentMethod === 'cod'
                              ? 'border-green-600 bg-green-50 text-green-900'
                              : 'border-gray-200 bg-white text-gray-700'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-base">💵</span>
                            {L('Cash on Delivery', 'నగదు చెల్లింపు')}
                          </span>
                          {paymentMethod === 'cod' && (
                            <span className="text-green-600 text-base">✓</span>
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowMorePayment(true)}
                          className="w-full text-xs text-gray-400 py-1 text-center active:text-gray-600"
                        >
                          {L('+ More options', 'మరిన్ని ఎంపికలు')}
                        </button>
                      )
                    )}
                  </div>
                )
              })()}

              {/* Farmer groups */}
              {farmerGroups.map((group) => {
                const f = group[0]
                const total = group.reduce(
                  (s, it) => s + (it.pricePerKg ?? 0) * it.qty,
                  0,
                )
                const sent = sentFarmers[f.farmerId]
                // For self-pickup, a pickup point is mandatory when the farmer
                // offers them. It's irrelevant (and disabled) for delivery/courier.
                const pickupRequired =
                  deliveryType === 'self_pickup' && (f.farmerPickupLocations?.length ?? 0) > 0
                const pickupMissing = pickupRequired && !pickupByFarmer[f.farmerId]
                const groupDetailsMissing = detailsMissing || pickupMissing
                return (
                  <div
                    key={f.farmerId}
                    className="border border-gray-200 rounded-2xl overflow-hidden"
                  >
                    <div className="bg-green-50 px-4 py-3 border-b border-green-100 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-extrabold text-green-900 truncate">
                          🧑‍🌾 {f.farmerName}
                        </p>
                        <p className="text-xs text-green-700">📍 {f.farmerVillage}</p>
                      </div>
                      <span className={`text-[10px] font-bold text-white px-2 py-1 rounded-full whitespace-nowrap ${deliveryType === 'home_delivery' ? 'bg-blue-600' : 'bg-green-700'}`}>
                        {deliveryType === 'home_delivery' ? '🛵 Delivery' : 'Pickup'}
                      </span>
                    </div>

                    <div className="p-3 space-y-2">
                      {group.map((it) => (
                        <div key={it.listingId} className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center text-xl flex-shrink-0">
                            {it.emoji ?? '🌿'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gray-900 truncate">
                              {localizeName(it.name, lang)}
                            </p>
                            {it.pricePerKg && (
                              <p className="text-xs text-gray-500">₹{it.pricePerKg}/{it.unit || 'kg'}</p>
                            )}
                            {getActiveTier(it.qty, it).isDiscount && (
                              <p className="text-[10px] font-semibold text-green-700 mt-0.5">
                                {L('Bulk price applied', 'బల్క్ ధర వర్తింపు')}
                              </p>
                            )}
                          </div>
                          <QtyStepper
                            qty={it.qty}
                            maxQty={it.stockQty}
                            onDec={() => setQty(it.listingId, it.qty - 1)}
                            onInc={() => {
                              if (it.stockQty != null && it.qty >= it.stockQty) {
                                showToast(L('No more stock available', 'స్టాక్ అయిపోయింది'))
                                return
                              }
                              setQty(it.listingId, it.qty + 1)
                            }}
                          />
                          <button
                            onClick={() => removeItem(it.listingId)}
                            className="text-gray-300 text-xl px-1"
                            aria-label="Remove"
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      {total > 0 && (
                        deliveryType === 'home_delivery' && DELIVERY_FEE_RUPEES > 0 ? (
                          <div className="pt-2 border-t border-gray-100 mt-2 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-500">{L('Subtotal', 'ఉత్పత్తి')}</span>
                              <span className="font-semibold text-gray-800">₹{total}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-500">
                                {L('Delivery fee', 'డెలివరీ ఛార్జ్')}
                                <span className="block text-[10px] text-gray-400">{L('cash to rider', 'రైడర్‌కి నగదు')}</span>
                              </span>
                              <span className="font-semibold text-gray-800">₹{DELIVERY_FEE_RUPEES}</span>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-gray-50">
                              <span className="text-xs font-bold text-gray-700">{L('Total', 'మొత్తం')}</span>
                              <span className="font-extrabold text-gray-900">
                                ₹{total + DELIVERY_FEE_RUPEES}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-2">
                            <span className="text-xs text-gray-500">{L('Estimated total', 'మొత్తం')}</span>
                            <span className="font-extrabold text-gray-900">
                              ₹{total}
                            </span>
                          </div>
                        )
                      )}

                      {f.farmerPickupLocations && f.farmerPickupLocations.length > 0 && (
                        <div className="pt-2">
                          <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1">
                            {L('Pickup location', 'పికప్ స్థలం')}
                            {deliveryType === 'self_pickup' && <span className="text-red-500"> *</span>}
                          </label>
                          <select
                            value={pickupByFarmer[f.farmerId] ?? ''}
                            disabled={deliveryType !== 'self_pickup'}
                            onChange={(e) =>
                              setPickupByFarmer((prev) => ({
                                ...prev,
                                [f.farmerId]: e.target.value,
                              }))
                            }
                            className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none ${
                              deliveryType !== 'self_pickup'
                                ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                : pickupMissing
                                  ? 'border-red-300 bg-white focus:border-red-500'
                                  : 'border-gray-200 bg-white focus:border-green-500'
                            }`}
                          >
                            <option value="">{L('Select a pickup point', 'స్థలం ఎంచుకోండి')}</option>
                            {f.farmerPickupLocations.map((loc) => (
                              <option key={loc} value={loc}>{loc}</option>
                            ))}
                          </select>
                          {deliveryType !== 'self_pickup' ? (
                            <p className="text-[11px] text-gray-400 mt-1">
                              {L('Not needed for delivery', 'డెలివరీకి అవసరం లేదు')}
                            </p>
                          ) : pickupMissing ? (
                            <p className="text-[11px] text-red-600 mt-1">
                              {L('Please choose a pickup point', 'పికప్ స్థలం ఎంచుకోండి')}
                            </p>
                          ) : null}

                          {/* Timings for the chosen pickup point, if the farmer set any. */}
                          {deliveryType === 'self_pickup' && pickupByFarmer[f.farmerId] && (() => {
                            const lines = formatPickupSlots(f.farmerPickupSlots?.[pickupByFarmer[f.farmerId]])
                            if (lines.length === 0) return null
                            return (
                              <div className="mt-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
                                <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide mb-1">
                                  🕒 {L('Pickup timings', 'పికప్ సమయాలు')}
                                </p>
                                <ul className="space-y-0.5">
                                  {lines.map((line, i) => (
                                    <li key={i} className="text-[11px] text-green-800 font-medium">{line}</li>
                                  ))}
                                </ul>
                              </div>
                            )
                          })()}
                        </div>
                      )}

                      <div className="flex gap-2 items-start">
                        {/* Cancel closes the cart without removing items. */}
                        <button
                          type="button"
                          onClick={onClose}
                          className="mt-1 px-4 py-3.5 rounded-xl text-sm font-bold border border-gray-300 text-gray-700 active:bg-gray-50 whitespace-nowrap"
                        >
                          {L('Cancel', 'రద్దు')}
                        </button>
                        <div className="flex-1">
                      {(() => {
                        const farmerCodOk = liveCodEnabled[f.farmerId] === true

                        if (paymentMethod === 'upi') {
                          // Online payment is collected by the platform's
                          // Razorpay account, so it works for every farmer
                          // regardless of whether they set up their own UPI.
                          return (
                            <button
                              onClick={() => requireAuth(() => handleRazorpayOrderFarmer(group))}
                              disabled={groupDetailsMissing || payingOnline === f.farmerId}
                              className={`mt-1 w-full font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 ${
                                groupDetailsMissing
                                  ? 'bg-gray-200 text-gray-500'
                                  : 'bg-blue-600 text-white active:bg-blue-700 disabled:opacity-50'
                              }`}
                            >
                              {payingOnline === f.farmerId
                                ? 'Opening payment...'
                                : `💳 Order & Pay ₹${Math.round(group.reduce((s, it) => s + (it.pricePerKg ?? 0) * it.qty, 0))}`}
                            </button>
                          )
                        }

                        // paymentMethod === 'cod'
                        if (!farmerCodOk) {
                          return (
                            <p className="mt-1 text-[12px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5 text-center">
                              {L('This farmer accepts UPI only. Switch above.', 'ఈ రైతు UPI మాత్రమే అంగీకరిస్తారు.')}
                            </p>
                          )
                        }
                        return (
                          <button
                            onClick={() => requireAuth(() => handleCodOrderFarmer(group))}
                            disabled={groupDetailsMissing}
                            className={`mt-1 w-full font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 ${
                              sent
                                ? 'bg-green-100 text-green-800'
                                : groupDetailsMissing
                                  ? 'bg-gray-200 text-gray-500'
                                  : 'bg-green-700 text-white active:bg-green-800'
                            }`}
                          >
                            {sent ? (
                              <>✓ Order placed</>
                            ) : (
                              <>
                                ✓ Place order with {f.farmerName.split(' ')[0] || 'farmer'}
                              </>
                            )}
                          </button>
                        )
                      })()}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {farmerGroups.length > 1 && (
                <p className="text-xs text-gray-500 text-center px-4 leading-snug">
                  {L('Each farmer is notified separately, since each farm handles its own pickup.', 'ప్రతి రైతుకు విడివిడిగా తెలియజేస్తాము.')}
                </p>
              )}

              <button
                onClick={clear}
                className="w-full text-sm text-gray-500 underline pt-2"
              >
                {L('Clear cart', 'బుట్ట ఖాళీ చేయండి')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function QtyStepper({
  qty,
  onDec,
  onInc,
  maxQty,
}: {
  qty: number
  onDec: () => void
  onInc: () => void
  maxQty?: number
}) {
  const atMax = maxQty != null && qty >= maxQty
  return (
    <div className="flex items-center border border-gray-200 rounded-full">
      <button
        onClick={onDec}
        className="w-8 h-8 text-lg text-gray-700 flex items-center justify-center active:bg-gray-100 rounded-l-full"
        aria-label="Decrease"
      >
        −
      </button>
      <span className="w-10 text-center font-bold text-sm text-gray-900">
        {qty}
      </span>
      <button
        onClick={onInc}
        disabled={atMax}
        className={`w-8 h-8 text-lg flex items-center justify-center rounded-r-full ${
          atMax
            ? 'text-gray-300 cursor-not-allowed'
            : 'text-gray-700 active:bg-gray-100'
        }`}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  )
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

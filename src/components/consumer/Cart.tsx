'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type PickupSlots = {
  days: string[]
  time_from: string
  time_to: string
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
  farmerPickupSlots?: PickupSlots | null
  farmerUpiId?: string
  farmerQrCodeUrl?: string
}

export type CartState = Record<string, CartItem>

export type ConsumerInfo = { name: string; phone: string }

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
  pickupDay?: string
}

/* ─── Cart FAB + Sheet ───────────────────────────────── */
export function CartFab() {
  const { items, count } = useCart()
  const [open, setOpen] = useState(false)

  // Auto-open if a UPI payment was in progress (handles page refresh mid-payment)
  useEffect(() => {
    const pending = localStorage.getItem(UPI_PENDING_KEY)
    const launched = localStorage.getItem(UPI_LAUNCHED_KEY)
    if (pending && launched) setOpen(true)
  }, [])

  const handleClose = () => {
    // Wipe both UPI keys — user is explicitly closing, whatever the payment state
    localStorage.removeItem(UPI_LAUNCHED_KEY)
    localStorage.removeItem(UPI_PENDING_KEY)
    setOpen(false)
  }

  if (count === 0 && !open) return null

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-4 z-[60] bg-green-700 active:bg-green-800 text-white rounded-full shadow-2xl flex items-center gap-2 pl-4 pr-5 py-3.5"
          style={{ bottom: 'max(24px, env(safe-area-inset-bottom, 24px))' }}
          aria-label="View cart"
        >
          <CartIcon />
          <span className="font-extrabold text-sm">
            {count} {count === 1 ? 'item' : 'items'} / బుట్ట
          </span>
        </button>
      )}
      {open && (
        <CartSheet items={items} onClose={handleClose} />
      )}
    </>
  )
}

/* ─── Cart sheet ─────────────────────────────────────── */
function CartSheet({
  items,
  onClose,
}: {
  items: CartItem[]
  onClose: () => void
}) {
  const { setQty, removeItem, clear, clearFarmer } = useCart()
  const { info, save: saveInfo } = useConsumerInfo()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'upi'>('upi')
  const [showMorePayment, setShowMorePayment] = useState(false)
  const [sentFarmers, setSentFarmers] = useState<Record<string, boolean>>({})
  const [pickupByFarmer, setPickupByFarmer] = useState<Record<string, string>>({})
  const [pickupDayByFarmer, setPickupDayByFarmer] = useState<Record<string, string>>({})
  const [toast, setToast] = useState('')
  const [placingUpiOrder, setPlacingUpiOrder] = useState<string | null>(null)
  const [submittingResult, setSubmittingResult] = useState(false)
  const [paidDone, setPaidDone] = useState(false)
  // Live UPI IDs and QR codes fetched from DB — always up to date, overrides stale cart data
  const [liveUpiIds, setLiveUpiIds] = useState<Record<string, string>>({})
  const [liveQrUrls, setLiveQrUrls] = useState<Record<string, string>>({})
  const [showUpiAppFallback, setShowUpiAppFallback] = useState(false)
  const [utrNote, setUtrNote] = useState('')
  const [cashMode, setCashMode] = useState(false)
  const [switchingToCash, setSwitchingToCash] = useState(false)
  const [upiScreen, setUpiScreen] = useState<UpiPaymentState | null>(null)

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
      .select('id, upi_id, upi_qr_code_url')
      .in('id', farmerIds)
      .then(({ data }) => {
        if (!data) return
        const upiMap: Record<string, string> = {}
        const qrMap: Record<string, string> = {}
        for (const f of data) {
          if (f.upi_id) upiMap[f.id] = f.upi_id
          if (f.upi_qr_code_url) qrMap[f.id] = f.upi_qr_code_url
        }
        setLiveUpiIds(upiMap)
        setLiveQrUrls(qrMap)
      })
  }, [items])

  useEffect(() => {
    setName(info.name)
    setPhone(info.phone)
  }, [info])

  // Group items by farmer
  const byFarmer = items.reduce<Record<string, CartItem[]>>((acc, item) => {
    (acc[item.farmerId] = acc[item.farmerId] ?? []).push(item)
    return acc
  }, {})
  const farmerGroups = Object.values(byFarmer)

  const detailsMissing = !name.trim() || phone.replace(/\D/g, '').length < 10

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // COD flow: save order. Farmer is alerted via realtime subscription on their
  // dashboard — the consumer is no longer required to send a WhatsApp message.
  const handleCodOrderFarmer = (group: CartItem[]) => {
    if (detailsMissing) return
    saveInfo({ name: name.trim(), phone: phone.trim() })

    const f = group[0]
    const selectedPickup = pickupByFarmer[f.farmerId]

    const buyerPhone = phone.replace(/\D/g, '').slice(-10)
    for (const it of group) {
      const baseRow = {
        farmer_id: it.farmerId,
        produce_listing_id: it.listingId,
        produce_name: it.name,
        quantity: it.qty,
        unit: it.unit || 'kg',
        total_price: it.pricePerKg ? Math.round(it.pricePerKg * it.qty) : null,
        buyer_name: name.trim(),
        buyer_phone: buyerPhone,
        pickup_location: selectedPickup || null,
        status: 'pending',
      }
      supabase.from('orders').insert({ ...baseRow, payment_method: 'cod', payment_status: 'pending' })
        .then(async ({ error }) => {
          if (error?.message?.includes('payment_method') || error?.message?.includes('payment_status')) {
            const { error: err2 } = await supabase.from('orders').insert(baseRow)
            if (err2) console.error('[YFF] Order save failed:', err2.message)
          } else if (error) {
            console.error('[YFF] Order save failed:', error.message, error.details, error.hint)
          }
        })
    }

    clearFarmer(f.farmerId)
    setSentFarmers((s) => ({ ...s, [f.farmerId]: true }))
  }

  // UPI flow: save orders, collect IDs, show payment screen
  const handleUpiOrderFarmer = async (group: CartItem[]) => {
    if (detailsMissing) return
    const f = group[0]
    const upiId = liveUpiIds[f.farmerId] ?? f.farmerUpiId ?? ''
    const qrCodeUrl = liveQrUrls[f.farmerId] ?? f.farmerQrCodeUrl
    if (!upiId && !qrCodeUrl) return

    setUtrNote('')
    setShowUpiAppFallback(false)
    setCashMode(false)
    saveInfo({ name: name.trim(), phone: phone.trim() })
    setPlacingUpiOrder(f.farmerId)

    const selectedPickup = pickupByFarmer[f.farmerId] || null
    const buyerPhone = phone.replace(/\D/g, '').slice(-10)

    // Pre-calculate total and guard — UPI payment with ₹0 is meaningless
    const total = group.reduce((s, it) => s + (it.pricePerKg ? Math.round(it.pricePerKg * it.qty) : 0), 0)
    if (total === 0) {
      setPlacingUpiOrder(null)
      showToast('Price not set — message the farmer first / రైతుని ధర అడగండి')
      return
    }

    const orderIds: string[] = []

    for (const it of group) {
      const price = it.pricePerKg ? Math.round(it.pricePerKg * it.qty) : null
      const { data, error } = await supabase.from('orders').insert({
        farmer_id: it.farmerId,
        produce_listing_id: it.listingId,
        produce_name: it.name,
        quantity: it.qty,
        unit: it.unit || 'kg',
        total_price: price,
        buyer_name: name.trim(),
        buyer_phone: buyerPhone,
        pickup_location: selectedPickup,
        status: 'pending',
        payment_method: 'upi',
        payment_status: 'pending',
      }).select('id').single()

      if (!error && data) orderIds.push(data.id)
      else if (error) console.error('[YFF] UPI order save failed:', error.message)
    }

    setPlacingUpiOrder(null)
    if (orderIds.length === 0) {
      showToast('Could not place order. Please try again.')
      return
    }

    autoTriggeredRef.current = false
    setUpiScreen({
      farmerName: f.farmerName,
      farmerVillage: f.farmerVillage,
      farmerPhone: f.farmerPhone,
      upiId,
      qrCodeUrl,
      amount: total,
      orderIds,
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
      pickupLocation: selectedPickup || undefined,
      pickupDay: pickupDayByFarmer[f.farmerId] || undefined,
    })
  }

  const handlePaymentSuccess = async () => {
    if (!upiScreen) return
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
      showToast('QR saved! / గ్యాలరీకి సేవ్ అయింది')
    } catch {
      showToast('Could not save — please screenshot the QR')
    }
  }

  // Success screen — shown after I Have Paid or Cash on Pickup
  if (upiScreen && paidDone) {
    return (
      <div className="fixed inset-0 z-[200] bg-black/50 flex items-end justify-center">
        <div className="bg-white w-full max-w-md rounded-t-3xl px-6 py-10 flex flex-col items-center text-center gap-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl ${cashMode ? 'bg-amber-100' : 'bg-green-100'}`}>
            {cashMode ? '💵' : '✓'}
          </div>
          <div>
            <h2 className="font-extrabold text-gray-900 text-xl">
              {cashMode ? 'Order placed!' : 'Payment recorded!'}
            </h2>
            <p className={`font-semibold mt-0.5 ${cashMode ? 'text-amber-700' : 'text-green-700'}`}>
              {cashMode ? 'Cash on Pickup / నగదు పికప్' : 'చెల్లింపు నమోదైంది!'}
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
          ) : (
            <>
              <p className="text-sm text-gray-600 leading-snug">
                Waiting for farmer confirmation / రైతు నిర్ధారణ కోసం వేచి ఉంది
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
            Check order status / ఆర్డర్ స్థితి చూడండి
          </Link>
          <button
            onClick={onClose}
            className="w-full bg-green-700 text-white font-bold py-4 rounded-xl text-base active:bg-green-800"
          >
            Done / మూసివేయి
          </button>
        </div>
      </div>
    )
  }

  // Payment screen shown after placing an order
  if (upiScreen) {
    return (
      <div className="fixed inset-0 z-[200] bg-black/50 flex items-end justify-center">
        <div className="bg-white w-full max-w-md rounded-t-3xl max-h-[92vh] flex flex-col">
          <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-gray-100 rounded-t-3xl">
            <div>
              <h2 className="font-extrabold text-gray-900 text-lg">Pay Farmer / రైతుకు చెల్లించండి</h2>
              <p className="text-xs text-gray-500">Pay directly — no middleman</p>
            </div>
            <button onClick={onClose} className="text-gray-400 text-3xl leading-none p-1">×</button>
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
                <p className="text-[11px] text-gray-500 text-center">Open any UPI app → Scan QR / QR స్కాన్ చేయండి</p>
                <button
                  onClick={handleDownloadQR}
                  className="w-full border border-gray-300 text-gray-700 font-bold py-2.5 rounded-xl text-sm active:bg-gray-50 flex items-center justify-center gap-1.5 mt-1"
                >
                  <span>⬇️</span> Save QR to Gallery / గ్యాలరీకి సేవ్ చేయండి
                </button>
              </div>
            )}

            {/* UPI pay instructions */}
            {upiScreen.upiId && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-4 space-y-3">
                <p className="text-xs font-extrabold text-blue-800 uppercase tracking-wide">
                  How to pay / చెల్లింపు విధానం
                </p>

                {/* Steps */}
                <ol className="space-y-2.5">
                  <li className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">1</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Copy the UPI ID below</p>
                      <p className="text-xs text-gray-500">క్రింద ఉన్న UPI ID కాపీ చేయండి</p>
                    </div>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">2</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Open your UPI app (PhonePe / GPay / Paytm)</p>
                      <p className="text-xs text-gray-500">మీ UPI యాప్ తెరవండి</p>
                    </div>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">3</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Tap &quot;Pay&quot; → &quot;Enter UPI ID&quot; → paste the ID</p>
                      <p className="text-xs text-gray-500">&quot;Pay&quot; నొక్కి → &quot;UPI ID&quot; నమోదు చేసి → పేస్ట్ చేయండి</p>
                    </div>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">4</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Enter ₹{upiScreen.amount} and complete payment</p>
                      <p className="text-xs text-gray-500">₹{upiScreen.amount} నమోదు చేసి చెల్లింపు పూర్తి చేయండి</p>
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
                      showToast('UPI ID copied! / కాపీ అయింది')
                    }}
                    className="flex-shrink-0 bg-blue-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs active:bg-blue-700"
                  >
                    Copy / కాపీ
                  </button>
                </div>

                {/* Open UPI App button */}
                <button
                  onClick={handleOpenUpiApp}
                  className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl text-base active:bg-blue-700 flex items-center justify-center gap-2"
                >
                  📲 Open UPI App / UPI యాప్ తెరవండి
                </button>

                {showUpiAppFallback && (
                  <p className="text-xs text-blue-700 text-center">
                    App didn&apos;t open? Copy the UPI ID and pay manually in PhonePe, GPay, or Paytm.<br />
                    యాప్ తెరుచుకోలేదా? UPI ID కాపీ చేసి మాన్యువల్‌గా చెల్లించండి.
                  </p>
                )}
              </div>
            )}

            {/* Optional transaction note */}
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">
                Transaction note (optional) / లావాదేవీ నోట్
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

            {/* I Have Paid */}
            <button
              onClick={handlePaymentSuccess}
              disabled={submittingResult}
              className="w-full bg-green-700 text-white font-bold py-4 rounded-xl text-base disabled:opacity-50 active:bg-green-800"
            >
              {submittingResult ? 'Saving...' : '✓ I Have Paid / చెల్లించాను'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end justify-center">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 left-0 right-0 flex justify-center z-[210] pointer-events-none px-4">
          <div className="bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-xl">
            {toast}
          </div>
        </div>
      )}
      <div className="bg-white w-full max-w-md rounded-t-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-gray-100 rounded-t-3xl">
          <div>
            <h2 className="font-extrabold text-gray-900 text-lg">Your cart / మీ బుట్ట</h2>
            <p className="text-xs text-gray-500">
              Pickup from farm only / పొలం నుండి పికప్ మాత్రమే
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-3xl leading-none p-1">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {items.length === 0 ? (
            <div className="text-center py-14 text-gray-400">
              <div className="text-5xl mb-3">🛒</div>
              <p className="font-semibold">Your cart is empty</p>
              <p className="text-sm mt-1">బుట్ట ఖాళీగా ఉంది</p>
            </div>
          ) : (
            <>
              {/* Consumer details */}
              <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">
                    Your name / మీ పేరు
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
                    Your WhatsApp number / వాట్సాప్ నంబర్
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
                  The farmer needs this to confirm pickup time.<br />
                  పికప్ సమయం కోసం రైతుకు ఇది అవసరం.
                </p>
              </div>

              {/* Payment method selection */}
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                  Payment method / చెల్లింపు విధానం
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
                    <span className="text-base">📲</span>
                    UPI Payment / యూపీఐ చెల్లింపు
                  </span>
                  {paymentMethod === 'upi' && (
                    <span className="text-blue-600 text-base">✓</span>
                  )}
                </button>
                {showMorePayment ? (
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
                      Cash on Delivery / నగదు చెల్లింపు
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
                    + More options / మరిన్ని ఎంపికలు
                  </button>
                )}
              </div>

              {/* Farmer groups */}
              {farmerGroups.map((group) => {
                const f = group[0]
                const total = group.reduce(
                  (s, it) => s + (it.pricePerKg ?? 0) * it.qty,
                  0,
                )
                const sent = sentFarmers[f.farmerId]
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
                      <span className="text-[10px] font-bold bg-green-700 text-white px-2 py-1 rounded-full whitespace-nowrap">
                        Pickup
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
                              {it.name}
                            </p>
                            {it.pricePerKg && (
                              <p className="text-xs text-gray-500">₹{it.pricePerKg}/{it.unit || 'kg'}</p>
                            )}
                            {getActiveTier(it.qty, it).isDiscount && (
                              <p className="text-[10px] font-semibold text-green-700 mt-0.5">
                                Bulk price applied / బల్క్ ధర వర్తింపు
                              </p>
                            )}
                          </div>
                          <QtyStepper
                            qty={it.qty}
                            maxQty={it.stockQty}
                            onDec={() => setQty(it.listingId, it.qty - 1)}
                            onInc={() => {
                              if (it.stockQty != null && it.qty >= it.stockQty) {
                                showToast('No more stock available / స్టాక్ అయిపోయింది')
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
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-2">
                          <span className="text-xs text-gray-500">Estimated total / మొత్తం</span>
                          <span className="font-extrabold text-gray-900">
                            ₹{total}
                          </span>
                        </div>
                      )}

                      {f.farmerPickupLocations && f.farmerPickupLocations.length > 0 && (
                        <div className="pt-2">
                          <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1">
                            Pickup location / పికప్ స్థలం
                          </label>
                          <select
                            value={pickupByFarmer[f.farmerId] ?? ''}
                            onChange={(e) =>
                              setPickupByFarmer((prev) => ({
                                ...prev,
                                [f.farmerId]: e.target.value,
                              }))
                            }
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-green-500 focus:outline-none"
                          >
                            <option value="">Select a pickup point / స్థలం ఎంచుకోండి</option>
                            {f.farmerPickupLocations.map((loc) => (
                              <option key={loc} value={loc}>{loc}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {f.farmerPickupSlots && f.farmerPickupSlots.days.length > 0 && (
                        <div className="pt-2">
                          <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1">
                            Pickup day / పికప్ రోజు
                          </label>
                          <p className="text-[11px] text-green-700 font-medium mb-1.5">
                            Available {f.farmerPickupSlots.time_from}–{f.farmerPickupSlots.time_to}
                          </p>
                          <select
                            value={pickupDayByFarmer[f.farmerId] ?? ''}
                            onChange={(e) =>
                              setPickupDayByFarmer((prev) => ({
                                ...prev,
                                [f.farmerId]: e.target.value,
                              }))
                            }
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-green-500 focus:outline-none"
                          >
                            <option value="">Select a day / రోజు ఎంచుకోండి</option>
                            {f.farmerPickupSlots.days.map((day) => (
                              <option key={day} value={day}>{day}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {paymentMethod === 'upi' ? (
                        (liveUpiIds[f.farmerId] || f.farmerUpiId || liveQrUrls[f.farmerId]) ? (
                          <button
                            onClick={() => handleUpiOrderFarmer(group)}
                            disabled={detailsMissing || placingUpiOrder === f.farmerId}
                            className={`mt-1 w-full font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 ${
                              detailsMissing
                                ? 'bg-gray-200 text-gray-500'
                                : 'bg-blue-600 text-white active:bg-blue-700 disabled:opacity-50'
                            }`}
                          >
                            {placingUpiOrder === f.farmerId
                              ? 'Placing order...'
                              : `📲 Order & Pay ₹${Math.round(group.reduce((s, it) => s + (it.pricePerKg ?? 0) * it.qty, 0))}`}
                          </button>
                        ) : (
                          <div className="mt-1 space-y-2">
                            <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2 text-center">
                              ⚠️ This farmer hasn&apos;t set up UPI yet. Using Cash on Pickup.
                            </p>
                            <button
                              onClick={() => handleCodOrderFarmer(group)}
                              disabled={detailsMissing}
                              className={`w-full font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 ${
                                sent
                                  ? 'bg-green-100 text-green-800'
                                  : detailsMissing
                                    ? 'bg-gray-200 text-gray-500'
                                    : 'bg-green-700 text-white active:bg-green-800'
                              }`}
                            >
                              {sent ? <>✓ Order placed</> : <>💵 Place order — Cash on Pickup</>}
                            </button>
                          </div>
                        )
                      ) : (
                        <button
                          onClick={() => handleCodOrderFarmer(group)}
                          disabled={detailsMissing}
                          className={`mt-1 w-full font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 ${
                            sent
                              ? 'bg-green-100 text-green-800'
                              : detailsMissing
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
                      )}
                    </div>
                  </div>
                )
              })}

              {farmerGroups.length > 1 && (
                <p className="text-xs text-gray-500 text-center px-4 leading-snug">
                  Each farmer is notified separately, since each farm handles its own pickup.<br />
                  ప్రతి రైతుకు విడివిడిగా తెలియజేస్తాము.
                </p>
              )}

              <button
                onClick={clear}
                className="w-full text-sm text-gray-500 underline pt-2"
              >
                Clear cart / బుట్ట ఖాళీ చేయండి
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

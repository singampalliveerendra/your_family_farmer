/**
 * The farmer's / aggregator's receipt for ONE order (one produce line), as
 * saved to PDF from /farmer/dashboard/orders/[id]/receipt (decision
 * 2026-11-04: PDF only, one receipt per order).
 *
 * Pure: the page renders whatever this returns, so every number and label on
 * the PDF is unit-tested here. The money matches the order-detail screen
 * exactly — the farmer's price, the platform fee collected, and what the buyer
 * pays (their sum). The delivery charge is not on it: it is one charge per
 * checkout, paid to the platform's rider, and not part of this sale.
 *
 * Labels come in both languages; the page picks one with the app language.
 */

import { isDepositPaid, isGatewayMethod, isOrderPaid, isPaymentClaimed } from '@/lib/payment'
import { isHandedOver, type DeliveryStatus } from '@/lib/delivery'
import { formatQty } from '@/lib/saleStep'

export type Msg = { en: string; te: string }

export type ReceiptOrder = {
  id: string
  order_code?: string | null
  produce_name?: string | null
  quantity?: number | string | null
  unit?: string | null
  total_price?: number | string | null
  platform_fee?: number | string | null
  buyer_name?: string | null
  buyer_phone?: string | null
  status?: string | null
  payment_method?: string | null
  payment_status?: string | null
  utr_number?: string | null
  paid_at?: string | null
  refund_status?: string | null
  refund_amount?: number | string | null
  created_at: string
  delivery_type?: string | null
  delivery_status?: DeliveryStatus | null
  delivery_address?: string | null
  delivery_city?: string | null
  delivery_landmark?: string | null
  delivery_pincode?: string | null
  pickup_location?: string | null
  received_at?: string | null
  collected_at?: string | null
  order_type?: string | null
  is_self_order?: boolean | null
  /** Bulk orders: the seller's delivery charge, INCLUDED in total_price. */
  transport_charge?: number | string | null
  transport_state?: string | null
}

export type ReceiptSeller = {
  name?: string | null
  village?: string | null
  phone?: string | null
  account_type?: string | null
}

/** A value is either fixed text (a name, an amount) or words in both languages. */
export type ReceiptRow = { label: Msg; value: string | Msg }

export type OrderReceipt = {
  /** Shown big at the top and used in the PDF file name. */
  number: string
  /** "4 Nov 2026, 10:30 am" in India time. */
  placedAt: string
  status: Msg
  /** Order is no longer a sale (declined / cancelled) — the page stamps it. */
  void: boolean
  tags: Msg[]
  seller: { role: Msg; name: string; place: string; phone: string }
  buyer: { name: string; phone: string }
  item: { name: string; qty: string; rate: string; amount: string }
  money: ReceiptRow[]
  /** What the buyer pays — the receipt's total. */
  total: string
  payment: ReceiptRow[]
  fulfilment: ReceiptRow[]
  /** Safe file name for the saved PDF (browsers use the page title). */
  fileName: string
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** ₹1,234 or ₹1,234.50 — Indian grouping, paise only when there are any. */
export function rupees(v: unknown): string {
  const n = Math.round(num(v) * 100) / 100
  const whole = Number.isInteger(n)
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`
}

const IST: Intl.DateTimeFormatOptions = {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
}
export function receiptDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', IST)
}

/** The order number printed on the receipt: the order code, else a short id. */
export function receiptNumber(o: Pick<ReceiptOrder, 'id' | 'order_code'>): string {
  const code = (o.order_code ?? '').trim()
  return code || `#${o.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

export function receiptFileName(number: string): string {
  return `GoGrameen-Receipt-${number.replace(/[^A-Za-z0-9-]+/g, '')}`
}

function statusOf(o: ReceiptOrder): Msg {
  if (o.status === 'declined') return { en: 'Declined', te: 'తిరస్కరించారు' }
  if (o.status === 'cancelled') return { en: 'Cancelled', te: 'రద్దు అయింది' }
  if (isHandedOver(o)) {
    return o.delivery_type === 'self_pickup' || !o.delivery_type
      ? { en: 'Collected by buyer', te: 'కొనుగోలుదారు తీసుకెళ్లారు' }
      : { en: 'Delivered', te: 'డెలివరీ అయింది' }
  }
  if (o.status === 'approved') return { en: 'Approved', te: 'ఆమోదించారు' }
  return { en: 'Pending', te: 'పెండింగ్' }
}

function methodOf(o: ReceiptOrder): Msg {
  if (isGatewayMethod(o.payment_method)) return { en: 'Online (UPI / card)', te: 'ఆన్‌లైన్ (UPI / కార్డ్)' }
  if (o.payment_method === 'upi') return { en: 'UPI', te: 'UPI' }
  return { en: 'Cash', te: 'నగదు' }
}

function paymentStateOf(o: ReceiptOrder): Msg {
  const s = o.payment_status
  if (isOrderPaid(s)) return { en: 'Paid', te: 'చెల్లించారు' }
  if (isDepositPaid(s)) return { en: 'Deposit paid, balance in cash', te: 'డిపాజిట్ చెల్లించారు, మిగతా నగదు' }
  if (isPaymentClaimed(s)) return { en: 'Buyer says paid — not verified', te: 'చెల్లించామన్నారు — ధృవీకరించలేదు' }
  if (s === 'failed') return { en: 'Payment failed', te: 'చెల్లింపు విఫలమైంది' }
  // Cash changes hands at the handover, so a collected / delivered cash order
  // is paid even if nobody flipped the status (same rule as the order screen).
  const cash = !o.payment_method || o.payment_method === 'cod'
  if (cash && isHandedOver(o) && o.status !== 'cancelled' && o.status !== 'declined') {
    return { en: 'Paid in cash', te: 'నగదు చెల్లించారు' }
  }
  return { en: 'Not paid yet', te: 'ఇంకా చెల్లించలేదు' }
}

function fulfilmentOf(o: ReceiptOrder): ReceiptRow[] {
  const address = [o.delivery_address, o.delivery_landmark, o.delivery_city, o.delivery_pincode]
    .map((p) => (p ?? '').trim()).filter(Boolean).join(', ')
  if (o.delivery_type === 'home_delivery' || o.delivery_type === 'courier') {
    return [
      {
        label: { en: 'Delivery', te: 'డెలివరీ' },
        value: o.delivery_type === 'courier'
          ? { en: 'Courier / seller delivery', te: 'కొరియర్ / అమ్మకందారు డెలివరీ' }
          : { en: 'Home delivery', te: 'ఇంటికి డెలివరీ' },
      },
      ...(address ? [{ label: { en: 'Address', te: 'చిరునామా' }, value: address }] : []),
    ]
  }
  return [
    { label: { en: 'Delivery', te: 'డెలివరీ' }, value: { en: 'Pickup from seller', te: 'అమ్మకందారు దగ్గర పికప్' } },
    ...((o.pickup_location ?? '').trim() ? [{ label: { en: 'Pickup point', te: 'పికప్ స్థలం' }, value: o.pickup_location!.trim() }] : []),
  ]
}

export function buildOrderReceipt(o: ReceiptOrder, seller: ReceiptSeller | null): OrderReceipt {
  const qty = num(o.quantity)
  const unit = (o.unit ?? '').trim() || 'kg'
  const price = num(o.total_price)
  const fee = num(o.platform_fee)
  const number = receiptNumber(o)
  const isAggregator = seller?.account_type === 'aggregator'

  const tags: Msg[] = []
  if (o.order_type === 'wholesale') tags.push({ en: 'Wholesale order', te: 'హోల్‌సేల్ ఆర్డర్' })
  if (o.is_self_order) tags.push({ en: 'Own order', te: 'సొంత ఆర్డర్' })

  // A bulk order's transport is part of the seller's price; shown as its own
  // line so the produce price and the delivery charge are both clear.
  const transport = Math.min(price, Math.max(0, num(o.transport_charge)))
  const money: ReceiptRow[] = transport > 0
    ? [
        { label: { en: 'Produce price', te: 'ఉత్పత్తి ధర' }, value: rupees(price - transport) },
        { label: { en: 'Transport', te: 'రవాణా' }, value: rupees(transport) },
        { label: { en: 'Platform fee', te: 'ప్లాట్‌ఫామ్ ఫీజు' }, value: rupees(fee) },
      ]
    : [
        { label: { en: 'Seller price', te: 'అమ్మకందారు ధర' }, value: rupees(price) },
        { label: { en: 'Platform fee', te: 'ప్లాట్‌ఫామ్ ఫీజు' }, value: rupees(fee) },
      ]

  const payment: ReceiptRow[] = [
    { label: { en: 'Method', te: 'విధానం' }, value: methodOf(o) },
    { label: { en: 'Status', te: 'స్థితి' }, value: paymentStateOf(o) },
  ]
  if (isOrderPaid(o.payment_status) && o.paid_at) {
    payment.push({ label: { en: 'Paid on', te: 'చెల్లించిన తేదీ' }, value: receiptDate(o.paid_at) })
  }
  const ref = (o.utr_number ?? '').trim()
  if (ref) payment.push({ label: { en: 'Reference', te: 'రిఫరెన్స్' }, value: ref })
  if (o.refund_status && o.refund_status !== 'failed') {
    const amt = rupees(o.refund_amount ?? price)
    payment.push({
      label: o.refund_status === 'processed'
        ? { en: 'Refunded to buyer', te: 'కొనుగోలుదారుకు రీఫండ్' }
        : { en: 'Refund started', te: 'రీఫండ్ ప్రారంభమైంది' },
      value: amt,
    })
  }

  return {
    number,
    placedAt: receiptDate(o.created_at),
    status: statusOf(o),
    void: o.status === 'declined' || o.status === 'cancelled',
    tags,
    seller: {
      role: isAggregator ? { en: 'Aggregator', te: 'అగ్రిగేటర్' } : { en: 'Farmer', te: 'రైతు' },
      name: (seller?.name ?? '').trim() || '—',
      place: (seller?.village ?? '').trim(),
      phone: (seller?.phone ?? '').trim(),
    },
    buyer: {
      name: (o.buyer_name ?? '').trim() || '—',
      phone: (o.buyer_phone ?? '').trim(),
    },
    item: {
      name: (o.produce_name ?? '').trim() || '—',
      qty: `${formatQty(qty)} ${unit}`,
      // What one unit came to. Tier pricing can make this a fraction, so it is
      // derived from the stored line total rather than re-priced — produce
      // only, never including a bulk order's transport.
      rate: qty > 0 ? `${rupees((price - transport) / qty)}/${unit}` : '—',
      amount: rupees(price - transport),
    },
    money,
    total: rupees(price + fee),
    payment,
    fulfilment: fulfilmentOf(o),
    fileName: receiptFileName(number),
  }
}

/** The text of a row value in the chosen language. */
export function rowText(value: string | Msg, lang: 'en' | 'te'): string {
  return typeof value === 'string' ? value : value[lang]
}

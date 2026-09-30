import type { SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import { queueAndSend } from '@/lib/notify'
import { hasMoneyIn } from '@/lib/payment'
import { formatQty } from '@/lib/saleStep'

// Order WhatsApps: which rows, which words, which phone. The transport and the
// outbox live in notify.ts / whatsapp.ts; this file only decides WHAT to say.
//
// Three messages at MVP, one approved template each (body text is fixed in
// WhatsApp Manager — only the {{n}} values below come from here):
//   yff_order_placed      buyer   {{1}} name  {{2}} order no.  {{3}} amount  {{4}} farmer
//   yff_farmer_new_order  farmer  {{1}} order no.  {{2}} buyer  {{3}} phone  {{4}} items
//                                 {{5}} amount  {{6}} payment  {{7}} delivery
//   yff_order_cancelled   buyer   {{1}} name  {{2}} order no.  {{3}} farmer  {{4}} reason
// Changing the COUNT or ORDER of values here without editing the template is
// rejected by Meta at send time (132000), so keep the two in step.

/** The order columns every message below is built from. */
export const NOTIFY_ORDER_COLS =
  'id, farmer_id, order_code, produce_name, quantity, unit, total_price, delivery_fee, platform_fee, ' +
  'buyer_name, buyer_phone, payment_method, payment_status, cod_deposit, delivery_type, ' +
  'delivery_address, delivery_city, delivery_pincode, pickup_location, created_at'

export type NotifyOrderRow = {
  id: string
  farmer_id: string
  order_code: string | null
  produce_name: string | null
  quantity: number | null
  unit: string | null
  total_price: number | null
  delivery_fee: number | null
  platform_fee: number | null
  buyer_name: string | null
  buyer_phone: string | null
  payment_method: string | null
  payment_status: string | null
  cod_deposit: number | null
  delivery_type: string | null
  delivery_address: string | null
  delivery_city: string | null
  delivery_pincode: string | null
  pickup_location: string | null
  created_at: string | null
}

type Farmer = { id: string; name: string | null; phone: string | null }

/**
 * Meta rejects a template parameter that is empty, contains a newline or tab,
 * or has more than four spaces in a row (error 132018). Buyer-typed addresses
 * and names routinely do all three, so every value is squeezed through here.
 */
export function waParam(value: unknown, max = 200): string {
  const s = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (!s) return '-'
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Rupees without the ₹ (the template already has it): "240", "1,240.50". */
export function formatRupees(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

/** "YFF-20260929-0012", or "YFF-20260929-0012 (+2 more)" for a multi-line batch. */
export function orderCodeLabel(rows: NotifyOrderRow[]): string {
  const codes = rows.map((r) => r.order_code).filter((c): c is string => !!c)
  if (codes.length === 0) return '-'
  return codes.length === 1 ? codes[0] : `${codes[0]} (+${codes.length - 1} more)`
}

/** "Tomato 2 kg, Okra 0.5 kg" */
export function itemsSummary(rows: NotifyOrderRow[]): string {
  return rows
    .map((r) => `${r.produce_name ?? 'Item'} ${formatQty(r.quantity)} ${r.unit ?? ''}`.trim())
    .join(', ')
}

/** What the buyer pays: produce + delivery + platform fee, across the batch. */
export function buyerTotal(rows: NotifyOrderRow[]): number {
  return rows.reduce((s, r) => s + num(r.total_price) + num(r.delivery_fee) + num(r.platform_fee), 0)
}

/** What the farmer's produce sold for — the fees are not theirs. */
export function produceTotal(rows: NotifyOrderRow[]): number {
  return rows.reduce((s, r) => s + num(r.total_price), 0)
}

export function paymentLabel(rows: NotifyOrderRow[]): string {
  const r = rows[0]
  if (!r) return '-'
  if (r.payment_method === 'cod') {
    const deposit = rows.reduce((s, x) => s + num(x.cod_deposit), 0)
    return deposit > 0
      ? `Cash on delivery (₹${formatRupees(deposit)} advance paid online)`
      : 'Cash on delivery'
  }
  if (r.payment_method === 'upi') return 'UPI to you - please check you received it'
  return 'Paid online'
}

/** One line per fulfilment kind in the batch — a single order can mix them. */
export function deliveryLabel(rows: NotifyOrderRow[]): string {
  const parts: string[] = []
  const shipped = rows.find((r) => r.delivery_type === 'home_delivery' || r.delivery_type === 'courier')
  if (shipped) {
    const where = [shipped.delivery_address, shipped.delivery_city, shipped.delivery_pincode]
      .filter(Boolean)
      .join(', ')
    const kind = shipped.delivery_type === 'courier' ? 'Courier' : 'Home delivery'
    parts.push(where ? `${kind} - ${where}` : kind)
  }
  const pickup = rows.find((r) => r.delivery_type === 'self_pickup')
  if (pickup) {
    parts.push(pickup.pickup_location ? `Customer pickup at ${pickup.pickup_location}` : 'Customer pickup')
  }
  return parts.length ? parts.join('; ') : '-'
}

/**
 * Has the buyer been told this order exists? An online order is only real once
 * the money is in — before that it is a checkout the buyer may still abandon,
 * and announcing it (or later its cancellation) would be noise. Cash-only COD
 * and legacy UPI orders are real the moment they are placed.
 */
export function isOrderLive(row: Pick<NotifyOrderRow, 'payment_method' | 'payment_status' | 'cod_deposit'>): boolean {
  if (row.payment_method === 'upi') return true
  if (row.payment_method === 'cod') return !(num(row.cod_deposit) > 0) || hasMoneyIn(row.payment_status)
  return hasMoneyIn(row.payment_status)
}

export function groupByFarmer(rows: NotifyOrderRow[]): NotifyOrderRow[][] {
  const map = new Map<string, NotifyOrderRow[]>()
  for (const r of rows) {
    const list = map.get(r.farmer_id) ?? []
    list.push(r)
    map.set(r.farmer_id, list)
  }
  return [...map.values()].map((g) =>
    g.slice().sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || a.id.localeCompare(b.id)),
  )
}

/** A batch's stable identity: its smallest row id, so any caller agrees on it. */
export function batchKey(rows: NotifyOrderRow[]): string {
  return rows.map((r) => r.id).sort()[0] ?? ''
}

export function placedBuyerParams(rows: NotifyOrderRow[], farmerName: string | null): string[] {
  return [
    waParam(rows[0]?.buyer_name, 60),
    waParam(orderCodeLabel(rows), 60),
    waParam(formatRupees(buyerTotal(rows)), 20),
    waParam(farmerName, 60),
  ]
}

export function farmerNewOrderParams(rows: NotifyOrderRow[]): string[] {
  return [
    waParam(orderCodeLabel(rows), 60),
    waParam(rows[0]?.buyer_name, 60),
    waParam(rows[0]?.buyer_phone, 20),
    waParam(itemsSummary(rows), 300),
    waParam(formatRupees(produceTotal(rows)), 20),
    waParam(paymentLabel(rows), 80),
    waParam(deliveryLabel(rows), 300),
  ]
}

export type CancelledBy = 'buyer' | 'farmer'

export function cancelReason(by: CancelledBy, reason: string | null | undefined): string {
  if (by === 'buyer') return 'Cancelled at your request'
  const r = String(reason ?? '').trim()
  return r ? `The farmer could not complete this order (${r})` : 'The farmer could not complete this order'
}

export function cancelledParams(
  rows: NotifyOrderRow[],
  farmerName: string | null,
  by: CancelledBy,
  reason: string | null | undefined,
): string[] {
  return [
    waParam(rows[0]?.buyer_name, 60),
    waParam(orderCodeLabel(rows), 60),
    waParam(farmerName, 60),
    waParam(cancelReason(by, reason), 200),
  ]
}

// ---------------------------------------------------------------------------
// Side-effecting entry points. Both are fire-and-forget: they schedule their
// work with after() so the caller's response (a checkout, a payment verify, a
// decline tap) is never held open or failed by WhatsApp.
// ---------------------------------------------------------------------------

async function loadFarmers(supabase: SupabaseClient, ids: string[]): Promise<Map<string, Farmer>> {
  const { data, error } = await supabase.from('farmers').select('id, name, phone').in('id', ids)
  if (error) console.error('[YFF orderNotify] farmers load failed:', error.message)
  return new Map(((data ?? []) as Farmer[]).map((f) => [f.id, f]))
}

/**
 * "Order placed" to the buyer and "new order" to the farmer, once per farmer
 * batch. Safe to call more than once for the same orders (verify, webhook and
 * the reconcile cron all race to settle a payment): the outbox's dedupe key
 * collapses repeats into one message.
 */
export function notifyOrdersPlaced(supabase: SupabaseClient, orderIds: string[]): void {
  if (orderIds.length === 0) return
  after(async () => {
    try {
      const { data, error } = await supabase.from('orders').select(NOTIFY_ORDER_COLS).in('id', orderIds)
      if (error || !data) {
        console.error('[YFF orderNotify] placed: orders load failed:', error?.message)
        return
      }
      const rows = (data as unknown as NotifyOrderRow[]).filter(isOrderLive)
      if (rows.length === 0) return
      const groups = groupByFarmer(rows)
      const farmers = await loadFarmers(supabase, groups.map((g) => g[0].farmer_id))

      for (const g of groups) {
        const farmer = farmers.get(g[0].farmer_id) ?? null
        const key = batchKey(g)
        await queueAndSend(supabase, {
          phone: g[0].buyer_phone,
          event: 'order_placed',
          lang: 'en',
          body: placedBuyerParams(g, farmer?.name ?? null),
          dedupeKey: `order_placed:${key}`,
          orderId: key,
        })
        await queueAndSend(supabase, {
          phone: farmer?.phone,
          event: 'farmer_new_order',
          lang: 'en',
          body: farmerNewOrderParams(g),
          dedupeKey: `farmer_new_order:${key}`,
          orderId: key,
        })
      }
    } catch (e) {
      console.error('[YFF orderNotify] placed threw:', e)
    }
  })
}

/**
 * "Order cancelled" to the buyer. `row` is the order as loaded BEFORE the
 * cancel update — its payment_status is what tells us whether the buyer was
 * ever told the order existed (an unpaid online checkout never was).
 */
export function notifyOrderCancelled(
  supabase: SupabaseClient,
  row: { id: string },
  by: CancelledBy,
  reason: string | null | undefined,
): void {
  after(async () => {
    try {
      const { data, error } = await supabase.from('orders').select(NOTIFY_ORDER_COLS).eq('id', row.id).maybeSingle()
      if (error || !data) {
        console.error('[YFF orderNotify] cancelled: order load failed:', error?.message)
        return
      }
      const order = data as unknown as NotifyOrderRow
      if (!isOrderLive(order)) return
      const farmers = await loadFarmers(supabase, [order.farmer_id])
      await queueAndSend(supabase, {
        phone: order.buyer_phone,
        event: 'order_cancelled',
        lang: 'en',
        body: cancelledParams([order], farmers.get(order.farmer_id)?.name ?? null, by, reason),
        dedupeKey: `order_cancelled:${order.id}`,
        orderId: order.id,
      })
    } catch (e) {
      console.error('[YFF orderNotify] cancelled threw:', e)
    }
  })
}

import { MAX_TRANSPORT_KM } from '@/lib/wholesale'

/* The transport bill on a bulk order (client decision 2026-11-05,
 * scripts/transport-bill-migration.sql). For a lot charged per km or by cargo
 * bill, the online payment covers only the produce; after the seller has
 * transported the order they send the bill here and the buyer pays them
 * directly. Pure — the routes use these and the tests pin them.
 *
 *   per km     — the seller enters the km; amount = km × the rate fixed at
 *                ordering (not today's rate). A cargo bill may be attached.
 *   cargo bill — the seller enters the bill's amount and MUST attach it. */

export type BillOrder = {
  id: string
  order_type?: string | null
  status?: string | null
  shipped_at?: string | null
  transport_mode?: string | null
  transport_rate?: number | string | null
  transport_paid_at?: string | null
}

export type BillFields = {
  transport_km: number | null
  transport_bill_amount: number
  transport_bill_path: string | null
  transport_billed_at: string
}

type Msg = { en: string; te: string }
const err = (en: string, te: string) => ({ ok: false as const, error: { en, te } })

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export const CARGO_BILL_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf'] as const

/** Where a bill file lives in the private cargo-bills bucket — inside the order's own folder. */
export function cargoBillPath(orderId: string, ext: unknown, now: number = Date.now(), rand: string = Math.random().toString(36).slice(2, 8)):
  { ok: true; path: string; contentType: string } | { ok: false; error: string } {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) return { ok: false, error: 'Invalid order.' }
  const e = typeof ext === 'string' ? ext.toLowerCase().replace(/^\./, '') : ''
  if (!(CARGO_BILL_EXTS as readonly string[]).includes(e)) return { ok: false, error: 'Upload a photo or PDF of the bill.' }
  const contentType = e === 'pdf' ? 'application/pdf' : e === 'jpg' || e === 'jpeg' ? 'image/jpeg' : `image/${e}`
  return { ok: true, path: `${orderId}/bill-${now}-${rand}.${e === 'jpeg' ? 'jpg' : e}`, contentType }
}

/** Can this order take a transport bill at all, right now? */
export function canBill(o: BillOrder): { ok: true } | { ok: false; error: Msg } {
  if (o.order_type !== 'wholesale') return err('Only bulk orders have a transport bill.', 'బల్క్ ఆర్డర్లకు మాత్రమే రవాణా బిల్లు ఉంటుంది.')
  if (o.transport_mode !== 'per_km' && o.transport_mode !== 'cargo_bill') {
    return err('Transport for this order was paid online — there is nothing to bill.', 'ఈ ఆర్డర్ రవాణా ఆన్‌లైన్‌లో చెల్లించారు — బిల్లు అవసరం లేదు.')
  }
  if (o.status !== 'approved') return err('Accept the order first.', 'ముందుగా ఆర్డర్‌ను అంగీకరించండి.')
  if (!o.shipped_at) return err('Mark the order Shipped, then send the transport bill.', 'ఆర్డర్‌ను పంపినట్లు గుర్తించి, తర్వాత రవాణా బిల్లు పంపండి.')
  if (o.transport_paid_at) return err('The buyer has already paid this transport bill.', 'కొనుగోలుదారు ఈ రవాణా బిల్లు ఇప్పటికే చెల్లించారు.')
  return { ok: true }
}

/** Check a bill the seller sends (or corrects, until it is paid). */
export function parseTransportBill(o: BillOrder, body: Record<string, unknown>, now: Date = new Date()):
  { ok: true; fields: BillFields } | { ok: false; error: Msg } {
  const can = canBill(o)
  if (!can.ok) return can
  const path = typeof body.billPath === 'string' && body.billPath ? body.billPath : null
  if (path !== null && !path.startsWith(`${o.id}/`)) return err('Upload the bill again.', 'బిల్లును మళ్లీ అప్‌లోడ్ చేయండి.')

  if (o.transport_mode === 'per_km') {
    const rate = num(o.transport_rate)
    if (rate === null || rate <= 0) return err('This order has no per-km rate.', 'ఈ ఆర్డర్‌కు కి.మీ. ధర లేదు.')
    const km = num(body.km)
    if (km === null || km <= 0 || km > MAX_TRANSPORT_KM) return err(`Enter the distance in km (1 to ${MAX_TRANSPORT_KM}).`, `దూరాన్ని కి.మీ.లలో నమోదు చేయండి (1 నుండి ${MAX_TRANSPORT_KM}).`)
    const kmR = Math.round(km * 100) / 100
    return { ok: true, fields: { transport_km: kmR, transport_bill_amount: Math.round(kmR * rate), transport_bill_path: path, transport_billed_at: now.toISOString() } }
  }

  // cargo_bill
  const amount = num(body.amount)
  if (amount === null || amount <= 0 || amount > 9999999.99) return err('Enter the amount on the cargo bill.', 'కార్గో బిల్లుపై ఉన్న మొత్తం నమోదు చేయండి.')
  if (!path) return err('Upload the cargo bill (photo or PDF).', 'కార్గో బిల్లును (ఫోటో లేదా PDF) అప్‌లోడ్ చేయండి.')
  return { ok: true, fields: { transport_km: null, transport_bill_amount: Math.round(amount * 100) / 100, transport_bill_path: path, transport_billed_at: now.toISOString() } }
}

export type BillView =
  | { state: 'online' }
  | { state: 'awaiting'; mode: 'per_km' | 'cargo_bill'; rate: number | null }
  | { state: 'billed' | 'paid'; mode: 'per_km' | 'cargo_bill'; rate: number | null; km: number | null; amount: number; hasFile: boolean; billedAt: string; paidAt: string | null }

/** What both sides see about transport on one order. */
export function billView(o: BillOrder & { transport_km?: unknown; transport_bill_amount?: unknown; transport_bill_path?: string | null; transport_billed_at?: string | null }): BillView {
  const mode = o.transport_mode === 'per_km' || o.transport_mode === 'cargo_bill' ? o.transport_mode : null
  if (!mode) return { state: 'online' }
  const rate = num(o.transport_rate)
  const amount = num(o.transport_bill_amount)
  if (!o.transport_billed_at || amount === null) return { state: 'awaiting', mode, rate }
  return {
    state: o.transport_paid_at ? 'paid' : 'billed',
    mode, rate, km: num(o.transport_km), amount,
    hasFile: !!o.transport_bill_path,
    billedAt: o.transport_billed_at,
    paidAt: o.transport_paid_at ?? null,
  }
}

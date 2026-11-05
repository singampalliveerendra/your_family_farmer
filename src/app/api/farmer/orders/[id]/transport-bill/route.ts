import { NextRequest, NextResponse } from 'next/server'
import { svc, UUID_RE } from '@/lib/sellerAuth'
import { reqLang, tr } from '@/lib/serverLang'
import { parseTransportBill } from '@/lib/transportBill'
import { billRole, loadBillOrder } from '@/lib/transportBillServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The seller sends (or corrects, until paid) the transport bill of a bulk
// order charged per km or by cargo bill (2026-11-05). Body: { km } for per km,
// { amount, billPath } for cargo bill; billPath optional for per km. The buyer
// then pays the seller directly — this only records and shows it.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const lang = reqLang(req)
  const t = (m: { en: string; te: string }) => tr(lang, m.en, m.te)
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order.' }, { status: 400 })
  const supabase = svc()
  const { row, notReady } = await loadBillOrder(supabase, id)
  if (notReady) return NextResponse.json({ error: 'Transport bills are not switched on yet.' }, { status: 503 })
  if (!row) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if ((await billRole(supabase, req, row)) !== 'seller') return NextResponse.json({ error: 'Not your order.' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const p = parseTransportBill(row, body ?? {})
  if (!p.ok) return NextResponse.json({ error: t(p.error) }, { status: 400 })

  const { data, error } = await supabase
    .from('orders')
    .update(p.fields)
    .eq('id', id)
    .eq('farmer_id', row.farmer_id)
    .is('transport_paid_at', null)
    .select('id')
  if (error) return NextResponse.json({ error: 'Could not send the bill. Please try again.' }, { status: 500 })
  if (!Array.isArray(data) || !data.length) return NextResponse.json({ error: t({ en: 'The buyer has already paid this transport bill.', te: 'కొనుగోలుదారు ఈ రవాణా బిల్లు ఇప్పటికే చెల్లించారు.' }) }, { status: 409 })
  return NextResponse.json({ ok: true, amount: p.fields.transport_bill_amount, km: p.fields.transport_km })
}

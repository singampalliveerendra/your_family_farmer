import { NextRequest, NextResponse } from 'next/server'
import { svc, UUID_RE } from '@/lib/sellerAuth'
import { billRole, loadBillOrder } from '@/lib/transportBillServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The seller ticks "Transport paid" once the buyer has paid the transport bill
// to them directly (or un-ticks a mistake). Body: { paid: boolean }.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order.' }, { status: 400 })
  const supabase = svc()
  const { row, notReady } = await loadBillOrder(supabase, id)
  if (notReady) return NextResponse.json({ error: 'Transport bills are not switched on yet.' }, { status: 503 })
  if (!row) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if ((await billRole(supabase, req, row)) !== 'seller') return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  if (!row.transport_billed_at) return NextResponse.json({ error: 'Send the transport bill first.' }, { status: 409 })
  const body = (await req.json().catch(() => null)) as { paid?: unknown } | null
  if (typeof body?.paid !== 'boolean') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const paidAt = body.paid ? new Date().toISOString() : null
  const { error } = await supabase.from('orders').update({ transport_paid_at: paidAt }).eq('id', id).eq('farmer_id', row.farmer_id)
  if (error) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
  return NextResponse.json({ ok: true, paidAt })
}

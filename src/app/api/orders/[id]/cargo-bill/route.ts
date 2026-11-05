import { NextRequest, NextResponse } from 'next/server'
import { svc, UUID_RE } from '@/lib/sellerAuth'
import { billRole, CARGO_BUCKET, loadBillOrder } from '@/lib/transportBillServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// A short-lived link to open / download one order's cargo bill — only for the
// order's buyer, its seller, or a moderator of the seller's zone. The bucket is
// private; nobody else can reach the file.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order.' }, { status: 400 })
  const supabase = svc()
  const { row, notReady } = await loadBillOrder(supabase, id)
  if (notReady) return NextResponse.json({ error: 'Transport bills are not switched on yet.' }, { status: 503 })
  if (!row) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (!(await billRole(supabase, req, row))) return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  if (!row.transport_bill_path) return NextResponse.json({ error: 'No cargo bill uploaded.' }, { status: 404 })
  const { data, error } = await supabase.storage.from(CARGO_BUCKET).createSignedUrl(row.transport_bill_path, 10 * 60)
  if (error || !data?.signedUrl) return NextResponse.json({ error: 'Could not open the bill.' }, { status: 500 })
  return NextResponse.json({ ok: true, url: data.signedUrl })
}

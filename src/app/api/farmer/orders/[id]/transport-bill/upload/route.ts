import { NextRequest, NextResponse } from 'next/server'
import { svc, UUID_RE } from '@/lib/sellerAuth'
import { reqLang, tr } from '@/lib/serverLang'
import { canBill, cargoBillPath } from '@/lib/transportBill'
import { billRole, CARGO_BUCKET, loadBillOrder } from '@/lib/transportBillServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// A one-time upload link for the cargo bill (photo or PDF) of one bulk order,
// into that order's folder of the PRIVATE cargo-bills bucket. Body: { ext }.
// The file goes straight from the phone to storage (no 4.5 MB body limit).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order.' }, { status: 400 })
  const supabase = svc()
  const { row, notReady } = await loadBillOrder(supabase, id)
  if (notReady) return NextResponse.json({ error: 'Transport bills are not switched on yet.' }, { status: 503 })
  if (!row) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if ((await billRole(supabase, req, row)) !== 'seller') return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  const can = canBill(row)
  if (!can.ok) return NextResponse.json({ error: tr(reqLang(req), can.error.en, can.error.te) }, { status: 400 })

  const body = (await req.json().catch(() => null)) as { ext?: unknown } | null
  const p = cargoBillPath(id, body?.ext)
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 })
  const { data, error } = await supabase.storage.from(CARGO_BUCKET).createSignedUploadUrl(p.path)
  if (error || !data) return NextResponse.json({ error: 'Could not start the upload. Please try again.' }, { status: 500 })
  return NextResponse.json({ ok: true, path: p.path, token: data.token, contentType: p.contentType })
}

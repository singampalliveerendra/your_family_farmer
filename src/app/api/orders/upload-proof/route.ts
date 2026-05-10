import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024 // 5MB

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return bad('Please log in.', 401)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return bad('Invalid upload payload.')
  }

  const orderIdsRaw = String(form.get('orderIds') ?? '')
  const file = form.get('file')

  // Comma-separated list — multi-line UPI orders share one proof
  const orderIds = orderIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
  if (orderIds.length === 0) return bad('Missing order ids.')
  if (orderIds.length > 50) return bad('Too many orders.')
  for (const id of orderIds) {
    if (!UUID_RE.test(id)) return bad('Invalid order id.')
  }
  if (!(file instanceof File)) return bad('No file attached.')
  if (!ALLOWED_TYPES.has(file.type)) return bad('Only JPG, PNG, or WEBP screenshots are allowed.')
  if (file.size === 0) return bad('Empty file.')
  if (file.size > MAX_BYTES) return bad('Screenshot is too large. Max 5MB.')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Confirm every order belongs to this consumer — refuse the entire batch if not
  const { data: orders } = await supabase
    .from('orders')
    .select('id, consumer_id')
    .in('id', orderIds)

  if (!orders || orders.length !== orderIds.length) {
    return bad('Order not found.', 404)
  }
  if (orders.some((o) => o.consumer_id !== session.consumerId)) {
    return bad('Not your order.', 403)
  }

  const ext = file.type === 'image/png' ? 'png'
    : file.type === 'image/webp' ? 'webp'
    : 'jpg'
  const path = `${session.consumerId}/${orderIds[0]}-${Date.now()}.${ext}`

  const { error: upErr } = await supabase.storage
    .from('payment-proofs')
    .upload(path, file, { contentType: file.type, upsert: true })

  if (upErr) {
    console.error('[YFF] proof upload failed:', upErr.message)
    return bad('Could not save screenshot. Please try again.', 500)
  }

  const { error: updErr } = await supabase
    .from('orders')
    .update({ payment_proof_path: path })
    .in('id', orderIds)

  if (updErr) {
    console.error('[YFF] proof path save failed:', updErr.message)
    return bad('Saved screenshot but could not link it. Please contact support.', 500)
  }

  return NextResponse.json({ ok: true, path })
}

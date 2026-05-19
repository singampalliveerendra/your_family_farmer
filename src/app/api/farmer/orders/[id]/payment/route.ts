import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED = new Set(['completed', 'failed', 'pending'])

// Farmer confirms (or rejects) a payment. Marking a payment `completed` also
// approves the order — that pairing used to live in the browser, which meant
// anyone could mark any order paid. It is now gated by the farmer cookie.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const status = String((body && (body as { status?: unknown }).status) ?? '')
  if (!ALLOWED.has(status)) {
    return NextResponse.json({ error: 'Invalid payment status.' }, { status: 400 })
  }
  // `approve: true` also moves the order to `approved` in the same write —
  // used by the "payment verified" action. Plain "mark paid" leaves the
  // order's approval state untouched.
  const approve = (body as { approve?: unknown }).approve === true

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const update: Record<string, string> = { payment_status: status }
  if (approve) update.status = 'approved'

  const { data, error } = await supabase
    .from('orders')
    .update(update)
    .eq('id', id)
    .eq('farmer_id', session.farmerId)
    .select('id')

  if (error) {
    console.error('[YFF] update payment status failed:', error.message)
    return NextResponse.json({ error: 'Could not update payment.' }, { status: 500 })
  }
  if (!data?.length) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

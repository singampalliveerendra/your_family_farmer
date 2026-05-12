import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getRiderSessionFromRequest } from '@/lib/rider-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  const session = getRiderSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not logged in.' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: rider } = await supabase
    .from('delivery_boys')
    .select('id, status')
    .eq('id', session.riderId)
    .maybeSingle()
  if (!rider || rider.status !== 'active') {
    return NextResponse.json({ error: 'Account not active.' }, { status: 403 })
  }

  const { data: updated, error } = await supabase
    .from('orders')
    .update({ delivery_status: 'out_for_delivery', out_for_delivery_at: new Date().toISOString() })
    .eq('id', id)
    .eq('delivery_boy_id', session.riderId)
    .eq('delivery_status', 'picked_up')
    .select('id')

  if (error) {
    console.error('[YFF rider/out-for-delivery] update failed:', error.message)
    return NextResponse.json({ error: 'Could not update.' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Mark the order as picked up first.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}

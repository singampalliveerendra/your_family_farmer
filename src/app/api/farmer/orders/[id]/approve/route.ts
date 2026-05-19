import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Approve a pending order. The `.eq('farmer_id', ...)` clause is the
// ownership gate — a farmer can never approve another farmer's order.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'approved' })
    .eq('id', id)
    .eq('farmer_id', session.farmerId)
    .select('id')

  if (error) {
    console.error('[YFF] approve order failed:', error.message)
    return NextResponse.json({ error: 'Could not approve order.' }, { status: 500 })
  }
  if (!data?.length) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

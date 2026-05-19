import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Approved + declined orders for the farmer's order-history page.
export async function GET(req: NextRequest) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data } = await supabase
    .from('orders')
    .select('*')
    .eq('farmer_id', session.farmerId)
    .in('status', ['approved', 'declined'])
    .order('created_at', { ascending: false })

  return NextResponse.json({ orders: data ?? [] })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Dashboard order data. The farmer id comes from the signed cookie — never
// from the client — so a farmer can only ever see their own orders.
export async function GET(req: NextRequest) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [pendingRes, approvedRes, monthlyRes] = await Promise.all([
    supabase
      .from('orders')
      .select('*')
      .eq('farmer_id', session.farmerId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('id, total_price')
      .eq('farmer_id', session.farmerId)
      .eq('status', 'approved')
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
    supabase
      .from('orders')
      .select('id, total_price, created_at')
      .eq('farmer_id', session.farmerId)
      .eq('status', 'approved')
      .gte('created_at', monthStart.toISOString()),
  ])

  const approved = approvedRes.data ?? []
  const monthly = monthlyRes.data ?? []

  // Monthly earnings split into 4 weekly buckets (days 1-7, 8-14, 15-21, 22+)
  const weeklyEarnings = [0, 0, 0, 0]
  for (const o of monthly) {
    const day = new Date(o.created_at as string).getDate()
    const bucket = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3
    weeklyEarnings[bucket] += o.total_price ?? 0
  }

  return NextResponse.json({
    pendingOrders: pendingRes.data ?? [],
    approvedCount: approved.length,
    totalRevenue: approved.reduce((s, o) => s + (o.total_price ?? 0), 0),
    monthlyRevenue: monthly.reduce((s, o) => s + (o.total_price ?? 0), 0),
    monthlyOrderCount: monthly.length,
    weeklyEarnings,
  })
}

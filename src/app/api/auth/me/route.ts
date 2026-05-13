import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest, clearFarmerSessionCookie } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ farmer: null }, { status: 200 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: farmer } = await supabase
    .from('farmers')
    .select('id, name, slug, phone, active')
    .eq('id', session.farmerId)
    .maybeSingle()

  if (!farmer || farmer.active === false) {
    const res = NextResponse.json({ farmer: null }, { status: 200 })
    clearFarmerSessionCookie(res)
    return res
  }

  return NextResponse.json({ farmer })
}

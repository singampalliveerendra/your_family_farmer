import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getRiderSessionFromRequest, clearRiderSessionCookie } from '@/lib/rider-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getRiderSessionFromRequest(req)
  if (!session) return NextResponse.json({ rider: null }, { status: 200 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: rider } = await supabase
    .from('delivery_boys')
    .select('id, name, phone, status, vehicle_type, vehicle_number')
    .eq('id', session.riderId)
    .maybeSingle()

  // Cookie references a deleted or deactivated account — clear it so the
  // client treats us as logged out.
  if (!rider || rider.status !== 'active') {
    const res = NextResponse.json({ rider: null }, { status: 200 })
    clearRiderSessionCookie(res)
    return res
  }

  return NextResponse.json({ rider })
}

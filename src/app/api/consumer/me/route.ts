import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest, clearSessionCookie } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ consumer: null }, { status: 200 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: user } = await supabase
    .from('consumers_auth')
    .select('id, name, phone')
    .eq('id', session.consumerId)
    .maybeSingle()

  if (!user) {
    // Cookie references a deleted account — clear it so the client logs out
    const res = NextResponse.json({ consumer: null }, { status: 200 })
    clearSessionCookie(res)
    return res
  }

  return NextResponse.json({ consumer: user })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { hashPassword } from '@/lib/password'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // The previous version trusted a body-supplied farmerId — that let anyone
  // who guessed/scraped a farmer UUID change their password. Now we read the
  // farmerId from the auth cookie only.
  const session = getFarmerSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (
    !rateLimit(`reset-pw:farmer:${session.farmerId}`, 5, 60 * 60 * 1000) ||
    !rateLimit(`reset-pw:ip:${ip}`, 15, 60 * 60 * 1000)
  ) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const newPassword: string = String((body as { newPassword?: unknown }).newPassword ?? '').trim()

  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
  }
  if (newPassword.length > 128) {
    return NextResponse.json({ error: 'Password is too long.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error } = await supabase
    .from('farmers')
    .update({ password_hash: hashPassword(newPassword) })
    .eq('id', session.farmerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

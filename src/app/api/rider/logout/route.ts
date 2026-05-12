import { NextResponse } from 'next/server'
import { clearRiderSessionCookie } from '@/lib/rider-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  clearRiderSessionCookie(res)
  return res
}

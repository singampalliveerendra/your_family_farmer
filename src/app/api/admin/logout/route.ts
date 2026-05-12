import { NextResponse } from 'next/server'
import { clearAdminSessionCookie } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  clearAdminSessionCookie(res)
  return res
}

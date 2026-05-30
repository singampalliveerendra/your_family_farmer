import { NextResponse } from 'next/server'
import { clearModeratorSessionCookie } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  clearModeratorSessionCookie(res)
  return res
}

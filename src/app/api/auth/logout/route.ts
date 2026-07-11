import { NextResponse } from 'next/server'
import { clearFarmerSessionCookie } from '@/lib/farmer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Farmer logout. Clearing localStorage on the client is not enough — the
// HTTP-only session cookie can only be dropped by the server.
export async function POST() {
  const res = NextResponse.json({ ok: true })
  clearFarmerSessionCookie(res)
  return res
}

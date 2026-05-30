import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ok = isModeratorRequest(req)
  return NextResponse.json({ moderator: ok, zone: ok ? getModeratorZone() : null })
}

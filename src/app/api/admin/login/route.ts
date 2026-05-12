import { NextRequest, NextResponse } from 'next/server'
import { getAdminPassword, setAdminSessionCookie } from '@/lib/admin-session'
import { rateLimit } from '@/lib/rate-limit'
import { timingSafeEqual } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a)
  const B = Buffer.from(b)
  if (A.length !== B.length) return false
  return timingSafeEqual(A, B)
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`admin-login:${ip}`, 5, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts. Wait 15 min.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const password = String((body && (body as { password?: unknown }).password) ?? '')
  if (!password) return NextResponse.json({ error: 'Password required.' }, { status: 400 })

  let expected: string
  try {
    expected = getAdminPassword()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server misconfigured.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  if (!safeEqual(password, expected)) {
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  setAdminSessionCookie(res)
  return res
}

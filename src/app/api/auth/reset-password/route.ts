import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { scryptSync, randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const farmerId: string    = String(body.farmerId ?? '').trim()
  const newPassword: string = String(body.newPassword ?? '').trim()

  if (!farmerId) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }
  if (newPassword.length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error } = await supabase
    .from('farmers')
    .update({ password_hash: hashPassword(newPassword) })
    .eq('id', farmerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid rider id.' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: rider } = await supabase
    .from('delivery_boys')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (!rider) return NextResponse.json({ error: 'Rider not found.' }, { status: 404 })
  if (rider.status === 'active') {
    return NextResponse.json({ error: 'Rider is already active.' }, { status: 409 })
  }
  if (rider.status === 'suspended') {
    return NextResponse.json({ error: 'Rider is suspended. Reinstate first.' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { error: updErr } = await supabase
    .from('delivery_boys')
    .update({
      status: 'active',
      activation_code: null,
      approved_at: now,
      activated_at: now,
    })
    .eq('id', id)

  if (updErr) {
    console.error('[YFF admin/approve] update failed:', updErr.message)
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

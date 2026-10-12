import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { parseAddress, addressFromRow, addressToRow } from '@/lib/savedAddress'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The signed-in buyer's saved delivery address (consumers_auth.address_*).
// consumers_auth is service-role only, so the session cookie is the only key —
// the account id never comes from the client.

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const COLUMNS = 'address_line, address_city, address_landmark, address_pincode, address_alt_phone'

// GET → { address: SavedAddress | null }
export async function GET(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required.' }, { status: 401 })

  const { data, error } = await svc()
    .from('consumers_auth')
    .select(COLUMNS)
    .eq('id', session.consumerId)
    .maybeSingle()
  if (error) {
    console.error('[YFF consumer/profile] read failed:', error.message)
    return NextResponse.json({ error: 'Could not load your address.' }, { status: 500 })
  }
  return NextResponse.json({ address: addressFromRow(data) })
}

// PUT { address, city, landmark?, pincode, altPhone? } → { address }
export async function PUT(req: NextRequest) {
  const session = getConsumerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = parseAddress(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { error } = await svc()
    .from('consumers_auth')
    .update(addressToRow(parsed.value))
    .eq('id', session.consumerId)
  if (error) {
    console.error('[YFF consumer/profile] save failed:', error.message)
    return NextResponse.json({ error: 'Could not save your address.' }, { status: 500 })
  }
  return NextResponse.json({ address: parsed.value })
}

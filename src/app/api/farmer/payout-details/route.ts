import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'
import { maskAccountNumber, validatePayout } from '@/lib/payout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Payout account details for the logged-in seller — farmer or aggregator alike,
// since an aggregator is a `farmers` row with account_type = 'aggregator'.
//
// Everything here runs on the service-role key. payout_accounts has RLS enabled
// with no policy at all, so the browser cannot reach it directly under any
// circumstance; this route is the only way in, and it is gated on the signed
// farmer cookie.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Returns what is on file, with the account number masked to its last four
 * digits. The full number is never sent back to the browser — changing it means
 * retyping it, so a stolen session cannot read it out of the dashboard.
 */
export async function GET(request: NextRequest) {
  const session = getFarmerSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })

  const { data, error } = await admin()
    .from('payout_accounts')
    .select('account_holder_name, account_number, ifsc, upi_id, verified_at, updated_at')
    .eq('owner_id', session.farmerId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: true, hasAccount: false })

  return NextResponse.json({
    ok: true,
    hasAccount: true,
    accountHolderName: data.account_holder_name,
    accountLast4: maskAccountNumber(String(data.account_number)),
    ifsc: data.ifsc,
    upiId: data.upi_id,
    verifiedAt: data.verified_at,
    updatedAt: data.updated_at,
  })
}

/** Creates or replaces the seller's payout account. One row per owner. */
export async function POST(request: NextRequest) {
  const session = getFarmerSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const parsed = validatePayout(body as Record<string, unknown>)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  // owner_id comes from the cookie, never the body — the client cannot write
  // somebody else's payout account.
  const { error } = await admin()
    .from('payout_accounts')
    .upsert(
      {
        owner_id: session.farmerId,
        ...parsed.value,
        // Changing the destination invalidates any earlier check we did on it,
        // so verification has to start again.
        verified_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id' },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    accountLast4: maskAccountNumber(parsed.value.account_number),
  })
}

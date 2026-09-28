import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest, refreshFarmerSessionCookie } from '@/lib/farmer-session'
import { setSessionCookie } from '@/lib/session'
import {
  LINKED_ACCOUNT_NO_PASSWORD,
  buyerProfileForSeller,
  sellerRole,
} from '@/lib/sellerBuyerLink'
import { BUYER_VIEW_COOKIE } from '@/lib/buyerView'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Hands a signed-in seller a buyer session so they can shop from other farmers
// and see their own listings the way a buyer does — without a second sign-up.
//
// The seller cookie is the only credential accepted here; the phone comes from
// the `farmers` row, never from the request body, so the caller cannot name
// someone else's buyer account.
export async function POST(req: NextRequest) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: seller, error: sellerErr } = await supabase
    .from('farmers')
    .select('id, name, phone, account_type, active')
    .eq('id', session.farmerId)
    .maybeSingle()

  if (sellerErr) {
    console.error('[YFF buyer-session] seller lookup failed:', sellerErr.code, sellerErr.message)
    return NextResponse.json({ error: 'Could not open buyer view. Please try again.' }, { status: 500 })
  }
  if (!seller || seller.active === false) {
    return NextResponse.json({ error: 'Please log in.' }, { status: 401 })
  }

  const derived = buyerProfileForSeller(seller)
  if (!derived.ok) return NextResponse.json({ error: derived.error }, { status: 400 })
  const { name, phone } = derived.profile

  const { data: existing, error: lookupErr } = await supabase
    .from('consumers_auth')
    .select('id, name, phone, suspended, suspended_reason')
    .eq('phone', phone)
    .maybeSingle()

  if (lookupErr) {
    console.error('[YFF buyer-session] buyer lookup failed:', lookupErr.code, lookupErr.message)
    return NextResponse.json({ error: 'Could not open buyer view. Please try again.' }, { status: 500 })
  }

  // A suspended buyer account stays suspended when reached this way. The switch
  // is a shortcut past the password, never past a moderator's decision.
  if (existing?.suspended === true) {
    return NextResponse.json(
      {
        error: 'Your buyer account has been suspended. Please contact support.',
        suspended: true,
        suspendedReason: (existing.suspended_reason as string | null) ?? null,
      },
      { status: 403 },
    )
  }

  let buyer = existing ? { id: existing.id, name: existing.name, phone: existing.phone } : null

  if (!buyer) {
    const { data: created, error: insertErr } = await supabase
      .from('consumers_auth')
      .insert({ name, phone, password_hash: LINKED_ACCOUNT_NO_PASSWORD })
      .select('id, name, phone')
      .single()

    if (insertErr || !created) {
      console.error('[YFF buyer-session] insert failed:', insertErr?.code, insertErr?.message)
      return NextResponse.json(
        { error: 'Could not open buyer view. Please try again.' },
        { status: 500 },
      )
    }
    buyer = created
  }

  const res = NextResponse.json({
    ok: true,
    consumer: { id: buyer.id, name: buyer.name, phone: buyer.phone },
    role: sellerRole(seller.account_type),
  })

  try {
    setSessionCookie(res, buyer.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Session setup failed.'
    console.error('[YFF buyer-session] setSessionCookie failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Marker cookie, readable by JS: the buyer pages render the "back to my
  // dashboard" bar off it with no round-trip, and farmer logout reads it to
  // know the buyer session was borrowed and should go too.
  res.cookies.set(BUYER_VIEW_COOKIE, sellerRole(seller.account_type), {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })

  // The seller stays signed in on the seller side — that is the whole point of
  // a switch — so keep their 30-day window sliding like every other farmer call.
  refreshFarmerSessionCookie(res, session)
  return res
}

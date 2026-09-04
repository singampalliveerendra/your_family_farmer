import { NextRequest, NextResponse } from 'next/server'
import { clearFarmerSessionCookie } from '@/lib/farmer-session'
import { clearSessionCookie } from '@/lib/session'
import { BUYER_VIEW_COOKIE, parseBuyerView } from '@/lib/buyerView'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Farmer logout. Clearing localStorage on the client is not enough — the
// HTTP-only session cookie can only be dropped by the server.
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true })
  clearFarmerSessionCookie(res)

  // A buyer session the seller borrowed through the buyer-view switch goes with
  // them. Phones get shared here; leaving a live buyer session behind on a
  // logged-out device would let the next person read this seller's orders and
  // place COD ones. The marker is what says the session was borrowed — someone
  // who signed in as a buyer in their own right keeps that session.
  if (parseBuyerView(req.cookies.get(BUYER_VIEW_COOKIE)?.value)) {
    clearSessionCookie(res)
    res.cookies.set(BUYER_VIEW_COOKIE, '', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
  }
  return res
}

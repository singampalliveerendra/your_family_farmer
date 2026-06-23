import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// DISABLED. Self-pickup can no longer be closed on trust with a single tap —
// the farmer must enter the buyer's 4-digit handover code, which is verified by
// /api/farmer/orders/[id]/confirm-pickup. This endpoint is kept only to reject
// any old client that still calls it, so there's no unverified way to mark an
// order collected.
export async function POST() {
  return NextResponse.json(
    { error: "Pickup must be confirmed with the buyer's 4-digit code. Please update the app." },
    { status: 410 },
  )
}

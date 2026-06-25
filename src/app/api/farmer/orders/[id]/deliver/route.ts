import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// DISABLED. The farmer no longer closes a delivery himself. The farmer marks the
// order Shipped (trust-based dispatch, via /ship), and the BUYER confirms receipt
// from their order page ("Delivered"/"Received", via the consumer /received
// route), which stamps received_at and resolves the order. This endpoint is kept
// only to reject any old client that still calls it.
export async function POST() {
  return NextResponse.json(
    { error: 'Mark the order Shipped — the buyer confirms delivery from their order page. Please update the app.' },
    { status: 410 },
  )
}

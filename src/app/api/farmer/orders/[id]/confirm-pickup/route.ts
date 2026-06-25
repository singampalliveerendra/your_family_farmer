import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// DISABLED. The farmer no longer confirms a self-pickup handover. The BUYER
// confirms collection from their own order page ("Mark as Picked up", via the
// consumer /received route), which stamps collected_at and resolves the order.
// This endpoint is kept only to reject any old client that still calls it.
export async function POST() {
  return NextResponse.json(
    { error: 'The buyer confirms pickup from their order page now. Please update the app.' },
    { status: 410 },
  )
}

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// DISABLED. A farmer-delivered order is no longer closed by a trust-based
// "Shipped" tap. The farmer delivers it himself and confirms with the buyer's
// 4-digit handover code, verified by /api/farmer/orders/[id]/deliver. This
// endpoint is kept only to reject any old client that still calls it.
export async function POST() {
  return NextResponse.json(
    { error: "Delivery must be confirmed with the buyer's 4-digit code. Please update the app." },
    { status: 410 },
  )
}

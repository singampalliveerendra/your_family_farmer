import { NextRequest, NextResponse } from 'next/server'
import { requireAggregator, svc } from '@/lib/aggregator-auth'
import { abandonBulkCheckout } from '@/lib/bulkOrderServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The aggregator closed the bulk checkout without paying: cancel the unpaid
// order and give its stock back — but only once Cashfree confirms it can no
// longer be paid (src/lib/bulkOrderServer.ts abandonBulkCheckout).

const CF_ID = /^gg_[0-9a-f]{32}_[0-9a-z]+$/

export async function POST(req: NextRequest) {
  const agg = await requireAggregator(req)
  if (!agg) return NextResponse.json({ error: 'Aggregator login required.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { cashfreeOrderId?: unknown } | null
  const cashfreeOrderId = typeof body?.cashfreeOrderId === 'string' ? body.cashfreeOrderId : ''
  if (!CF_ID.test(cashfreeOrderId)) return NextResponse.json({ error: 'Invalid payment.' }, { status: 400 })
  const r = await abandonBulkCheckout(svc(), agg.id, cashfreeOrderId)
  return NextResponse.json({ ok: true, ...r })
}

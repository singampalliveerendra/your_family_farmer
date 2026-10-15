import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'
import { rateLimit } from '@/lib/rate-limit'
import { notifyOrdersDelivered } from '@/lib/orderNotify'
import {
  cleanResolveNote,
  closingColumn,
  farmerResolveBlock,
  farmerResolveUpdate,
  isMissingResolveColumn,
} from '@/lib/farmerResolve'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Farmer / aggregator marks an approved order Resolved without the buyer's
// handover code — for when the produce has changed hands but the buyer can't
// be reached to read the code. Stamps the same closing column the code would
// have (so every screen treats it as completed) plus farmer_resolved_at (so
// the buyer is told the farmer marked it, not that a code was given). Rules:
// src/lib/farmerResolve.ts.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 })

  if (!rateLimit(`farmer-resolve:${session.farmerId}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a few minutes.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const note = cleanResolveNote(body && (body as { note?: unknown }).note)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: order, error: loadErr } = await supabase
    .from('orders')
    .select('id, farmer_id, status, delivery_type, delivery_status, shipped_at, collected_at, received_at')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: 'Could not load the order.' }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.farmer_id !== session.farmerId) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }

  const block = farmerResolveBlock(order)
  if (block) return NextResponse.json({ error: block.error }, { status: block.status })

  const col = closingColumn(order)
  const update = farmerResolveUpdate(order, new Date().toISOString())

  // Guarded on the state just checked, so a buyer's code or a cancel landing
  // in between wins and this becomes a no-op 409 instead of a double close.
  const { data: updated, error: updErr } = await supabase
    .from('orders')
    .update(update)
    .eq('id', id)
    .eq('farmer_id', session.farmerId)
    .eq('status', 'approved')
    .is(col, null)
    .select('id, shipped_at, collected_at, received_at, farmer_resolved_at')

  if (updErr) {
    if (isMissingResolveColumn(updErr)) {
      // Refuse rather than close it without the marker: the buyer would then
      // be told the farmer confirmed it with their code, which never happened.
      console.error('[YFF farmer/resolve] farmer_resolved_at missing — run scripts/farmer-resolve-migration.sql')
      return NextResponse.json({ error: 'This feature is not switched on yet. Please contact support.' }, { status: 503 })
    }
    console.error('[YFF farmer/resolve] update failed:', updErr.message)
    return NextResponse.json({ error: 'Could not mark the order resolved. Please try again.' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'This order changed just now. Refresh and try again.' }, { status: 409 })
  }

  // Audit trail: who closed it and why. Best effort — the order is already
  // resolved, a failed log line must not turn that into an error.
  const { error: logErr } = await supabase.from('order_events').insert({
    order_id: id,
    event_type: 'farmer_resolved',
    from_status: 'approved',
    to_status: 'completed',
    actor_type: 'farmer',
    actor_id: session.farmerId,
    note: note || null,
    metadata: { closed_column: col, delivery_type: order.delivery_type ?? null },
  })
  if (logErr) console.error('[YFF farmer/resolve] order_events insert failed:', logErr.message)

  // WhatsApp "order received" (with the Rate button) to the buyer, as for a
  // code handover. Sent after the response; never fails the resolve.
  notifyOrdersDelivered(supabase, [id])

  return NextResponse.json({ ok: true, order: updated[0] })
}

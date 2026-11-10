import { createClient } from '@supabase/supabase-js'
import { applyRetailReach } from '@/lib/retailReach'
import { NextRequest, NextResponse } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'
import { RETAIL_PRICE_KEYS, bothPricesError, resolveWholesaleColumns, touchesBothPriceRule, withoutWholesale } from '@/lib/wholesale'
import { SELLING_PLAN_REQUIRED, isSellingPlanError } from '@/lib/sellingLock'
import { reqLang, tr } from '@/lib/serverLang'
import { checkSellerStatusChange, sellerListingPayload } from '@/lib/sellerWriteRules'
import { PACKS_NOT_READY, applyRetailPackColumns, isPackColumnMissing } from '@/lib/packPricing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Keys a seller may never set (ownership, audit, ratings) and the statuses
// they may set live in src/lib/sellerWriteRules.ts. Since the security fix
// (2026-11-04) this route is the ONLY way a seller edits a listing — the
// browser can no longer write produce_listings directly — so pause / resume
// and the quality fields come through here too.

export async function POST(request: NextRequest) {
  // farmerId now comes from the signed cookie, not the request body.
  const session = getFarmerSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { listingId, payload } = body as { listingId?: unknown; payload?: unknown }
  if (typeof listingId !== 'string' || !UUID_RE.test(listingId)) {
    return NextResponse.json({ error: 'Invalid listing id' }, { status: 400 })
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  // Strip the keys a seller may never set before forwarding to the DB.
  const cleanPayload: Record<string, unknown> = sellerListingPayload(payload as Record<string, unknown>)

  // Verify the listing belongs to the logged-in farmer. We also pull the
  // current status + stock so we can keep the sold-out flag in sync below.
  const { data: existing } = await supabaseAdmin
    .from('produce_listings')
    .select('id, status, stock_qty, unit')
    .eq('id', listingId)
    .eq('farmer_id', session.farmerId)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Listing not found or access denied' }, { status: 403 })
  }

  // Only seller statuses, and never out of a moderator takedown / plan hold.
  const statusCheck = checkSellerStatusChange(existing.status as string | null, cleanPayload.status)
  if (!statusCheck.ok) {
    return NextResponse.json({ error: tr(reqLang(request), statusCheck.error.en, statusCheck.error.te) }, { status: 403 })
  }

  // Wholesale fields get the same rules as the form (src/lib/wholesale.ts),
  // normalised before they reach the DB. Untouched when none are sent.
  const unit = typeof cleanPayload.unit === 'string' ? cleanPayload.unit : (existing.unit as string | null)
  const wholesale = resolveWholesaleColumns(cleanPayload, unit)
  if (!wholesale.ok) {
    return NextResponse.json({ error: tr(reqLang(request), wholesale.error.en, wholesale.error.te) }, { status: 400 })
  }
  if (wholesale.columns) {
    const rest = withoutWholesale(cleanPayload)
    for (const k of Object.keys(cleanPayload)) delete cleanPayload[k]
    Object.assign(cleanPayload, rest, wholesale.columns)
  }

  // Retail packs (2026-11-10): same rules as the form; the per-unit columns
  // are derived from the pack, whatever the request sent.
  const packErr = applyRetailPackColumns(cleanPayload, unit)
  if (packErr) return NextResponse.json({ error: tr(reqLang(request), packErr.en, packErr.te) }, { status: 400 })

  // Local only / Transportable across AP & TG (2026-11-05).
  const reachErr = applyRetailReach(cleanPayload, cleanPayload, typeof cleanPayload.delivery_mode === 'string' ? cleanPayload.delivery_mode : null)
  if (reachErr) return NextResponse.json({ error: tr(reqLang(request), reachErr.en, reachErr.te) }, { status: 400 })

  // Both: wholesale must be cheaper than every retail price (2026-11-05).
  // Checked on the row as it WILL be — saved values plus this change — and only
  // when the change touches a price or the sale mode, so a status flip or a
  // quality edit never trips over an older listing. Best-effort read: a
  // database without the wholesale columns simply skips the check.
  if (touchesBothPriceRule(cleanPayload)) {
    const BOTH_PRICE_COLUMNS = ['sale_mode', 'wholesale_price', ...RETAIL_PRICE_KEYS].join(', ')
    const { data: saved } = await supabaseAdmin
      .from('produce_listings')
      .select(BOTH_PRICE_COLUMNS)
      .eq('id', listingId)
      .maybeSingle()
    if (saved) {
      const priceErr = bothPricesError({ ...(saved as unknown as Record<string, unknown>), ...cleanPayload })
      if (priceErr) return NextResponse.json({ error: tr(reqLang(request), priceErr.en, priceErr.te) }, { status: 400 })
    }
  }

  // Stock ↔ status sync. Whenever a farmer edits the quantity we refresh the
  // sold-out flag: raising stock above 0 clears a stuck "sold_out" so the
  // listing goes live again, and dropping stock to 0 marks it sold out. We only
  // ever flip between these two states, so moderator states (suspended,
  // rejected, pending_review) and "coming_soon" are never clobbered. If the
  // client explicitly sent a status we respect it and skip the auto-sync.
  if (!('status' in cleanPayload)) {
    const nextStock =
      'stock_qty' in cleanPayload
        ? (cleanPayload.stock_qty as number | null)
        : (existing.stock_qty as number | null)
    if (typeof nextStock === 'number') {
      if (nextStock > 0 && existing.status === 'sold_out') {
        cleanPayload.status = 'available'
      } else if (nextStock <= 0 && existing.status === 'available') {
        cleanPayload.status = 'sold_out'
      }
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from('produce_listings')
    .update(cleanPayload)
    .eq('id', listingId)
    .eq('farmer_id', session.farmerId)
    .select('id, status, stock_qty')

  if (error && isPackColumnMissing(error.message)) {
    return NextResponse.json({ error: tr(reqLang(request), PACKS_NOT_READY.en, PACKS_NOT_READY.te) }, { status: 503 })
  }

  // The selling lock (Phase 7): an aggregator without a Selling plan cannot
  // put produce back on sale.
  if (error && isSellingPlanError(error.message)) {
    return NextResponse.json({ error: tr(reqLang(request), SELLING_PLAN_REQUIRED.en, SELLING_PLAN_REQUIRED.te), code: 'SELLING_PLAN_REQUIRED' }, { status: 403 })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated?.length) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  // Return the resolved status/stock so the dashboard card can update instantly
  // (the form merges this into local state before the background refetch lands).
  return NextResponse.json({
    ok: true,
    status: updated[0].status,
    stock_qty: updated[0].stock_qty,
  })
}

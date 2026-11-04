import { NextRequest, NextResponse } from 'next/server'
import { requireSeller, svc } from '@/lib/sellerAuth'
import { checkSellerStatusChange, sellerListingPayload } from '@/lib/sellerWriteRules'
import { isWholesaleColumnMissing, resolveWholesaleColumns, withoutWholesale, WHOLESALE_NOT_READY } from '@/lib/wholesale'
import { SELLING_PLAN_REQUIRED, isSellingPlanError } from '@/lib/sellingLock'
import { isMissingColumnError } from '@/lib/missingColumn'
import { reqLang, tr } from '@/lib/serverLang'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Add a produce for the logged-in seller (dashboard form + the public-profile
// quick add). Before the security fix the browser inserted straight into
// produce_listings with the public key; now the owner comes from the signed
// cookie and the same rules as an edit apply: no protected keys, only seller
// statuses, wholesale normalised, the grower trigger and the selling lock.

export async function POST(req: NextRequest) {
  const supabase = svc()
  const me = await requireSeller(req, supabase)
  if (!me) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })
  const lang = reqLang(req)
  const t = (en: string, te: string) => tr(lang, en, te)

  const body = (await req.json().catch(() => null)) as { payload?: unknown } | null
  const raw = body?.payload
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const payload = sellerListingPayload(raw as Record<string, unknown>)
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  if (!name) return NextResponse.json({ error: t('Enter the produce name.', 'ఉత్పత్తి పేరు నమోదు చేయండి.') }, { status: 400 })
  payload.name = name.slice(0, 120)

  const status = payload.status ?? 'available'
  const sc = checkSellerStatusChange(null, status)
  if (!sc.ok) return NextResponse.json({ error: t(sc.error.en, sc.error.te) }, { status: 400 })
  payload.status = status

  const unit = typeof payload.unit === 'string' ? payload.unit : null
  const wholesale = resolveWholesaleColumns(payload, unit)
  if (!wholesale.ok) return NextResponse.json({ error: t(wholesale.error.en, wholesale.error.te) }, { status: 400 })
  let row: Record<string, unknown> = { ...(wholesale.columns ? { ...withoutWholesale(payload), ...wholesale.columns } : payload), farmer_id: me.id }

  const insert = (r: Record<string, unknown>) => supabase.from('produce_listings').insert(r).select('*').single()
  let { data, error } = await insert(row)
  let stepNotSaved = false
  // Same pre-migration fallback the dashboard used: publish without the step
  // rather than refuse the whole listing.
  if (error && isMissingColumnError(error.message, 'sale_step') && 'sale_step' in row) {
    const { sale_step: _s, ...rest } = row
    row = rest
    ;({ data, error } = await insert(row))
    stepNotSaved = !error
  }
  if (error && isWholesaleColumnMissing(error.message)) return NextResponse.json({ error: t(WHOLESALE_NOT_READY.en, WHOLESALE_NOT_READY.te) }, { status: 503 })
  if (error && isSellingPlanError(error.message)) {
    return NextResponse.json({ error: t(SELLING_PLAN_REQUIRED.en, SELLING_PLAN_REQUIRED.te), code: 'SELLING_PLAN_REQUIRED' }, { status: 403 })
  }
  if (error && /source farmer|grower/i.test(error.message)) {
    return NextResponse.json({ error: t('Choose the farmer who grows this produce.', 'ఈ ఉత్పత్తిని పండించే రైతును ఎంచుకోండి.') }, { status: 400 })
  }
  if (error || !data) {
    console.error('[YFF farmer/listings POST] insert failed:', error?.message)
    return NextResponse.json({ error: t('Could not add the produce. Please try again.', 'ఉత్పత్తి చేర్చలేకపోయాం. మళ్లీ ప్రయత్నించండి.') }, { status: 500 })
  }
  return NextResponse.json({ ok: true, listing: data, stepNotSaved })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Which DB status(es) each UI tab maps to. The "rejected" tab doubles as the
// home for moderator-suspended listings so a pulled listing is still visible.
const TAB_STATUS: Record<string, string[]> = {
  pending: ['pending_review'],
  active: ['available'],
  rejected: ['rejected', 'suspended'],
}

// GET — listings in the moderator's zone for one tab, newest-pending first.
// Each row carries the farmer's name so the card can show it.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone(req)
  const supabase = svc()

  const tab = req.nextUrl.searchParams.get('tab') ?? 'pending'
  const statuses = TAB_STATUS[tab] ?? TAB_STATUS.pending

  // Farmers in this zone — listings are scoped through them.
  const { data: zoneFarmers, error: fErr } = await supabase
    .from('farmers')
    .select('id, name')
    .eq('region_slug', zone)
  if (fErr) {
    console.error('[YFF moderator/listings] farmers query failed:', fErr.message)
    return NextResponse.json({ error: fErr.message }, { status: 500 })
  }
  const nameById = new Map((zoneFarmers ?? []).map((f) => [f.id, f.name]))
  const farmerIds = (zoneFarmers ?? []).map((f) => f.id)
  if (farmerIds.length === 0) return NextResponse.json({ listings: [] })

  // Pending oldest-first (act on the longest-waiting first); others newest-first.
  const ascending = tab === 'pending'
  const { data: listings, error } = await supabase
    .from('produce_listings')
    .select('id, farmer_id, name, variety, method, unit, stock_qty, brix, price_tier_1_price, status, rejection_reason, created_at')
    .in('farmer_id', farmerIds)
    .in('status', statuses)
    .order('created_at', { ascending })
  if (error) {
    console.error('[YFF moderator/listings] listings query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (listings ?? []).map((l) => ({ ...l, farmer_name: nameById.get(l.farmer_id) ?? '—' }))
  return NextResponse.json({ listings: rows })
}

const METHODS = ['natural', 'low_chemical', 'chemical'] as const
const UNITS = ['kg', 'g', 'litre', 'dozen', 'piece', 'bunch'] as const

function toNum(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

// POST — moderator adds a produce listing on behalf of a farmer in their zone.
// Moderator-created listings are trusted, so they go live immediately
// (status 'available') rather than into the pending_review queue.
//   { farmer_id, name, variety?, method, unit, stock_qty?, description?,
//     brix?, price_tier_1_*, price_tier_2_*, harvest_date?, availability_period? }
export async function POST(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone(req)
  const supabase = svc()

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
  const b = body as Record<string, unknown>

  const farmer_id = String(b.farmer_id ?? '').trim()
  const name = String(b.name ?? '').trim()
  if (!farmer_id) return NextResponse.json({ error: 'Choose a farmer.' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'Produce name is required.' }, { status: 400 })

  // The chosen farmer must belong to this moderator's zone.
  const { data: farmer } = await supabase
    .from('farmers').select('id, region_slug').eq('id', farmer_id).maybeSingle()
  if (!farmer || farmer.region_slug !== zone) {
    return NextResponse.json({ error: 'That farmer is not in your zone.' }, { status: 400 })
  }

  const methodRaw = String(b.method ?? 'natural')
  const method = (METHODS as readonly string[]).includes(methodRaw) ? methodRaw : 'natural'
  const unitRaw = String(b.unit ?? 'kg')
  const unit = (UNITS as readonly string[]).includes(unitRaw) ? unitRaw : 'kg'

  const price1 = toNum(b.price_tier_1_price)
  const price1Qty = toNum(b.price_tier_1_qty)
  const price2 = toNum(b.price_tier_2_price)
  const price2Qty = toNum(b.price_tier_2_qty)

  const insert: Record<string, unknown> = {
    farmer_id,
    name,
    emoji: String(b.emoji ?? '📦') || '📦',
    method,
    unit,
    variety: String(b.variety ?? '').trim() || null,
    stock_qty: toNum(b.stock_qty),
    description: String(b.description ?? '').trim() || null,
    brix: toNum(b.brix),
    harvest_date: String(b.harvest_date ?? '').trim() || null,
    availability_period: String(b.availability_period ?? '').trim() || null,
    status: 'available',
  }
  if (price1) { insert.price_tier_1_price = price1; insert.price_tier_1_qty = price1Qty ?? 1 }
  if (price2 && price2Qty) { insert.price_tier_2_price = price2; insert.price_tier_2_qty = price2Qty }

  const { data: created, error } = await supabase
    .from('produce_listings')
    .insert(insert)
    .select('id')
    .single()
  if (error) {
    console.error('[YFF moderator/listings POST] insert failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ id: created.id })
}

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

function parsePrice(v: unknown): number | null | undefined {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.round(n * 100) / 100
}

// PATCH — update a guideline's min/max (the table's auto-save on blur).
//   { min_price?, max_price? }  — either or both
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const { id } = await params
  const zone = getModeratorZone()
  const supabase = svc()

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if ('min_price' in body) {
    const v = parsePrice(body.min_price)
    if (v === undefined) return NextResponse.json({ error: 'Min price must be a non-negative number.' }, { status: 400 })
    update.min_price = v
  }
  if ('max_price' in body) {
    const v = parsePrice(body.max_price)
    if (v === undefined) return NextResponse.json({ error: 'Max price must be a non-negative number.' }, { status: 400 })
    update.max_price = v
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  // Confirm the guideline belongs to this moderator's zone before writing, and
  // validate the resulting min/max pair against whatever isn't being changed.
  const { data: row } = await supabase
    .from('price_guidelines')
    .select('id, region_slug, min_price, max_price')
    .eq('id', id)
    .maybeSingle()
  if (!row || row.region_slug !== zone) {
    return NextResponse.json({ error: 'Price guideline not found in your zone.' }, { status: 404 })
  }

  const nextMin = 'min_price' in update ? (update.min_price as number | null) : row.min_price
  const nextMax = 'max_price' in update ? (update.max_price as number | null) : row.max_price
  if (nextMin != null && nextMax != null && nextMin > nextMax) {
    return NextResponse.json({ error: 'Min price cannot be more than max price.' }, { status: 400 })
  }

  update.updated_at = new Date().toISOString()

  const { data: updated, error } = await supabase
    .from('price_guidelines')
    .update(update)
    .eq('id', id)
    .select('id, crop_name, region_slug, min_price, max_price, unit, updated_at')
    .single()
  if (error) {
    console.error('[YFF moderator/prices PATCH] failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ price: updated })
}

// DELETE — remove a guideline entirely.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const { id } = await params
  const zone = getModeratorZone()
  const supabase = svc()

  const { data: row } = await supabase
    .from('price_guidelines')
    .select('id, region_slug')
    .eq('id', id)
    .maybeSingle()
  if (!row || row.region_slug !== zone) {
    return NextResponse.json({ error: 'Price guideline not found in your zone.' }, { status: 404 })
  }

  const { error } = await supabase.from('price_guidelines').delete().eq('id', id)
  if (error) {
    console.error('[YFF moderator/prices DELETE] failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

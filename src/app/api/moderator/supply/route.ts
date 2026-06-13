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

type Status = 'ok' | 'low' | 'scarce' | 'surplus' | 'none'

// Demand vs supply per crop, monotonic so each crop lands in exactly one band:
//   demand 0  + supply > 0      → surplus (growing something nobody asked for)
//   supply >= demand * 1.5      → surplus
//   supply >= demand            → ok
//   supply >= demand * 0.5      → low
//   else                        → scarce
function classify(demand: number, supply: number): Status {
  if (demand <= 0) return supply > 0 ? 'surplus' : 'none'
  if (supply >= demand * 1.5) return 'surplus'
  if (supply >= demand) return 'ok'
  if (supply >= demand * 0.5) return 'low'
  return 'scarce'
}

// GET — the crop balance table for the moderator's zone. Demand comes from open
// (unfulfilled) demand_intents; supply from available produce_listings of
// farmers in the zone. Crops are matched case-insensitively.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone(req)
  const supabase = svc()

  // Farmers in this zone — supply is scoped to them.
  const { data: farmers, error: fErr } = await supabase
    .from('farmers').select('id').eq('region_slug', zone)
  if (fErr) {
    console.error('[YFF moderator/supply] farmers query failed:', fErr.message)
    return NextResponse.json({ error: fErr.message }, { status: 500 })
  }
  const farmerIds = (farmers ?? []).map((f) => f.id)

  // Open demand, grouped by crop.
  const { data: intents, error: dErr } = await supabase
    .from('demand_intents')
    .select('crop_name, quantity_kg')
    .eq('region_slug', zone)
    .eq('fulfilled', false)
  if (dErr) {
    console.error('[YFF moderator/supply] demand query failed:', dErr.message)
    return NextResponse.json({ error: dErr.message }, { status: 500 })
  }

  // Available supply from this zone's listings, grouped by produce name.
  let listings: { name: string; stock_qty: number | null }[] = []
  if (farmerIds.length > 0) {
    const { data: rows, error: sErr } = await supabase
      .from('produce_listings')
      .select('name, stock_qty')
      .eq('status', 'available')
      .in('farmer_id', farmerIds)
    if (sErr) {
      console.error('[YFF moderator/supply] supply query failed:', sErr.message)
      return NextResponse.json({ error: sErr.message }, { status: 500 })
    }
    listings = rows ?? []
  }

  // Merge by a normalized crop key; keep the first nicely-cased label we see.
  type Row = { crop: string; demand_kg: number; supply_kg: number }
  const byKey = new Map<string, Row>()
  const keyOf = (s: string) => s.trim().toLowerCase()
  const ensure = (label: string): Row => {
    const k = keyOf(label)
    let r = byKey.get(k)
    if (!r) { r = { crop: label.trim(), demand_kg: 0, supply_kg: 0 }; byKey.set(k, r) }
    return r
  }
  for (const i of intents ?? []) {
    if (!i.crop_name) continue
    ensure(i.crop_name).demand_kg += Number(i.quantity_kg) || 0
  }
  for (const l of listings) {
    if (!l.name) continue
    ensure(l.name).supply_kg += Number(l.stock_qty) || 0
  }

  const crops = Array.from(byKey.values())
    .map((r) => ({
      crop: r.crop,
      demand_kg: Math.round(r.demand_kg),
      supply_kg: Math.round(r.supply_kg),
      gap: Math.round(r.supply_kg - r.demand_kg),
      status: classify(r.demand_kg, r.supply_kg),
    }))
    // Most urgent first: scarce, low, then the rest.
    .sort((a, b) => {
      const rank: Record<Status, number> = { scarce: 0, low: 1, ok: 2, surplus: 3, none: 4 }
      return rank[a.status] - rank[b.status] || b.demand_kg - a.demand_kg
    })

  return NextResponse.json({ crops })
}

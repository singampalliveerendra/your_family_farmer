import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'
import { computeDemandSupply } from '@/lib/demand-supply'

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

// GET — the crop balance table for the moderator's zone. Demand and supply are
// computed by the shared helper (orders + open intents vs available produce),
// then classified and sorted most-urgent-first.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone(req)
  const supabase = svc()

  let balances
  try {
    balances = await computeDemandSupply(supabase, zone)
  } catch (e) {
    console.error('[YFF moderator/supply] failed:', (e as Error).message)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const crops = balances
    .map((r) => ({
      crop: r.crop,
      demand_kg: r.demand_kg,
      supply_kg: r.supply_kg,
      gap: r.supply_kg - r.demand_kg,
      status: classify(r.demand_kg, r.supply_kg),
    }))
    // Most urgent first: scarce, low, then the rest.
    .sort((a, b) => {
      const rank: Record<Status, number> = { scarce: 0, low: 1, ok: 2, surplus: 3, none: 4 }
      return rank[a.status] - rank[b.status] || b.demand_kg - a.demand_kg
    })

  return NextResponse.json({ crops })
}

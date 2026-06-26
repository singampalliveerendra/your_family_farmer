import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { computeDemandSupply } from '@/lib/demand-supply'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/demand-supply?region=<slug>
// Aggregate demand-vs-supply per crop for a region. Returns only kg totals, so
// it's safe to expose to farmers (no per-order or per-buyer detail leaks).
export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get('region')?.trim()
  if (!region) {
    return NextResponse.json({ error: 'region is required' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    const crops = (await computeDemandSupply(supabase, region))
      // Only crops with some signal, biggest combined first.
      .filter((c) => c.demand_kg > 0 || c.supply_kg > 0)
      .sort((a, b) => (b.demand_kg + b.supply_kg) - (a.demand_kg + a.supply_kg))
    return NextResponse.json({ crops })
  } catch (e) {
    console.error('[YFF demand-supply] failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not load demand vs supply.' }, { status: 500 })
  }
}

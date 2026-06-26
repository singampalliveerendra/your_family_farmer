import type { SupabaseClient } from '@supabase/supabase-js'

export type CropBalance = {
  crop: string
  demand_kg: number
  supply_kg: number
}

// Demand vs supply per crop for one region ("the area").
//
//   supply  = sum of available produce stock from every farmer in the region
//             (all Papaya listed by all farmers, etc.)
//   demand  = sum of ordered quantities from every live order for those farmers'
//             produce (all Papaya ordered by all consumers, excluding
//             declined/cancelled orders)  +  open consumer demand intents.
//
// Crop names are matched case-insensitively and merged into one row each, so
// "Papaya" and "papaya" land in the same bar.
export async function computeDemandSupply(
  supabase: SupabaseClient,
  regionSlug: string,
): Promise<CropBalance[]> {
  // Farmers in this region scope both supply and order-demand.
  const { data: farmers, error: fErr } = await supabase
    .from('farmers').select('id').eq('region_slug', regionSlug)
  if (fErr) throw new Error(fErr.message)
  const farmerIds = (farmers ?? []).map((f) => f.id)

  let listings: { name: string; stock_qty: number | null }[] = []
  let orders: { produce_name: string | null; quantity: number | null }[] = []
  if (farmerIds.length > 0) {
    const [sRes, oRes] = await Promise.all([
      // Available supply from this region's listings.
      supabase.from('produce_listings')
        .select('name, stock_qty').eq('status', 'available').in('farmer_id', farmerIds),
      // Ordered demand — every live order (declined/cancelled don't count).
      supabase.from('orders')
        .select('produce_name, quantity').in('farmer_id', farmerIds)
        .not('status', 'in', '(declined,cancelled)'),
    ])
    if (sRes.error) throw new Error(sRes.error.message)
    if (oRes.error) throw new Error(oRes.error.message)
    listings = sRes.data ?? []
    orders = oRes.data ?? []
  }

  // Open consumer intents add to demand for the same crop.
  const { data: intents, error: dErr } = await supabase
    .from('demand_intents')
    .select('crop_name, quantity_kg')
    .eq('region_slug', regionSlug)
    .eq('fulfilled', false)
  if (dErr) throw new Error(dErr.message)

  const byKey = new Map<string, CropBalance>()
  const keyOf = (s: string) => s.trim().toLowerCase()
  const ensure = (label: string): CropBalance => {
    const k = keyOf(label)
    let r = byKey.get(k)
    if (!r) { r = { crop: label.trim(), demand_kg: 0, supply_kg: 0 }; byKey.set(k, r) }
    return r
  }
  for (const l of listings) {
    if (!l.name) continue
    ensure(l.name).supply_kg += Number(l.stock_qty) || 0
  }
  for (const o of orders) {
    if (!o.produce_name) continue
    ensure(o.produce_name).demand_kg += Number(o.quantity) || 0
  }
  for (const i of intents ?? []) {
    if (!i.crop_name) continue
    ensure(i.crop_name).demand_kg += Number(i.quantity_kg) || 0
  }

  return Array.from(byKey.values()).map((r) => ({
    crop: r.crop,
    demand_kg: Math.round(r.demand_kg),
    supply_kg: Math.round(r.supply_kg),
  }))
}

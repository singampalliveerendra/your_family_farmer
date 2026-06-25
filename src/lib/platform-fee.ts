// Platform fee (a.k.a. moderator commission). A global percentage the moderator
// sets, added on top of the consumer's order subtotal and shown as a
// "Platform fee". Lives in the single-row platform_settings table; each order
// stamps the resolved rupee amount in orders.platform_fee.

import type { SupabaseClient } from '@supabase/supabase-js'

// Resolve the rupee fee for a given subtotal. Rounded to whole rupees; never
// negative. pct is a percentage (5 → 5%).
export function computePlatformFee(subtotal: number, pct: number): number {
  if (!pct || pct <= 0 || !Number.isFinite(pct)) return 0
  if (!subtotal || subtotal <= 0) return 0
  return Math.round((subtotal * pct) / 100)
}

// Read the current fee percentage. Best-effort: if the table doesn't exist yet
// (migration not applied) or anything fails, fall back to 0 so checkout and
// payments are never blocked by the fee.
export async function getPlatformFeePercent(supabase: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('fee_percent')
      .eq('id', 1)
      .maybeSingle()
    if (error) return 0
    const pct = Number(data?.fee_percent)
    return Number.isFinite(pct) && pct > 0 ? pct : 0
  } catch {
    return 0
  }
}

// Part-paid COD: the buyer prepays a deposit online and pays the rest in cash
// at handover.
//
// Why: on full COD a buyer could cancel a confirmed order having risked
// nothing, after the farmer had already harvested for it. The deposit is what
// they stand to lose, so it is NOT refunded when the buyer cancels — only when
// the farmer declines or cancels. Anything that refunds it on a buyer cancel
// defeats the entire feature.
//
// The deposit is also floored at the platform fee, so the moderator's
// commission is genuinely collected on COD instead of existing only as cash
// between buyer and farmer.

import type { SupabaseClient } from '@supabase/supabase-js'

export type CodSplit = {
  // Charged online, now, through the normal Razorpay flow.
  deposit: number
  // Collected in cash at the door (or at the farm on a self-pickup).
  balanceDue: number
}

// Split one order line into "pay now" and "pay at the door".
//
// `lineTotal` is the produce price for the line; `platformFee` and
// `deliveryFee` are that line's own stamped fees. Whole rupees — deposit
// rounds UP so the cash balance is never a fraction the rider has to make
// change for, and the buyer is never under-charged the commission.
export function computeCodSplit(
  lineTotal: number,
  platformFee: number,
  deliveryFee: number,
  depositPercent: number,
): CodSplit {
  const total = Math.max(0, lineTotal) + Math.max(0, platformFee) + Math.max(0, deliveryFee)
  if (total <= 0) return { deposit: 0, balanceDue: 0 }

  const pct = Number.isFinite(depositPercent) && depositPercent > 0 ? depositPercent : 0
  if (pct <= 0) return { deposit: 0, balanceDue: total } // part-payment switched off

  // Floor at the platform fee: a 10% deposit on a small order can be less than
  // the commission, and then a COD order would once again collect no fee.
  const byPercent = Math.ceil((Math.max(0, lineTotal) * pct) / 100)
  const deposit = Math.min(total, Math.max(byPercent, Math.max(0, platformFee)))

  return { deposit, balanceDue: total - deposit }
}

// Read the configured deposit percentage. Best-effort, mirroring
// getPlatformFeePercent: if the column or table isn't migrated yet, fall back
// to 0, which means "no deposit" — COD keeps working exactly as it does today
// rather than checkout breaking.
export async function getCodDepositPercent(supabase: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('cod_deposit_percent')
      .eq('id', 1)
      .maybeSingle()
    if (error) return 0
    const pct = Number(data?.cod_deposit_percent)
    return Number.isFinite(pct) && pct > 0 ? pct : 0
  } catch {
    return 0
  }
}

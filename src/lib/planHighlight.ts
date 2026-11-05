import { durationLabel, planPrice, sortPlans, type Msg, type PlanRow } from '@/lib/subscriptionPlans'

/* What the "subscribe" highlight says (client, 2026-11-05): on the aggregator
 * dashboard for anyone without a live plan, and at the top of /home/aggregator
 * — the lowest current price ("Plans from ₹499 / 1 month") and the biggest
 * running offer. Pure, so the wording is tested. */

export type PlanHighlight = {
  /** Lowest price an aggregator can pay now, and that plan's period. */
  fromPrice: number
  fromPeriod: Msg
  /** Best % off running now (0 = no offer). */
  bestOfferPct: number
  offerEndsAt: string | null
  allFree: boolean
}

export function planHighlight(plans: readonly PlanRow[], now: Date = new Date()): PlanHighlight | null {
  const list = sortPlans(plans, now)
  if (!list.length) return null
  let cheapest = list[0]
  let best = { pct: 0, ends: null as string | null }
  for (const p of list) {
    const pr = planPrice(p, now)
    if (pr.price < planPrice(cheapest, now).price) cheapest = p
    if (pr.savingsPct > best.pct) best = { pct: pr.savingsPct, ends: pr.offerEndsAt }
  }
  const c = planPrice(cheapest, now)
  return {
    fromPrice: c.price,
    fromPeriod: durationLabel(cheapest.duration_days),
    bestOfferPct: best.pct,
    offerEndsAt: best.ends,
    allFree: list.every((p) => planPrice(p, now).free),
  }
}

/** Whether the dashboard should show the big subscribe box (not for live / free-forever plans). */
export const needsSubscribeNudge = (state: string): boolean => state === 'none' || state === 'expired' || state === 'ending'

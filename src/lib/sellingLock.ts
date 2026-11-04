/**
 * The selling lock (Phase 7, decision 2026-11-04): an aggregator needs a live
 * Selling or Combined plan to put produce ON SALE. Enforced by the database
 * trigger in scripts/selling-lock-migration.sql — the dashboard writes
 * produce straight from the browser, so the rule has to live below it. This
 * file only turns that trigger's refusal into words people can act on, for
 * every screen and route that saves produce.
 *
 * Farmers are never affected; nor is anything already on sale.
 */

export type Msg = { en: string; te: string }

export const SELLING_PLAN_REQUIRED: Msg = {
  en: 'A Selling plan is needed to put produce on sale. Open “Your plan” on the dashboard to choose one.',
  te: 'ఉత్పత్తులను అమ్మకానికి పెట్టడానికి సెల్లింగ్ ప్లాన్ అవసరం. డాష్‌బోర్డ్‌లో “మీ ప్లాన్” తెరిచి ఒకటి ఎంచుకోండి.',
}

/** The moderator's version: they can switch a plan on for the aggregator. */
export const SELLING_PLAN_REQUIRED_MODERATOR =
  'This aggregator has no Selling plan, so this produce cannot go on sale. Activate a plan for them in Subscriptions first.'

/** Did a save fail because of the selling lock? */
export function isSellingPlanError(msg: string | null | undefined): boolean {
  return typeof msg === 'string' && msg.includes('SELLING_PLAN_REQUIRED')
}

/** The message to show for a failed save: the lock in plain words, else as it was. */
export function sellingLockText(msg: string, L: (en: string, te: string) => string): string {
  return isSellingPlanError(msg) ? L(SELLING_PLAN_REQUIRED.en, SELLING_PLAN_REQUIRED.te) : msg
}

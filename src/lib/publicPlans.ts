import { supabase } from '@/lib/supabase'
import type { PlanRow } from '@/lib/subscriptionPlans'

/**
 * Active aggregator plans for the public pages (/home, /home/aggregator).
 * Read with the public key — RLS lets anyone read ACTIVE plans and nothing
 * else (scripts/subscription-migration.sql). Never throws: before the
 * migration, or on a hiccup, it is just "no plans", and the pages say
 * "Plans coming soon" instead of failing.
 *
 * Offers are NOT decided here: the page caches for a few minutes, so whether
 * an offer is still running is worked out in the browser at view time
 * (planPrice / plansTeaser), and an ended offer never shows its old price.
 */
export const PUBLIC_PLAN_COLUMNS =
  'id, kind, name_en, name_te, duration_days, actual_price, offer_enabled, offer_price, offer_ends_at, offer_label_en, offer_label_te, highlights_en, highlights_te, active, sort_order'

export async function activePlans(): Promise<PlanRow[]> {
  try {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select(PUBLIC_PLAN_COLUMNS)
      .eq('active', true)
      .order('sort_order', { ascending: true })
    if (error || !data) return []
    return data as PlanRow[]
  } catch {
    return []
  }
}

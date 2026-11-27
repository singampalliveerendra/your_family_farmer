/**
 * Which sellers' produce household buyers may see (decision 2026-11-27).
 *
 * An aggregator can add produce at any time, but buyers see it only while
 * they hold a live Selling (or Buying + Selling) plan. The moment it ends the
 * produce is gone from every buyer screen — feed, search, product and harvest
 * pages, farmer and region pages, the Android app (/api/produce) — and an
 * order for it is refused. Renewing brings it back untouched.
 *
 * farmers.selling_until (scripts/selling-visibility-migration.sql) holds the
 * end of the selling cover: 'infinity' = free forever, NULL = none. A trigger
 * keeps it current; we compare it with "now" here, so expiry needs no job.
 * Farmers are free and always visible.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumnError } from '@/lib/missingColumn'

/** Add these to a farmers select wherever sellerOpen() is used. */
export const SELLER_VISIBILITY_COLUMNS = 'account_type, selling_until'

export type SellerVis = { account_type?: string | null; selling_until?: string | null }

/** Is this seller's produce visible to buyers right now? */
export function sellerOpen(f: SellerVis | null | undefined, now: Date = new Date()): boolean {
  if (!f) return false
  if (f.account_type !== 'aggregator') return true
  const until = f.selling_until
  if (!until) return false
  if (/^infinity$/i.test(until)) return true
  const t = new Date(until).getTime()
  return Number.isFinite(t) && t > now.getTime()
}

type QueryResult<T> = { data: T | null; error: { message: string } | null }

/**
 * Run a read that names selling_until, falling back to the same read without
 * it on a database where scripts/selling-visibility-migration.sql has not run
 * yet — there nobody is hidden (the old behaviour), and the page still works.
 * `checked` says whether sellerOpen() may be applied to the rows.
 */
export async function readWithSellingUntil<T>(
  run: (withCol: boolean) => PromiseLike<QueryResult<T>>,
): Promise<QueryResult<T> & { checked: boolean }> {
  const first = await run(true)
  if (first.error && isMissingColumnError(first.error.message, 'selling_until')) return { ...(await run(false)), checked: false }
  return { ...first, checked: true }
}

/**
 * Ids of the aggregators buyers must not see right now. Few rows (only
 * aggregators without a live selling plan), so it is cheap to fetch for a
 * screen whose own query doesn't carry the seller. On a read error nothing is
 * hidden here — the server still refuses the order (/api/orders/place).
 */
export async function closedSellerIds(client: SupabaseClient, now: Date = new Date()): Promise<Set<string>> {
  const { data, error } = await client
    .from('farmers')
    .select('id')
    .eq('account_type', 'aggregator')
    .or(`selling_until.is.null,selling_until.lte.${now.toISOString()}`)
  if (error || !data) return new Set()
  return new Set(data.map((r) => (r as { id: string }).id))
}

/** Drop rows whose seller is closed. */
export function withoutClosed<T extends { farmer_id?: string | null }>(rows: readonly T[], closed: ReadonlySet<string>): T[] {
  return closed.size ? rows.filter((r) => !r.farmer_id || !closed.has(r.farmer_id)) : [...rows]
}

/** Shown to a buyer whose cart holds produce that is no longer on sale. */
export const SELLER_CLOSED_MSG = {
  en: 'Some produce in your cart is no longer on sale. Please remove it and try again.',
  te: 'మీ కార్ట్‌లోని కొన్ని ఉత్పత్తులు ఇప్పుడు అమ్మకంలో లేవు. వాటిని తీసివేసి మళ్ళీ ప్రయత్నించండి.',
}

/** The aggregator's own tag on each produce while buyers can't see it. */
export const HIDDEN_FROM_BUYERS_TAG = {
  en: 'Hidden from buyers – subscribe to show',
  te: 'కొనుగోలుదారులకు కనిపించదు – చూపించడానికి సబ్‌స్క్రైబ్ చేయండి',
}

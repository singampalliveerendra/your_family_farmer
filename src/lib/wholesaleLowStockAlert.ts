/**
 * WhatsApp alert when an order pushes a wholesale produce below its minimum.
 *
 * Retail and wholesale share the harvest stock, so a household order on a
 * "both" produce can be what takes the wholesale side under its minimum. The
 * wholesale side then hides itself (computed — see isWholesaleVisible in
 * src/lib/wholesaleVisibility.ts) and the farmer is told, once, at the moment
 * it happens. The dashboard shows the same alert, with its three choices, for
 * as long as the stock stays low — that part needs no message at all.
 *
 * The WhatsApp template has to be approved in WhatsApp Manager first, so
 * sending is OFF until WHOLESALE_LOW_STOCK_WHATSAPP=1 is set on that
 * environment. Template to submit (Utility, English):
 *
 *   name: yff_wholesale_low_stock
 *   body: Wholesale paused for {{1}}: only {{2}} left, below your minimum of
 *         {{3}}. Open Go Grameen to lower the minimum, move it to retail, or
 *         add more stock.
 *   e.g.  {{1}} Tomato  {{2}} 62 kg  {{3}} 100 kg
 *
 * Never throws: an alert must not fail the order that triggered it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import { queueAndSend } from '@/lib/notify'
import { offersWholesale, parseSaleMode } from '@/lib/wholesale'
import { crossedBelowMinimum, lowStockAlertParams, wholesaleStock, type StockHarvest } from '@/lib/wholesaleVisibility'

export type StockClaim = { listingId: string; harvestId?: string | null; qty: number }

export function lowStockWhatsAppEnabled(): boolean {
  return process.env.WHOLESALE_LOW_STOCK_WHATSAPP === '1'
}

/** One alert per produce per day at most, even if stock bounces around the line. */
export function lowStockDedupeKey(listingId: string, now: Date = new Date()): string {
  return `wholesale_low_stock:${listingId}:${now.toISOString().slice(0, 10)}`
}

type ListingRow = {
  id: string
  farmer_id: string
  name: string
  unit: string | null
  stock_qty: number | null
  sale_mode?: unknown
  wholesale_min_qty?: number | null
  wholesale_pack_size?: number | null
}

/**
 * Check the produce these claims touched; alert the farmer of each one whose
 * wholesale side just crossed below its minimum. Returns the produce ids that
 * crossed (whether or not WhatsApp sending is switched on), for logs and tests.
 */
export async function alertWholesaleLowStock(
  supabase: SupabaseClient,
  claims: readonly StockClaim[],
  opts: { now?: Date; send?: typeof queueAndSend } = {},
): Promise<string[]> {
  const crossed: string[] = []
  try {
    const usable = claims.filter((c) => c.listingId && c.qty > 0)
    if (usable.length === 0) return crossed
    const ids = [...new Set(usable.map((c) => c.listingId))]

    // select('*'): works on a server without the wholesale columns, where every
    // row then reads as retail and nothing below runs.
    const { data: rows, error } = await supabase.from('produce_listings').select('*').in('id', ids)
    if (error || !rows) return crossed
    const wholesale = (rows as ListingRow[]).filter((l) => offersWholesale(parseSaleMode(l.sale_mode)))
    if (wholesale.length === 0) return crossed

    const { data: hv } = await supabase
      .from('harvests')
      .select('id, produce_listing_id, stock_qty')
      .in('produce_listing_id', wholesale.map((l) => l.id))
      .eq('paused', false)
    const harvestsOf = new Map<string, StockHarvest[]>()
    for (const h of (hv ?? []) as Array<StockHarvest & { produce_listing_id: string }>) {
      const list = harvestsOf.get(h.produce_listing_id) ?? []
      list.push({ id: h.id, stock_qty: h.stock_qty })
      harvestsOf.set(h.produce_listing_id, list)
    }

    for (const l of wholesale) {
      const harvests = harvestsOf.get(l.id) ?? []
      const mine = usable.filter((c) => c.listingId === l.id)
      if (!crossedBelowMinimum(l, harvests, mine, l.stock_qty)) continue
      crossed.push(l.id)
      if (!lowStockWhatsAppEnabled()) {
        console.info('[YFF wholesale] low stock (WhatsApp alert off):', l.id)
        continue
      }
      const { data: farmer } = await supabase.from('farmers').select('phone').eq('id', l.farmer_id).maybeSingle()
      const stock = wholesaleStock(l, harvests) ?? 0
      await (opts.send ?? queueAndSend)(supabase, {
        phone: (farmer as { phone?: string | null } | null)?.phone,
        event: 'farmer_wholesale_low_stock',
        lang: 'en',
        body: lowStockAlertParams(l.name, l.unit, stock, Number(l.wholesale_min_qty)),
        dedupeKey: lowStockDedupeKey(l.id, opts.now),
      })
    }
  } catch (e) {
    console.error('[YFF wholesale] low-stock check failed:', e)
  }
  return crossed
}

/** Run the check after the response is sent (order routes): never slows an order. */
export function scheduleWholesaleLowStockCheck(supabase: SupabaseClient, claims: readonly StockClaim[]): void {
  if (!claims.some((c) => c.listingId && c.qty > 0)) return
  after(() => alertWholesaleLowStock(supabase, claims))
}

// A farmer ordering their own produce.
//
// Farmers used to be refused at checkout when the buyer phone matched their
// own. They may now buy from themselves (household use, a relative, a walk-in
// sale they want on the books). The order is ordinary in every respect — the
// stock claim, approval, fulfilment and payment all run as for any buyer — it
// is only MARKED with orders.is_self_order so the farmer can tell "sold to
// buyers" from "taken by me". The quantity totals count both, because both
// came out of the same harvest.
//
// Who is "self" is decided by isSelfOrder (src/lib/sellerBuyerLink.ts): the
// buyer's phone against the farmer's, both normalised.

/**
 * Stamp the flag on every row of a self-order batch. An ordinary batch is left
 * untouched — it never names the column, so it still inserts on a database
 * that has not run scripts/self-order-migration.sql.
 */
export function markSelfOrder(rows: Array<Record<string, unknown>>, selfOrder: boolean): void {
  if (!selfOrder) return
  for (const r of rows) r.is_self_order = true
}

/** The same rows without the flag, for the retry when the column is missing. */
export function withoutSelfOrderFlag(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.map((r) => {
    const copy = { ...r }
    delete copy.is_self_order
    return copy
  })
}

type QtyOrder = {
  produce_name: string | null
  unit: string | null
  quantity: number | null
  status: string
  is_self_order?: boolean | null
}

export type ProduceQuantity = {
  produce: string
  unit: string
  /** Everything still standing: buyers' orders + the farmer's own. */
  total: number
  /** Ordered by other buyers. */
  buyers: number
  /** Ordered by the farmer themselves. */
  self: number
  /** How many of the counted orders were the farmer's own. */
  selfOrders: number
}

// Quantities are summed in thousandths so 0.25 + 0.5 + 0.1 kg stays exact.
const toMilli = (n: number) => Math.round(n * 1000)
const fromMilli = (n: number) => n / 1000

/**
 * Quantity ordered per produce (and unit — kg and bunches never add up),
 * split into buyers vs the farmer's own orders.
 *
 * Declined and cancelled orders are left out: their stock went back, so
 * counting them would overstate what actually left the farm. Pending and
 * approved orders count — that produce is spoken for.
 */
export function produceQuantitySummary(orders: QtyOrder[]): ProduceQuantity[] {
  const byKey = new Map<string, { produce: string; unit: string; buyers: number; self: number; selfOrders: number }>()
  for (const o of orders) {
    if (o.status === 'declined' || o.status === 'cancelled') continue
    const qty = Number(o.quantity)
    if (!Number.isFinite(qty) || qty <= 0) continue
    const produce = (o.produce_name || '—').trim() || '—'
    const unit = o.unit || 'kg'
    const key = `${produce.toLowerCase()}|${unit}`
    const row = byKey.get(key) ?? { produce, unit, buyers: 0, self: 0, selfOrders: 0 }
    if (o.is_self_order === true) {
      row.self += toMilli(qty)
      row.selfOrders += 1
    } else {
      row.buyers += toMilli(qty)
    }
    byKey.set(key, row)
  }
  return [...byKey.values()]
    .map((r) => ({
      produce: r.produce,
      unit: r.unit,
      total: fromMilli(r.buyers + r.self),
      buyers: fromMilli(r.buyers),
      self: fromMilli(r.self),
      selfOrders: r.selfOrders,
    }))
    .sort((a, b) => b.total - a.total || a.produce.localeCompare(b.produce))
}

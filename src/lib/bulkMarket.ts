/**
 * The aggregators' bulk market (Phase 5, model agreed 2026-11-04): every
 * produce sold Wholesale or Both, by farmers AND other aggregators, shown only
 * to logged-in aggregators — never to household buyers.
 *
 *  - Anyone with an aggregator account can LOOK: name, village, district of
 *    the seller, prices, minimums, transport.
 *  - Phone, WhatsApp and exact address are sent by the server ONLY to an
 *    aggregator holding a Buying (or Combined) plan. They are not hidden in the
 *    browser — they are never in the response — so "inspect element" finds
 *    nothing.
 *  - A listing whose stock is below its wholesale minimum is not shown (the
 *    same low-stock rule that alerts the farmer, wholesaleVisibility.ts).
 *  - An aggregator never sees their own listings here.
 *  - Ordering in the app is Phase 6; until then a subscribed aggregator calls
 *    or WhatsApps the seller.
 *
 * Pure: the API route feeds it rows; tests feed it fixtures.
 */

import { parseSaleMode, normalizeStates, type TransportState } from '@/lib/wholesale'
import { wholesaleQtyRules } from '@/lib/wholesaleOrder'
import { deliveryOptions, type Delivery } from '@/lib/bulkOrder'
import type { TransportRate } from '@/lib/wholesale'
import { isWholesaleLowStock, wholesaleStock, type StockHarvest } from '@/lib/wholesaleVisibility'

export type MarketListingRow = {
  id: string
  farmer_id: string
  name: string
  variety?: string | null
  emoji?: string | null
  category?: string | null
  unit?: string | null
  image_url?: string | null
  image_urls?: string[] | null
  status?: string | null
  sale_mode?: unknown
  sale_step?: number | string | null
  stock_qty?: number | string | null
  wholesale_price?: number | string | null
  wholesale_min_qty?: number | string | null
  wholesale_pack_size?: number | string | null
  /** ₹ for one wholesale pack (scripts/pack-pricing-migration.sql). */
  wholesale_pack_price?: number | string | null
  wholesale_transport_states?: unknown
  /** Per-state delivery charges (scripts/bulk-orders-migration.sql); absent before it runs. */
  wholesale_transport_rates?: unknown
  source_farmer_id?: string | null
  method?: string | null
  description?: string | null
}

export type MarketHarvestRow = StockHarvest & { produce_listing_id: string; harvested_at?: string | null; paused?: boolean | null }

export type MarketSellerRow = {
  id: string
  name?: string | null
  village?: string | null
  district?: string | null
  state?: string | null
  phone?: string | null
  farm_address?: string | null
  account_type?: string | null
  active?: boolean | null
}

export type MarketGrowerRow = { id: string; name?: string | null; village?: string | null }

export type MarketContact = { phone: string; whatsapp: string; address: string | null }

export type MarketItem = {
  id: string
  name: string
  variety: string | null
  emoji: string | null
  category: string | null
  unit: string
  image: string | null
  images: string[]
  method: string | null
  description: string | null
  saleMode: 'wholesale' | 'both'
  price: number
  minQty: number
  step: number
  packSize: number | null
  /** ₹ for one pack, as the seller typed it; null = priced per unit. */
  packPrice: number | null
  transportStates: TransportState[]
  /** Where the lot can go in the app and what delivery costs (Phase 6). */
  delivery: Array<{ delivery: Delivery; rate: TransportRate | null }>
  /** What can go in one bulk order now (best single harvest); null = not tracked. */
  stock: number | null
  harvestedAt: string | null
  seller: {
    id: string
    name: string
    type: 'farmer' | 'aggregator'
    village: string | null
    district: string | null
    state: string | null
  }
  /** The real grower when an aggregator sells it ("Grown by"). */
  grower: { name: string; village: string | null } | null
  /** Present ONLY for an aggregator with a Buying plan. */
  contact: MarketContact | null
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** 10 digits for tel:, 91 + 10 digits for wa.me. */
export function contactOf(seller: Pick<MarketSellerRow, 'phone' | 'farm_address'>): MarketContact | null {
  const digits = String(seller.phone ?? '').replace(/\D/g, '').slice(-10)
  if (digits.length !== 10) return null
  return { phone: digits, whatsapp: `91${digits}`, address: clean(seller.farm_address) }
}

/**
 * Is this listing on the bulk market for `viewerId`? Sold Wholesale or Both,
 * with a real price and minimum, available, seller active, not the viewer's
 * own, and enough stock for at least the minimum.
 */
export function onMarket(
  l: MarketListingRow,
  harvests: readonly MarketHarvestRow[],
  seller: MarketSellerRow | undefined,
  viewerId: string,
): boolean {
  const mode = parseSaleMode(l.sale_mode)
  if (mode !== 'wholesale' && mode !== 'both') return false
  if (l.status !== 'available') return false
  if (!seller || seller.active === false || seller.id === viewerId || l.farmer_id === viewerId) return false
  const price = num(l.wholesale_price)
  const min = num(l.wholesale_min_qty)
  if (price === null || price <= 0 || min === null || min <= 0) return false
  const live = harvests.filter((h) => !h.paused)
  return !isWholesaleLowStock(l, live)
}

export function toMarketItem(
  l: MarketListingRow,
  harvests: readonly MarketHarvestRow[],
  seller: MarketSellerRow,
  grower: MarketGrowerRow | null,
  canContact: boolean,
): MarketItem {
  const live = harvests.filter((h) => !h.paused)
  const pack = num(l.wholesale_pack_size)
  const rules = wholesaleQtyRules({ minQty: num(l.wholesale_min_qty) as number, packSize: pack !== null && pack > 0 ? pack : null }, l.sale_step, l.unit)
  const images = [...(l.image_urls ?? []), ...(l.image_url ? [l.image_url] : [])].filter((u, i, a) => !!u && a.indexOf(u) === i)
  const latest = live.map((h) => h.harvested_at ?? '').filter(Boolean).sort().pop() ?? null
  const isAgg = seller.account_type === 'aggregator'
  return {
    id: l.id,
    name: l.name,
    variety: clean(l.variety),
    emoji: clean(l.emoji),
    category: clean(l.category),
    unit: clean(l.unit) ?? 'kg',
    image: images[0] ?? null,
    images,
    method: clean(l.method),
    description: clean(l.description),
    saleMode: parseSaleMode(l.sale_mode) === 'wholesale' ? 'wholesale' : 'both',
    price: num(l.wholesale_price) as number,
    minQty: rules.min,
    step: rules.step,
    packSize: pack !== null && pack > 0 ? pack : null,
    packPrice: pack !== null && pack > 0 && (num(l.wholesale_pack_price) ?? 0) > 0 ? num(l.wholesale_pack_price) : null,
    transportStates: normalizeStates(l.wholesale_transport_states),
    delivery: deliveryOptions(l),
    stock: wholesaleStock(l, live),
    harvestedAt: latest,
    seller: {
      id: seller.id,
      name: clean(seller.name) ?? '—',
      type: isAgg ? 'aggregator' : 'farmer',
      village: clean(seller.village),
      district: clean(seller.district),
      state: clean(seller.state),
    },
    grower: isAgg && grower ? { name: clean(grower.name) ?? '—', village: clean(grower.village) } : null,
    // The whole point of the plan: nothing to unlock in the browser.
    contact: canContact ? contactOf(seller) : null,
  }
}

/** Build the market for one viewer, newest harvest first. */
export function buildMarket(args: {
  listings: readonly MarketListingRow[]
  harvests: readonly MarketHarvestRow[]
  sellers: readonly MarketSellerRow[]
  growers: readonly MarketGrowerRow[]
  viewerId: string
  canContact: boolean
}): MarketItem[] {
  const sellerById = new Map(args.sellers.map((s) => [s.id, s]))
  const growerById = new Map(args.growers.map((g) => [g.id, g]))
  const harvestsOf = new Map<string, MarketHarvestRow[]>()
  for (const h of args.harvests) harvestsOf.set(h.produce_listing_id, [...(harvestsOf.get(h.produce_listing_id) ?? []), h])
  const out: MarketItem[] = []
  for (const l of args.listings) {
    const hs = harvestsOf.get(l.id) ?? []
    const seller = sellerById.get(l.farmer_id)
    if (!onMarket(l, hs, seller, args.viewerId)) continue
    out.push(toMarketItem(l, hs, seller!, l.source_farmer_id ? growerById.get(l.source_farmer_id) ?? null : null, args.canContact))
  }
  return out.sort((a, b) => (b.harvestedAt ?? '').localeCompare(a.harvestedAt ?? '') || a.name.localeCompare(b.name))
}

// ── Filters (the market screen) ─────────────────────────────────────

export type MarketFilter = {
  q?: string
  seller?: 'all' | 'farmer' | 'aggregator'
  /** Only sellers who deliver to this state. */
  delivers?: TransportState | null
  category?: string | null
}

export function filterMarket(items: readonly MarketItem[], f: MarketFilter): MarketItem[] {
  const q = (f.q ?? '').trim().toLowerCase()
  return items.filter((it) => {
    if (f.seller && f.seller !== 'all' && it.seller.type !== f.seller) return false
    if (f.delivers && !it.transportStates.includes(f.delivers)) return false
    if (f.category && it.category !== f.category) return false
    if (!q) return true
    const hay = [it.name, it.variety, it.category, it.seller.name, it.seller.village, it.seller.district, it.grower?.name, it.grower?.village]
      .filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  })
}

/** The seller's place line: "Pentapadu, West Godavari". */
export function placeOf(s: Pick<MarketItem['seller'], 'village' | 'district'>): string {
  return [s.village, s.district].filter(Boolean).join(', ')
}

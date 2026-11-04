import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildMarket,
  contactOf,
  filterMarket,
  onMarket,
  placeOf,
  toMarketItem,
  type MarketGrowerRow,
  type MarketHarvestRow,
  type MarketListingRow,
  type MarketSellerRow,
} from '@/lib/bulkMarket'

const ME = 'agg-me'
const FARMER: MarketSellerRow = { id: 'f1', name: 'Ravi', village: 'Pentapadu', district: 'West Godavari', state: 'AP', phone: '9000000001', farm_address: 'Door 4, Canal road', account_type: 'farmer', active: true }
const OTHER_AGG: MarketSellerRow = { id: 'a2', name: 'GoDhan', village: 'Tadepalligudem', district: 'West Godavari', state: 'AP', phone: '+91 90000 00002', account_type: 'aggregator', active: true }
const L = (x: Partial<MarketListingRow> = {}): MarketListingRow => ({
  id: 'l1', farmer_id: 'f1', name: 'Tomato', unit: 'kg', status: 'available', sale_mode: 'wholesale', sale_step: 1,
  stock_qty: null, wholesale_price: 30, wholesale_min_qty: 100, wholesale_pack_size: 25, wholesale_transport_states: ['TG', 'AP'],
  image_url: 'https://x/t.jpg', category: 'vegetables', ...x,
})
const H = (x: Partial<MarketHarvestRow> = {}): MarketHarvestRow => ({ id: 'h1', produce_listing_id: 'l1', stock_qty: 500, paused: false, harvested_at: '2026-11-04T03:00:00Z', ...x })

describe('onMarket', () => {
  it('wholesale and both are on; retail never', () => {
    expect(onMarket(L(), [H()], FARMER, ME)).toBe(true)
    expect(onMarket(L({ sale_mode: 'both' }), [H()], FARMER, ME)).toBe(true)
    expect(onMarket(L({ sale_mode: 'retail' }), [H()], FARMER, ME)).toBe(false)
    expect(onMarket(L({ sale_mode: undefined }), [H()], FARMER, ME)).toBe(false) // pre-migration row = retail
  })
  it('only available produce', () => {
    for (const status of ['sold_out', 'paused', 'suspended', 'coming_soon', 'rejected']) {
      expect(onMarket(L({ status }), [H()], FARMER, ME), status).toBe(false)
    }
  })
  it('never my own listing', () => {
    expect(onMarket(L({ farmer_id: ME }), [H()], { ...FARMER, id: ME }, ME)).toBe(false)
  })
  it('an inactive or missing seller is off', () => {
    expect(onMarket(L(), [H()], { ...FARMER, active: false }, ME)).toBe(false)
    expect(onMarket(L(), [H()], undefined, ME)).toBe(false)
  })
  it('needs a real wholesale price and minimum', () => {
    expect(onMarket(L({ wholesale_price: null }), [H()], FARMER, ME)).toBe(false)
    expect(onMarket(L({ wholesale_price: 0 }), [H()], FARMER, ME)).toBe(false)
    expect(onMarket(L({ wholesale_min_qty: null }), [H()], FARMER, ME)).toBe(false)
  })
  it('low stock (below the minimum) hides it — the same rule that alerts the farmer', () => {
    expect(onMarket(L(), [H({ stock_qty: 99 })], FARMER, ME)).toBe(false)
    expect(onMarket(L(), [H({ stock_qty: 100 })], FARMER, ME)).toBe(true)
  })
  it('a paused harvest does not count', () => {
    expect(onMarket(L(), [H({ stock_qty: 50 }), H({ id: 'h2', stock_qty: 900, paused: true })], FARMER, ME)).toBe(false)
  })
  it('untracked stock is shown', () => {
    expect(onMarket(L({ stock_qty: null }), [], FARMER, ME)).toBe(true)
  })
})

describe('contact is sent only with a Buying plan', () => {
  it('locked: no phone, no WhatsApp, no address anywhere in the item', () => {
    const it = toMarketItem(L(), [H()], FARMER, null, false)
    expect(it.contact).toBeNull()
    const json = JSON.stringify(it)
    expect(json).not.toContain('9000000001')
    expect(json).not.toContain('Canal road')
    // Name, village and district stay visible.
    expect(it.seller).toEqual({ id: 'f1', name: 'Ravi', type: 'farmer', village: 'Pentapadu', district: 'West Godavari', state: 'AP' })
  })
  it('unlocked: phone, WhatsApp number and address', () => {
    expect(toMarketItem(L(), [H()], FARMER, null, true).contact).toEqual({ phone: '9000000001', whatsapp: '919000000001', address: 'Door 4, Canal road' })
  })
  it('phones in any stored format', () => {
    expect(contactOf({ phone: '+91 90000 00002' })).toEqual({ phone: '9000000002', whatsapp: '919000000002', address: null })
    expect(contactOf({ phone: '12345' })).toBeNull()
    expect(contactOf({ phone: null })).toBeNull()
  })
})

describe('toMarketItem', () => {
  it('price, minimum, packs, transport, stock, freshness', () => {
    const it = toMarketItem(L(), [H(), H({ id: 'h2', stock_qty: 300, harvested_at: '2026-11-03T03:00:00Z' })], FARMER, null, false)
    expect(it).toMatchObject({
      name: 'Tomato', unit: 'kg', saleMode: 'wholesale', price: 30, minQty: 100, step: 25, packSize: 25,
      transportStates: ['AP', 'TG'], stock: 500, harvestedAt: '2026-11-04T03:00:00Z', image: 'https://x/t.jpg', grower: null,
    })
  })
  it('a minimum off the pack grid is rounded up (what can really be ordered)', () => {
    expect(toMarketItem(L({ wholesale_min_qty: 110 }), [H()], FARMER, null, false).minQty).toBe(125)
  })
  it('an aggregator’s listing names the grower', () => {
    const g: MarketGrowerRow = { id: 'g1', name: 'Lakshmi', village: 'Pentapadu' }
    const it = toMarketItem(L({ farmer_id: 'a2', source_farmer_id: 'g1' }), [H()], OTHER_AGG, g, false)
    expect(it.seller.type).toBe('aggregator')
    expect(it.grower).toEqual({ name: 'Lakshmi', village: 'Pentapadu' })
  })
  it('a farmer has no "grown by" line (they grew it)', () => {
    expect(toMarketItem(L(), [H()], FARMER, { id: 'g1', name: 'X', village: null }, false).grower).toBeNull()
  })
  it('photos de-duplicated, cover first', () => {
    expect(toMarketItem(L({ image_urls: ['https://x/a.jpg', 'https://x/t.jpg'] }), [], FARMER, null, false).images).toEqual(['https://x/a.jpg', 'https://x/t.jpg'])
  })
})

describe('buildMarket', () => {
  const args = {
    listings: [
      L(),
      L({ id: 'l2', farmer_id: 'a2', name: 'Onion', sale_mode: 'both', source_farmer_id: 'g1', wholesale_transport_states: [] }),
      L({ id: 'l3', name: 'Rice', sale_mode: 'retail' }),
      L({ id: 'l4', farmer_id: ME, name: 'Mine' }),
    ],
    harvests: [H(), H({ id: 'h2', produce_listing_id: 'l2', harvested_at: '2026-11-04T05:00:00Z' })],
    sellers: [FARMER, OTHER_AGG, { id: ME, name: 'Me', account_type: 'aggregator', active: true }],
    growers: [{ id: 'g1', name: 'Lakshmi', village: 'Pentapadu' }],
    viewerId: ME,
  }
  it('farmers + other aggregators; no retail, not mine; freshest first', () => {
    expect(buildMarket({ ...args, canContact: false }).map((i) => i.id)).toEqual(['l2', 'l1'])
  })
  it('locked for everyone without a Buying plan', () => {
    expect(buildMarket({ ...args, canContact: false }).every((i) => i.contact === null)).toBe(true)
    expect(buildMarket({ ...args, canContact: true }).every((i) => i.contact !== null)).toBe(true)
  })
})

describe('filterMarket / placeOf', () => {
  const items = buildMarket({
    listings: [L(), L({ id: 'l2', farmer_id: 'a2', name: 'Onion', category: 'bulbs', wholesale_transport_states: ['TG'] }), L({ id: 'l3', name: 'Chilli', wholesale_transport_states: [] })],
    harvests: [], sellers: [FARMER, OTHER_AGG], growers: [], viewerId: ME, canContact: false,
  })
  it('search by produce, seller, village', () => {
    expect(filterMarket(items, { q: 'onion' }).map((i) => i.id)).toEqual(['l2'])
    expect(filterMarket(items, { q: 'ravi' }).map((i) => i.id).sort()).toEqual(['l1', 'l3'])
    expect(filterMarket(items, { q: 'tadepalli' }).map((i) => i.id)).toEqual(['l2'])
  })
  it('by seller type, delivery state and category', () => {
    expect(filterMarket(items, { seller: 'aggregator' }).map((i) => i.id)).toEqual(['l2'])
    expect(filterMarket(items, { delivers: 'AP' }).map((i) => i.id)).toEqual(['l1'])
    expect(filterMarket(items, { delivers: 'TG' }).map((i) => i.id).sort()).toEqual(['l1', 'l2'])
    expect(filterMarket(items, { category: 'bulbs' }).map((i) => i.id)).toEqual(['l2'])
  })
  it('no filter = everything', () => {
    expect(filterMarket(items, {})).toHaveLength(3)
  })
  it('place line', () => {
    expect(placeOf({ village: 'Pentapadu', district: 'West Godavari' })).toBe('Pentapadu, West Godavari')
    expect(placeOf({ village: null, district: 'West Godavari' })).toBe('West Godavari')
  })
})

describe('the market screens only read the aggregator-only route', () => {
  // Contacts are protected by leaving them out of /api/aggregator/market. A
  // screen that read produce_listings or farmers with the public key would
  // walk straight round that, so neither page may touch the database.
  it.each(['src/app/aggregator/market/page.tsx', 'src/app/aggregator/market/[id]/page.tsx'])('%s', (f) => {
    const src = readFileSync(join(process.cwd(), f), 'utf8')
    expect(src).toMatch(/\/api\/aggregator\/market/)
    expect(src).not.toMatch(/@\/lib\/supabase['"]/)
    expect(src).not.toMatch(/from\(\s*['"](produce_listings|farmers|source_farmers)['"]/)
  })
})

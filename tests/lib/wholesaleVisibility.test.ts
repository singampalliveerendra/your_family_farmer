import { describe, it, expect } from 'vitest'
import {
  LOW_STOCK_CHOICES,
  crossedBelowMinimum,
  isRetailVisible,
  isWholesaleLowStock,
  isWholesaleVisible,
  lowStockAlertParams,
  lowStockChoicePayload,
  readWithSaleMode,
  retailOnly,
  stockShortfall,
  suggestedMinimum,
  wholesaleStock,
} from '@/lib/wholesaleVisibility'
import { resolveWholesaleColumns } from '@/lib/wholesale'

const W = (extra: Record<string, unknown> = {}) => ({
  sale_mode: 'wholesale', wholesale_price: 30, wholesale_min_qty: 100, wholesale_pack_size: 25,
  wholesale_transport_states: ['AP'], stock_qty: null, unit: 'kg', ...extra,
})
const H = (id: string, stock_qty: number | string | null) => ({ id, stock_qty })

describe('isRetailVisible / retailOnly', () => {
  it('retail and both are visible to household buyers', () => {
    expect(isRetailVisible({ sale_mode: 'retail' })).toBe(true)
    expect(isRetailVisible({ sale_mode: 'both' })).toBe(true)
  })
  it('wholesale-only is never visible', () => {
    expect(isRetailVisible({ sale_mode: 'wholesale' })).toBe(false)
  })
  it('a row from before the migration (no sale_mode) is retail', () => {
    expect(isRetailVisible({})).toBe(true)
    expect(isRetailVisible({ sale_mode: null })).toBe(true)
  })
  it('junk sale_mode reads as retail (the DB CHECK refuses it anyway)', () => {
    expect(isRetailVisible({ sale_mode: 'WHOLESALE' })).toBe(true)
  })
  it('a missing row is not visible', () => {
    expect(isRetailVisible(null)).toBe(false)
    expect(isRetailVisible(undefined)).toBe(false)
  })
  it('retailOnly keeps order and drops only wholesale-only', () => {
    const rows = [
      { id: 1, sale_mode: 'retail' }, { id: 2, sale_mode: 'wholesale' }, { id: 3, sale_mode: 'both' },
      { id: 4 }, { id: 5, sale_mode: 'wholesale' },
    ]
    expect(retailOnly(rows).map((r) => r.id)).toEqual([1, 3, 4])
  })
  it('retailOnly of nothing is an empty list', () => {
    expect(retailOnly(null)).toEqual([])
    expect(retailOnly(undefined)).toEqual([])
    expect(retailOnly([])).toEqual([])
  })
})

describe('readWithSaleMode', () => {
  it('uses the sale_mode query when the column exists', async () => {
    const calls: boolean[] = []
    const r = await readWithSaleMode(async (w) => { calls.push(w); return { data: ['ok'], error: null } })
    expect(calls).toEqual([true])
    expect(r.data).toEqual(['ok'])
  })
  it('retries without sale_mode on a server without the column', async () => {
    const calls: boolean[] = []
    const r = await readWithSaleMode(async (w) => {
      calls.push(w)
      return w
        ? { data: null, error: { message: 'column produce_listings.sale_mode does not exist' } }
        : { data: ['fallback'], error: null }
    })
    expect(calls).toEqual([true, false])
    expect(r.data).toEqual(['fallback'])
  })
  it('also recognises the embedded-table wording', async () => {
    const r = await readWithSaleMode(async (w) => w
      ? { data: null, error: { message: 'column produce_listings_1.sale_mode does not exist' } }
      : { data: 1, error: null })
    expect(r.data).toBe(1)
  })
  it('does not swallow other errors', async () => {
    const calls: boolean[] = []
    const r = await readWithSaleMode(async (w) => { calls.push(w); return { data: null, error: { message: 'permission denied for table produce_listings' } } })
    expect(calls).toEqual([true])
    expect(r.error?.message).toMatch(/permission denied/)
  })
})

describe('wholesaleStock', () => {
  it('best single harvest (an order fills from one harvest)', () => {
    expect(wholesaleStock(W(), [H('a', 40), H('b', 90), H('c', 0)])).toBe(90)
  })
  it('an untracked harvest (null stock) means not tracked', () => {
    expect(wholesaleStock(W(), [H('a', 40), H('b', null)])).toBeNull()
  })
  it('no harvests → the produce\'s own stock', () => {
    expect(wholesaleStock(W({ stock_qty: 70 }), [])).toBe(70)
    expect(wholesaleStock(W({ stock_qty: null }), [])).toBeNull()
  })
  it('numeric strings from PostgREST are read', () => {
    expect(wholesaleStock(W(), [H('a', '12.500')])).toBe(12.5)
  })
  it('all harvests empty → 0', () => {
    expect(wholesaleStock(W(), [H('a', 0), H('b', 0)])).toBe(0)
  })
  it('no float noise', () => {
    expect(wholesaleStock(W(), [H('a', 0.1 + 0.2)])).toBe(0.3)
  })
})

describe('isWholesaleLowStock / isWholesaleVisible', () => {
  it('below the minimum → low and hidden', () => {
    expect(isWholesaleLowStock(W(), [H('a', 99)])).toBe(true)
    expect(isWholesaleVisible(W(), [H('a', 99)])).toBe(false)
  })
  it('exactly the minimum → fine and shown', () => {
    expect(isWholesaleLowStock(W(), [H('a', 100)])).toBe(false)
    expect(isWholesaleVisible(W(), [H('a', 100)])).toBe(true)
  })
  it('comes back by itself when stock is added', () => {
    expect(isWholesaleVisible(W(), [H('a', 40)])).toBe(false)
    expect(isWholesaleVisible(W(), [H('a', 40), H('b', 120)])).toBe(true)
  })
  it('two small harvests do not add up (one order, one harvest)', () => {
    expect(isWholesaleLowStock(W(), [H('a', 60), H('b', 60)])).toBe(true)
  })
  it('untracked stock is never low', () => {
    expect(isWholesaleLowStock(W(), [H('a', null)])).toBe(false)
    expect(isWholesaleLowStock(W({ stock_qty: null }), [])).toBe(false)
  })
  it('"both" uses the same rule', () => {
    expect(isWholesaleLowStock(W({ sale_mode: 'both' }), [H('a', 10)])).toBe(true)
  })
  it('retail produce is never "low" and never wholesale-visible', () => {
    expect(isWholesaleLowStock(W({ sale_mode: 'retail' }), [H('a', 1)])).toBe(false)
    expect(isWholesaleVisible(W({ sale_mode: 'retail' }), [H('a', 1000)])).toBe(false)
  })
  it('a pre-migration row is retail', () => {
    expect(isWholesaleLowStock({ stock_qty: 1 }, [])).toBe(false)
  })
  it('no minimum set → not judged low', () => {
    expect(isWholesaleLowStock(W({ wholesale_min_qty: null }), [H('a', 1)])).toBe(false)
  })
})

describe('stockShortfall', () => {
  it('how much is missing', () => {
    expect(stockShortfall(W(), [H('a', 62.5)])).toBe(37.5)
  })
  it('0 when not low', () => {
    expect(stockShortfall(W(), [H('a', 150)])).toBe(0)
    expect(stockShortfall(W({ sale_mode: 'retail' }), [H('a', 1)])).toBe(0)
  })
})

describe('suggestedMinimum', () => {
  it('rounds down to whole packs', () => {
    expect(suggestedMinimum(W(), [H('a', 62)])).toBe(50)
    expect(suggestedMinimum(W(), [H('a', 75)])).toBe(75)
  })
  it('less than one pack → null (lowering cannot help)', () => {
    expect(suggestedMinimum(W(), [H('a', 24)])).toBeNull()
    expect(suggestedMinimum(W(), [H('a', 0)])).toBeNull()
  })
  it('no pack size → the stock itself', () => {
    expect(suggestedMinimum(W({ wholesale_pack_size: null }), [H('a', 62.5)])).toBe(62.5)
  })
  it('whole-only units round down to a whole number', () => {
    expect(suggestedMinimum(W({ wholesale_pack_size: null, unit: 'dozen' }), [H('a', 7.5)])).toBe(7)
    expect(suggestedMinimum(W({ wholesale_pack_size: null, unit: 'piece' }), [H('a', 0.5)])).toBeNull()
  })
  it('part-unit packs survive float noise (0.3 / 0.1 is 2.999…)', () => {
    expect(suggestedMinimum(W({ wholesale_pack_size: 0.1, wholesale_min_qty: 1 }), [H('a', 0.3)])).toBe(0.3)
  })
  it('untracked stock → null', () => {
    expect(suggestedMinimum(W(), [H('a', null)])).toBeNull()
  })
  it('the suggestion passes the wholesale rules (whole packs)', () => {
    for (const stock of [25, 26, 49.9, 50, 62, 99]) {
      const min = suggestedMinimum(W(), [H('a', stock)])!
      const r = resolveWholesaleColumns({ ...W(), wholesale_min_qty: min, wholesale_transport_states: ['AP'] }, 'kg')
      expect(r.ok).toBe(true)
    }
  })
})

describe('crossedBelowMinimum (order just placed)', () => {
  it('an order that takes the stock below the minimum → true', () => {
    expect(crossedBelowMinimum(W(), [H('a', 80)], [{ harvestId: 'a', qty: 30 }])).toBe(true) // 110 → 80
  })
  it('already below before the order → false (alert went earlier)', () => {
    expect(crossedBelowMinimum(W(), [H('a', 50)], [{ harvestId: 'a', qty: 10 }])).toBe(false) // 60 → 50
  })
  it('still at or above the minimum → false', () => {
    expect(crossedBelowMinimum(W(), [H('a', 100)], [{ harvestId: 'a', qty: 5 }])).toBe(false)
  })
  it('another harvest still has enough → false', () => {
    expect(crossedBelowMinimum(W(), [H('a', 80), H('b', 200)], [{ harvestId: 'a', qty: 30 }])).toBe(false)
  })
  it('the best harvest is the one that dropped → true', () => {
    expect(crossedBelowMinimum(W(), [H('a', 80), H('b', 90)], [{ harvestId: 'a', qty: 30 }])).toBe(true)
  })
  it('two lines on the same harvest add up', () => {
    expect(crossedBelowMinimum(W(), [H('a', 90)], [{ harvestId: 'a', qty: 5 }, { harvestId: 'a', qty: 6 }])).toBe(true) // 101 → 90
  })
  it('legacy line on the produce itself (no harvest)', () => {
    expect(crossedBelowMinimum(W(), [], [{ qty: 30 }], 80)).toBe(true) // 110 → 80
    expect(crossedBelowMinimum(W(), [], [{ qty: 30 }], 120)).toBe(false)
  })
  it('retail produce never alerts', () => {
    expect(crossedBelowMinimum(W({ sale_mode: 'retail' }), [H('a', 1)], [{ harvestId: 'a', qty: 500 }])).toBe(false)
  })
  it('a claim on a harvest not in the list is ignored, not invented', () => {
    expect(crossedBelowMinimum(W(), [H('a', 80)], [{ harvestId: 'zzz', qty: 30 }])).toBe(false)
  })
  it('untracked stock never alerts', () => {
    expect(crossedBelowMinimum(W(), [H('a', null)], [{ harvestId: 'a', qty: 30 }])).toBe(false)
  })
})

describe('lowStockChoicePayload', () => {
  const low = [H('a', 62)]
  it('lower the minimum → whole packs of what is left, every wholesale field sent', () => {
    const r = lowStockChoicePayload('lower_minimum', W(), low)
    expect(r).toEqual({ ok: true, payload: {
      sale_mode: 'wholesale', wholesale_price: 30, wholesale_min_qty: 50, wholesale_pack_size: 25, wholesale_transport_states: ['AP'],
    } })
  })
  it('the lowered payload passes the server rules', () => {
    const r = lowStockChoicePayload('lower_minimum', W(), low)
    expect(r.ok && resolveWholesaleColumns(r.payload!, 'kg').ok).toBe(true)
  })
  it('lowering is refused when not one pack is left', () => {
    const r = lowStockChoicePayload('lower_minimum', W(), [H('a', 10)])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.te).toMatch(/[ఀ-౿]/)
  })
  it('"both" → retail only, wholesale values kept', () => {
    expect(lowStockChoicePayload('move_to_retail', W({ sale_mode: 'both' }), low)).toEqual({ ok: true, payload: { sale_mode: 'retail' } })
  })
  it('wholesale-only with a retail price already saved → just switch', () => {
    expect(lowStockChoicePayload('move_to_retail', W({ price_tier_1_price: 40 }), low)).toEqual({ ok: true, payload: { sale_mode: 'retail' } })
  })
  it('wholesale-only without a retail price needs one', () => {
    const r = lowStockChoicePayload('move_to_retail', W(), low)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.en).toMatch(/retail price/)
  })
  it('the retail price given is saved as tier 1', () => {
    expect(lowStockChoicePayload('move_to_retail', W(), low, '42.499')).toEqual({ ok: true, payload: {
      sale_mode: 'retail', price_tier_1_price: 42.5, price_tier_1_qty: 1,
    } })
  })
  it('a given price replaces an old one', () => {
    const r = lowStockChoicePayload('move_to_retail', W({ price_tier_1_price: 40 }), low, 45)
    expect(r.ok && r.payload).toMatchObject({ price_tier_1_price: 45 })
  })
  it('zero / junk retail price is refused', () => {
    expect(lowStockChoicePayload('move_to_retail', W(), low, '0').ok).toBe(false)
    expect(lowStockChoicePayload('move_to_retail', W(), low, 'abc').ok).toBe(false)
  })
  it('add stock writes nothing (it opens the produce)', () => {
    expect(lowStockChoicePayload('add_stock', W(), low)).toEqual({ ok: true, payload: null })
  })
  it('every choice has both languages', () => {
    for (const c of Object.values(LOW_STOCK_CHOICES)) {
      expect(c.en).toBeTruthy()
      expect(c.te).toMatch(/[ఀ-౿]/)
    }
  })
})

describe('lowStockAlertParams', () => {
  it('name, stock left, minimum — with units', () => {
    expect(lowStockAlertParams('Tomato', 'kg', 62.5, 100)).toEqual(['Tomato', '62.5 kg', '100 kg'])
  })
  it('defaults the unit and trims a long name', () => {
    const p = lowStockAlertParams('x'.repeat(100), null, 1, 2)
    expect(p[0]).toHaveLength(60)
    expect(p[1]).toBe('1 kg')
  })
})

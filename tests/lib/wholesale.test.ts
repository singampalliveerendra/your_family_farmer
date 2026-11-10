import { describe, it, expect } from 'vitest'
import {
  EMPTY_WHOLESALE_FORM,
  MAX_WHOLESALE_PRICE,
  MAX_WHOLESALE_QTY,
  SALE_MODES,
  SALE_MODE_LABELS,
  TRANSPORT_STATES,
  TRANSPORT_STATE_LABELS,
  WHOLESALE_COLUMNS,
  WHOLESALE_NOT_READY,
  isMultipleOf,
  isWholesaleColumnMissing,
  missingColumnAction,
  needsRetailPrice,
  normalizeStates,
  offersRetail,
  offersWholesale,
  parseSaleMode,
  parseTransport,
  resolveWholesale,
  normalizeRates,
  resolveWholesaleBody,
  resolveWholesaleColumns,
  wholesaleColumnsToSend,
  wholesaleRequestBody,
  resolveWholesaleForm,
  wholesaleFormFromRow,
  withoutWholesale,
  type WholesaleForm,
} from '@/lib/wholesale'

// A complete, valid wholesale entry sold loose (minimum + price per unit);
// each test changes one thing. Packs (pack price, min = one pack) since
// 2026-11-10 — see 'resolveWholesale — packs'.
const good = (extra: Partial<Parameters<typeof resolveWholesale>[0]> = {}) =>
  resolveWholesale({
    saleMode: 'wholesale',
    price: '30',
    minQty: '100',
    packSize: '',
    transport: true,
    states: ['AP'],
    unit: 'kg',
    ...extra,
  })

const errorOf = (r: ReturnType<typeof resolveWholesale>) => {
  if (r.ok) throw new Error('expected a failure, got ' + JSON.stringify(r.columns))
  return r.error
}
const columnsOf = (r: ReturnType<typeof resolveWholesale>) => {
  if (!r.ok) throw new Error('expected success, got ' + r.error.en)
  return r.columns
}
const statesOf = (r: ReturnType<typeof resolveWholesale>) => {
  const c = columnsOf(r)
  if (c.sale_mode === 'retail') throw new Error('expected wholesale columns')
  return c.wholesale_transport_states
}

describe('parseSaleMode', () => {
  it('accepts the three modes', () => {
    expect(parseSaleMode('retail')).toBe('retail')
    expect(parseSaleMode('wholesale')).toBe('wholesale')
    expect(parseSaleMode('both')).toBe('both')
  })
  it('reads anything else as retail (old rows, typos, wrong case, junk)', () => {
    for (const v of [undefined, null, '', 'Wholesale', 'BOTH', 'bulk', 1, true, {}, []]) {
      expect(parseSaleMode(v)).toBe('retail')
    }
  })
})

describe('offersWholesale / offersRetail / needsRetailPrice', () => {
  it('retail sells retail only', () => {
    expect(offersRetail('retail')).toBe(true)
    expect(offersWholesale('retail')).toBe(false)
    expect(needsRetailPrice('retail')).toBe(true)
  })
  it('wholesale sells wholesale only and needs no retail price', () => {
    expect(offersRetail('wholesale')).toBe(false)
    expect(offersWholesale('wholesale')).toBe(true)
    expect(needsRetailPrice('wholesale')).toBe(false)
  })
  it('both sells both and still needs the retail price', () => {
    expect(offersRetail('both')).toBe(true)
    expect(offersWholesale('both')).toBe(true)
    expect(needsRetailPrice('both')).toBe(true)
  })
})

describe('parseTransport', () => {
  it('yes values', () => {
    for (const v of [true, 'yes', 'true', 1, '1']) expect(parseTransport(v)).toBe(true)
  })
  it('no values', () => {
    for (const v of [false, 'no', 'false', 0, '0']) expect(parseTransport(v)).toBe(false)
  })
  it('anything else is unanswered', () => {
    for (const v of [null, undefined, '', 'maybe', 2, 'YES ', {}]) expect(parseTransport(v)).toBeNull()
  })
})

describe('normalizeStates', () => {
  it('keeps AP and TG, in that order, once each', () => {
    expect(normalizeStates(['TG', 'AP', 'TG'])).toEqual(['AP', 'TG'])
  })
  it('is case- and space-tolerant', () => {
    expect(normalizeStates([' ap ', 'tg'])).toEqual(['AP', 'TG'])
  })
  it('drops unknown states', () => {
    expect(normalizeStates(['KA', 'TN', 'AP'])).toEqual(['AP'])
  })
  it('accepts a comma string', () => {
    expect(normalizeStates('TG,AP')).toEqual(['AP', 'TG'])
  })
  it('non-list input is an empty list', () => {
    for (const v of [null, undefined, 5, {}, true]) expect(normalizeStates(v)).toEqual([])
  })
})

describe('isMultipleOf', () => {
  it('whole multiples', () => {
    expect(isMultipleOf(100, 25)).toBe(true)
    expect(isMultipleOf(25, 25)).toBe(true)
  })
  it('not multiples', () => {
    expect(isMultipleOf(30, 25)).toBe(false)
    expect(isMultipleOf(10, 25)).toBe(false)
  })
  it('survives float noise', () => {
    expect(isMultipleOf(0.3, 0.1)).toBe(true) // 0.3 / 0.1 = 2.9999999999999996
    expect(isMultipleOf(7.5, 2.5)).toBe(true)
  })
  it('zero or negative pack is never a multiple', () => {
    expect(isMultipleOf(10, 0)).toBe(false)
    expect(isMultipleOf(10, -5)).toBe(false)
  })
})

describe('resolveWholesale — retail', () => {
  it('writes only sale_mode, so saved wholesale values survive', () => {
    expect(columnsOf(resolveWholesale({
      saleMode: 'retail', price: 'junk', minQty: '-1', packSize: 'x', transport: null, states: ['KA'],
    }))).toEqual({ sale_mode: 'retail' })
  })
  it('a missing mode is retail', () => {
    expect(columnsOf(resolveWholesale({
      saleMode: undefined, price: '', minQty: '', packSize: '', transport: null, states: [],
    }))).toEqual({ sale_mode: 'retail' })
  })
})

describe('resolveWholesale — valid wholesale', () => {
  it('full entry', () => {
    expect(columnsOf(good())).toEqual({
      sale_mode: 'wholesale',
      wholesale_price: 30,
      wholesale_min_qty: 100,
      wholesale_pack_size: null,
      wholesale_pack_price: null,
      wholesale_transport_states: ['AP'],
      wholesale_transport_rates: {}, // no charge entered → AP is pickup-only in the app
    })
  })
  it('"both" keeps its mode', () => {
    expect(columnsOf(good({ saleMode: 'both' })).sale_mode).toBe('both')
  })
  it('only minimum → no pack size', () => {
    const c = columnsOf(good({ minQty: '30', packSize: '' }))
    expect(c).toMatchObject({ wholesale_min_qty: 30, wholesale_pack_size: null })
  })
  it('transport No → empty state list, even if states were ticked before', () => {
    expect(statesOf(good({ transport: false, states: ['AP', 'TG'] }))).toEqual([])
  })
  it('transport to both states', () => {
    expect(statesOf(good({ states: ['TG', 'AP'] }))).toEqual(['AP', 'TG'])
  })
  it('rounds price to 2 decimals and quantities to 3 (the column scales)', () => {
    const c = columnsOf(good({ price: '30.456', minQty: '12.3456' }))
    expect(c).toMatchObject({ wholesale_price: 30.46, wholesale_min_qty: 12.346 })
  })
  it('accepts numbers as well as strings (JSON bodies)', () => {
    expect(columnsOf(good({ price: 30, minQty: 100 }))).toMatchObject({ wholesale_price: 30 })
  })
  it('trims spaces and accepts ".5" and "5."', () => {
    expect(good({ price: ' 30 ', minQty: '.5' }).ok).toBe(true)
    expect(good({ price: '30.', minQty: '5' }).ok).toBe(true)
  })
  it('part units on kg: a 2.5 kg minimum', () => {
    expect(columnsOf(good({ minQty: '2.5' }))).toMatchObject({ wholesale_min_qty: 2.5, wholesale_pack_size: null })
  })
  it('the largest values the columns can hold', () => {
    const c = columnsOf(good({ price: String(MAX_WHOLESALE_PRICE), minQty: String(MAX_WHOLESALE_QTY) }))
    expect(c).toMatchObject({ wholesale_price: MAX_WHOLESALE_PRICE, wholesale_min_qty: MAX_WHOLESALE_QTY })
  })
  it('whole numbers are fine on piece units', () => {
    expect(good({ unit: 'piece', minQty: '120' }).ok).toBe(true)
  })
})

// Client card 2026-11-10: with a pack size the farmer prices ONE pack, the
// minimum is one pack, and "+" adds packs.
describe('resolveWholesale — packs', () => {
  const pack = (extra: Partial<Parameters<typeof resolveWholesale>[0]> = {}) =>
    good({ packSize: '25', packPrice: '700', price: '', minQty: '', ...extra })
  it('pack price as typed; per-unit price derived; minimum = one pack', () => {
    expect(columnsOf(pack())).toMatchObject({ wholesale_pack_size: 25, wholesale_pack_price: 700, wholesale_price: 28, wholesale_min_qty: 25 })
  })
  it('a typed minimum is ignored once there is a pack (the box is hidden)', () => {
    expect(columnsOf(pack({ minQty: '100' }))).toMatchObject({ wholesale_min_qty: 25 })
    expect(pack({ minQty: '30' }).ok).toBe(true)
  })
  it('an old caller sending only a per-unit price: pack price = price × pack', () => {
    expect(columnsOf(pack({ packPrice: undefined, price: '30' }))).toMatchObject({ wholesale_pack_price: 750, wholesale_price: 30 })
  })
  it('a 0.25 kg pack keeps all its decimals', () => {
    expect(columnsOf(pack({ packSize: '0.25', packPrice: '20' }))).toMatchObject({ wholesale_pack_size: 0.25, wholesale_min_qty: 0.25, wholesale_price: 80 })
  })
  it('rounds the pack to 3 decimals and prices to 2', () => {
    expect(columnsOf(pack({ packSize: '12.3456', packPrice: '100.456' }))).toMatchObject({ wholesale_pack_size: 12.346, wholesale_pack_price: 100.46 })
  })
  it('accepts numbers (JSON bodies)', () => {
    expect(columnsOf(pack({ packSize: 25, packPrice: 700 }))).toMatchObject({ wholesale_pack_price: 700 })
  })
  it('the largest pack the column can hold', () => {
    expect(columnsOf(pack({ packSize: String(MAX_WHOLESALE_QTY), packPrice: String(MAX_WHOLESALE_PRICE) }))).toMatchObject({ wholesale_pack_size: MAX_WHOLESALE_QTY })
  })
  it('whole packs are fine on piece units', () => {
    expect(pack({ unit: 'piece', packSize: '12', packPrice: '60' }).ok).toBe(true)
  })
  it('no pack price and no per-unit price → asks for the pack price', () => {
    expect(errorOf(pack({ packPrice: '' })).en).toMatch(/price of one pack/)
  })
  it.each(['0', '-5', 'abc'])('pack price %s is refused', (v) => {
    expect(errorOf(pack({ packPrice: v })).en).toMatch(/pack price must be a number above 0/)
  })
  it('pack price over the column limit', () => {
    expect(errorOf(pack({ packPrice: '1000000' })).en).toMatch(/too high/)
  })
  it('a pack price too small to give a per-unit price', () => {
    expect(errorOf(pack({ packSize: '1000', packPrice: '1' })).en).toMatch(/too low/)
  })
})

describe('resolveWholesale — price errors', () => {
  it('missing price', () => {
    expect(errorOf(good({ price: '' })).en).toMatch(/Enter the wholesale price/)
    expect(errorOf(good({ price: undefined })).en).toMatch(/Enter the wholesale price/)
    expect(errorOf(good({ price: null })).en).toMatch(/Enter the wholesale price/)
  })
  it('zero, negative or not a number', () => {
    for (const p of ['0', '-5', 'abc', '1e3', '₹30', '30,00', NaN, Infinity, {}, true]) {
      expect(errorOf(good({ price: p })).en).toMatch(/above 0/)
    }
  })
  it('over the column limit', () => {
    expect(errorOf(good({ price: '1000000' })).en).toMatch(/too high/)
  })
})

describe('resolveWholesale — quantity errors', () => {
  it('neither pack size nor minimum', () => {
    expect(errorOf(good({ packSize: '', minQty: '' })).en).toMatch(/pack size or the minimum/)
  })
  it('zero or negative pack / minimum', () => {
    expect(errorOf(good({ packSize: '0' })).en).toMatch(/Pack size must be a number above 0/)
    expect(errorOf(good({ minQty: '-10' })).en).toMatch(/Minimum quantity must be a number above 0/)
  })
  it('junk pack / minimum', () => {
    expect(errorOf(good({ packSize: 'bag' })).en).toMatch(/Pack size/)
    expect(errorOf(good({ minQty: '10kg' })).en).toMatch(/Minimum quantity/)
  })
  it('over the column limit', () => {
    expect(errorOf(good({ packSize: '', minQty: '10000000' })).en).toMatch(/too large/)
  })
  it('fractions on whole-only units are refused', () => {
    for (const unit of ['piece', 'bunch', 'dozen']) {
      expect(errorOf(good({ unit, packSize: '0.5', minQty: '' })).en).toMatch(/whole number for this unit/)
      expect(errorOf(good({ unit, packSize: '', minQty: '2.5' })).en).toMatch(/whole number for this unit/)
    }
  })
  it('no unit given behaves like kg (fractions allowed)', () => {
    expect(good({ unit: undefined, packSize: '0.5', minQty: '' }).ok).toBe(true)
  })
})

describe('resolveWholesale — transport errors', () => {
  it('not answered', () => {
    expect(errorOf(good({ transport: null })).en).toMatch(/Choose Yes or No/)
    expect(errorOf(good({ transport: undefined })).en).toMatch(/Choose Yes or No/)
  })
  it('Yes with no state', () => {
    expect(errorOf(good({ states: [] })).en).toMatch(/Andhra Pradesh, Telangana or both/)
  })
  it('Yes with only unknown states', () => {
    expect(errorOf(good({ states: ['KA'] })).en).toMatch(/Andhra Pradesh, Telangana or both/)
  })
})

describe('resolveWholesale — the order of checks', () => {
  it('quantities come first (the price asked depends on the pack), then price, then transport', () => {
    expect(errorOf(resolveWholesale({
      saleMode: 'both', price: '', minQty: '', packSize: '', transport: null, states: [],
    })).en).toMatch(/pack size or the minimum/)
    expect(errorOf(resolveWholesale({
      saleMode: 'both', price: '', minQty: '10', packSize: '', transport: null, states: [],
    })).en).toMatch(/Enter the wholesale price/)
  })
  it('quantities are reported before transport', () => {
    expect(errorOf(good({ packSize: '', minQty: '', transport: null })).en).toMatch(/pack size/)
  })
})

describe('every error has both languages', () => {
  const failures = [
    good({ price: '' }), good({ price: '0' }), good({ price: '9999999' }),
    good({ packSize: '', minQty: '' }), good({ packSize: '0' }), good({ minQty: '0' }),
    good({ packSize: '', minQty: '99999999' }), good({ packSize: '25', price: '', packPrice: '' }),
    good({ packSize: '25', packPrice: '0' }), good({ packSize: '1000', packPrice: '1' }),
    good({ unit: 'piece', packSize: '1.5', minQty: '' }),
    good({ transport: null }), good({ states: [] }),
  ]
  it.each(failures.map((r, i) => [i, r] as const))('failure %i', (_i, r) => {
    const e = errorOf(r)
    expect(e.en.trim()).not.toBe('')
    expect(e.te.trim()).not.toBe('')
    expect(e.te).not.toBe(e.en)
    expect(e.te).toMatch(/[ఀ-౿]/) // has Telugu script
  })
  it('the not-ready message too', () => {
    expect(WHOLESALE_NOT_READY.te).toMatch(/[ఀ-౿]/)
    expect(WHOLESALE_NOT_READY.en).toMatch(/Retail/)
  })
})

describe('labels', () => {
  it('every mode and state has an English and a Telugu label', () => {
    for (const m of SALE_MODES) {
      expect(SALE_MODE_LABELS[m].en).toBeTruthy()
      expect(SALE_MODE_LABELS[m].te).toMatch(/[ఀ-౿]/)
    }
    for (const s of TRANSPORT_STATES) {
      expect(TRANSPORT_STATE_LABELS[s].en).toBeTruthy()
      expect(TRANSPORT_STATE_LABELS[s].te).toMatch(/[ఀ-౿]/)
    }
  })
  it('states match the database CHECK (AP, TG only)', () => {
    expect([...TRANSPORT_STATES]).toEqual(['AP', 'TG'])
  })
})

describe('resolveWholesaleForm', () => {
  it('passes the form and unit through', () => {
    const form: WholesaleForm = { saleMode: 'both', price: '40', minQty: '', packSize: '10', packPrice: '', transport: false, states: [], rates: {} }
    expect(columnsOf(resolveWholesaleForm(form, 'kg'))).toEqual({
      sale_mode: 'both', wholesale_price: 40, wholesale_min_qty: 10, wholesale_pack_size: 10, wholesale_pack_price: 400, wholesale_transport_states: [], wholesale_transport_rates: {},
    })
    expect(resolveWholesaleForm({ ...form, packSize: '1.5' }, 'piece').ok).toBe(false)
  })
  it('the empty form is valid retail', () => {
    expect(columnsOf(resolveWholesaleForm(EMPTY_WHOLESALE_FORM))).toEqual({ sale_mode: 'retail' })
  })
})

describe('resolveWholesaleBody (moderator API)', () => {
  it('reads the column names plus wholesale_transport', () => {
    expect(columnsOf(resolveWholesaleBody({
      sale_mode: 'wholesale', wholesale_price: '25', wholesale_min_qty: '50', wholesale_pack_size: '',
      wholesale_transport: 'yes', wholesale_transport_states: ['TG'],
    }, 'kg'))).toEqual({
      sale_mode: 'wholesale', wholesale_price: 25, wholesale_min_qty: 50, wholesale_pack_size: null, wholesale_pack_price: null, wholesale_transport_states: ['TG'], wholesale_transport_rates: {},
    })
  })
  it('an old caller that sends nothing is retail', () => {
    expect(columnsOf(resolveWholesaleBody({ name: 'Tomato' }))).toEqual({ sale_mode: 'retail' })
  })
  it('validates like the form', () => {
    expect(resolveWholesaleBody({ sale_mode: 'both', wholesale_price: '0' }).ok).toBe(false)
  })
})

describe('wholesaleFormFromRow', () => {
  it('no row → empty retail form', () => {
    expect(wholesaleFormFromRow(null)).toEqual(EMPTY_WHOLESALE_FORM)
    expect(wholesaleFormFromRow(undefined)).toEqual(EMPTY_WHOLESALE_FORM)
  })
  it('a pre-migration row (no columns) → retail, transport unanswered', () => {
    expect(wholesaleFormFromRow({ id: 'x', name: 'Tomato' })).toEqual(EMPTY_WHOLESALE_FORM)
  })
  it('a wholesale row with transport', () => {
    expect(wholesaleFormFromRow({
      sale_mode: 'both', wholesale_price: 30, wholesale_min_qty: 100, wholesale_pack_size: 25,
      wholesale_transport_states: ['TG', 'AP'],
    })).toEqual({
      // A pack saved before pack prices: one pack's price shown (30 × 25).
      saleMode: 'both', price: '30', minQty: '100', packSize: '25', packPrice: '750', transport: true, states: ['AP', 'TG'],
      // No charges saved yet → empty boxes for each state, per order by default.
      rates: { AP: { mode: 'per_order', amount: '', freeAbove: '' }, TG: { mode: 'per_order', amount: '', freeAbove: '' } },
    })
  })
  it('a wholesale row without transport → No', () => {
    expect(wholesaleFormFromRow({
      sale_mode: 'wholesale', wholesale_price: 30, wholesale_min_qty: 100, wholesale_pack_size: null,
      wholesale_transport_states: [],
    })).toEqual({ saleMode: 'wholesale', price: '30', minQty: '100', packSize: '', packPrice: '', transport: false, states: [], rates: {} })
  })
  it('a retail row keeps saved wholesale values for a later switch', () => {
    const f = wholesaleFormFromRow({ sale_mode: 'retail', wholesale_price: 30, wholesale_min_qty: 50, wholesale_transport_states: [] })
    expect(f).toMatchObject({ saleMode: 'retail', price: '30', minQty: '50', transport: null })
  })
  it('numeric strings from PostgREST (numeric columns) are kept', () => {
    expect(wholesaleFormFromRow({ sale_mode: 'wholesale', wholesale_price: '30.50' }).price).toBe('30.50')
  })
  it('round-trips: a saved row resolves to the same columns', () => {
    const cols = columnsOf(good({ saleMode: 'both', states: ['AP', 'TG'] }))
    expect(columnsOf(resolveWholesaleForm(wholesaleFormFromRow(cols), 'kg'))).toEqual(cols)
  })
})

describe('pre-migration server handling', () => {
  it('spots a PostgREST missing-column error for any wholesale column', () => {
    for (const c of WHOLESALE_COLUMNS) {
      expect(isWholesaleColumnMissing(`Could not find the '${c}' column of 'produce_listings' in the schema cache`)).toBe(true)
    }
  })
  it('does not swallow other errors', () => {
    expect(isWholesaleColumnMissing('new row violates check constraint "produce_listings_wholesale_fields_check"')).toBe(false)
    expect(isWholesaleColumnMissing("Could not find the 'sale_step' column of 'produce_listings' in the schema cache")).toBe(false)
    expect(isWholesaleColumnMissing('permission denied for table produce_listings')).toBe(false)
    expect(isWholesaleColumnMissing(null)).toBe(false)
    expect(isWholesaleColumnMissing('')).toBe(false)
  })
  it('retail retries, wholesale refuses', () => {
    expect(missingColumnAction('retail')).toBe('retry')
    expect(missingColumnAction('wholesale')).toBe('refuse')
    expect(missingColumnAction('both')).toBe('refuse')
  })
  it('withoutWholesale strips every wholesale column and nothing else, without mutating', () => {
    const payload = {
      name: 'Tomato', sale_step: 1, sale_mode: 'both', wholesale_price: 30, wholesale_min_qty: 100,
      wholesale_pack_size: 25, wholesale_transport_states: ['AP'],
    }
    expect(withoutWholesale(payload)).toEqual({ name: 'Tomato', sale_step: 1 })
    expect(payload.sale_mode).toBe('both')
  })
})

describe('resolveWholesaleColumns (farmer edit route)', () => {
  it('no wholesale keys → leave the row alone', () => {
    expect(resolveWholesaleColumns({ name: 'Tomato', stock_qty: 5 })).toEqual({ ok: true, columns: null })
  })
  it('a stray wholesale field without sale_mode is refused', () => {
    const r = resolveWholesaleColumns({ wholesale_price: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.te).toMatch(/[ఀ-౿]/)
  })
  it('retail columns pass as just sale_mode', () => {
    expect(resolveWholesaleColumns({ sale_mode: 'retail', wholesale_price: 'junk' })).toEqual({ ok: true, columns: { sale_mode: 'retail' } })
  })
  it('valid wholesale columns: non-empty states mean transport Yes', () => {
    expect(resolveWholesaleColumns({
      sale_mode: 'both', wholesale_price: 30, wholesale_min_qty: 100, wholesale_pack_size: 25,
      wholesale_transport_states: ['TG', 'AP', 'AP'],
    }, 'kg')).toEqual({ ok: true, columns: {
      // A pack: minimum = one pack, pack price derived for an old caller.
      sale_mode: 'both', wholesale_price: 30, wholesale_min_qty: 25, wholesale_pack_size: 25, wholesale_pack_price: 750,
      wholesale_transport_states: ['AP', 'TG'], wholesale_transport_rates: {},
    } })
  })
  it('empty or missing states mean transport No', () => {
    const base = { sale_mode: 'wholesale', wholesale_price: 30, wholesale_min_qty: 10, wholesale_pack_size: null }
    for (const states of [[], null, undefined]) {
      const r = resolveWholesaleColumns({ ...base, wholesale_transport_states: states })
      expect(r.ok && r.columns && r.columns.sale_mode !== 'retail' ? r.columns.wholesale_transport_states : 'fail').toEqual([])
    }
  })
  it('states that are only unknown values are refused (Yes with no real state)', () => {
    expect(resolveWholesaleColumns({
      sale_mode: 'wholesale', wholesale_price: 30, wholesale_min_qty: 10, wholesale_transport_states: ['KA'],
    }).ok).toBe(false)
  })
  it('a non-list states value is refused', () => {
    expect(resolveWholesaleColumns({
      sale_mode: 'wholesale', wholesale_price: 30, wholesale_min_qty: 10, wholesale_transport_states: 'AP',
    }).ok).toBe(false)
  })
  it('bad values are refused with the same rules as the form', () => {
    expect(resolveWholesaleColumns({ sale_mode: 'wholesale', wholesale_price: 0, wholesale_min_qty: 10 }).ok).toBe(false)
    expect(resolveWholesaleColumns({ sale_mode: 'wholesale', wholesale_pack_price: -1, wholesale_pack_size: 25 }).ok).toBe(false)
    expect(resolveWholesaleColumns({ sale_mode: 'wholesale', wholesale_price: 30, wholesale_min_qty: 1.5 }, 'piece').ok).toBe(false)
  })
  it('the form output always passes the route check unchanged', () => {
    const form = good({ saleMode: 'both', states: ['AP', 'TG'] })
    const cols = columnsOf(form)
    expect(resolveWholesaleColumns({ ...cols }, 'kg')).toEqual({ ok: true, columns: cols })
    const noTransport = columnsOf(good({ transport: false, minQty: '', packSize: '10' }))
    expect(resolveWholesaleColumns({ ...noTransport }, 'kg')).toEqual({ ok: true, columns: noTransport })
  })
})

describe('wholesaleColumnsToSend', () => {
  const both = columnsOf(good({ saleMode: 'both' }))
  it('retail on an un-migrated server sends nothing', () => {
    expect(wholesaleColumnsToSend({ sale_mode: 'retail' }, false)).toEqual({})
  })
  it('retail on a migrated server sends sale_mode (so Wholesale → Retail sticks)', () => {
    expect(wholesaleColumnsToSend({ sale_mode: 'retail' }, true)).toEqual({ sale_mode: 'retail' })
  })
  it('wholesale is always sent, ready or not (an un-migrated server must refuse it, not drop it)', () => {
    expect(wholesaleColumnsToSend(both, false)).toEqual(both)
    expect(wholesaleColumnsToSend(both, true)).toEqual(both)
  })
  it('returns a copy', () => {
    const out = wholesaleColumnsToSend(both, true)
    expect(out).not.toBe(both)
  })
})

describe('wholesaleRequestBody (moderator form → API)', () => {
  const form: WholesaleForm = { saleMode: 'both', price: '30', minQty: '100', packSize: '25', packPrice: '', transport: true, states: ['AP'], rates: { AP: { mode: 'per_unit', amount: '2', freeAbove: '1000' } } }
  it('retail on an un-migrated server sends nothing', () => {
    expect(wholesaleRequestBody({ ...form, saleMode: 'retail' }, false)).toEqual({})
  })
  it('retail on a migrated server sends sale_mode retail', () => {
    expect(wholesaleRequestBody({ ...form, saleMode: 'retail' }, true)).toMatchObject({ sale_mode: 'retail' })
  })
  it('round-trips through resolveWholesaleBody to the same columns as the form', () => {
    expect(resolveWholesaleBody(wholesaleRequestBody(form, false), 'kg')).toEqual(resolveWholesaleForm(form, 'kg'))
    const no = { ...form, transport: false as const, states: [] }
    expect(resolveWholesaleBody(wholesaleRequestBody(no, true), 'kg')).toEqual(resolveWholesaleForm(no, 'kg'))
  })
  it('an unanswered transport stays unanswered on the server', () => {
    expect(resolveWholesaleBody(wholesaleRequestBody({ ...form, transport: null }, true), 'kg').ok).toBe(false)
  })
})

describe('transport charges per state (Phase 6)', () => {
  const base = { saleMode: 'wholesale', price: '30', minQty: '100', packSize: '25', transport: true, states: ['AP', 'TG'], unit: 'kg' }
  const cols = (rates: unknown) => {
    const r = resolveWholesale({ ...base, rates })
    if (!r.ok) throw new Error(r.error.en)
    return (r.columns as { wholesale_transport_rates: unknown }).wholesale_transport_rates
  }
  it('per order, per kg, free above — from the form', () => {
    expect(cols({ AP: { mode: 'per_order', amount: '500', freeAbove: '' }, TG: { mode: 'per_unit', amount: '1.5', freeAbove: '2000' } })).toEqual({
      AP: { mode: 'per_order', amount: 500, free_above: null },
      TG: { mode: 'per_unit', amount: 1.5, free_above: 2000 },
    })
  })
  it('the column shape (a saved row) reads the same', () => {
    expect(cols({ AP: { mode: 'per_unit', amount: 2, free_above: 1000 } })).toEqual({ AP: { mode: 'per_unit', amount: 2, free_above: 1000 } })
  })
  it('₹0 is free delivery, kept as 0', () => {
    expect(cols({ AP: { mode: 'per_order', amount: '0', freeAbove: '' } })).toEqual({ AP: { mode: 'per_order', amount: 0, free_above: null } })
  })
  it('a blank charge leaves that state without a rate (pickup-only in the app), never free', () => {
    expect(cols({ AP: { mode: 'per_order', amount: '', freeAbove: '' } })).toEqual({})
    expect(cols(undefined)).toEqual({})
  })
  it('rates for a state they do not deliver to are dropped', () => {
    const r = resolveWholesale({ ...base, states: ['AP'], rates: { TG: { mode: 'per_order', amount: '500' } } })
    expect(r.ok && (r.columns as { wholesale_transport_rates: unknown }).wholesale_transport_rates).toEqual({})
  })
  it('transport No → no rates at all', () => {
    const r = resolveWholesale({ ...base, transport: false, rates: { AP: { mode: 'per_order', amount: '500' } } })
    expect(r.ok && (r.columns as { wholesale_transport_rates: unknown }).wholesale_transport_rates).toEqual({})
  })
  it('an unknown mode reads as per order', () => {
    expect(cols({ AP: { mode: 'weird', amount: '100' } })).toEqual({ AP: { mode: 'per_order', amount: 100, free_above: null } })
  })
  it.each([
    [{ AP: { amount: '-5' } }, /0 or more/],
    [{ AP: { amount: 'abc' } }, /0 or more/],
    [{ AP: { amount: '5', freeAbove: '0' } }, /Free above/],
    [{ AP: { amount: '5', freeAbove: 'x' } }, /Free above/],
  ])('refuses %o', (rates, msg) => {
    const r = resolveWholesale({ ...base, rates })
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.error.en).toMatch(msg); expect(r.error.te).toMatch(/[ఀ-౿]/) }
  })
  it('round-trips through a saved row', () => {
    const r = resolveWholesale({ ...base, rates: { AP: { mode: 'per_unit', amount: '2', freeAbove: '1000' }, TG: { mode: 'per_order', amount: '800', freeAbove: '' } } })
    if (!r.ok) throw new Error('bad')
    const back = resolveWholesaleForm(wholesaleFormFromRow(r.columns as unknown as Record<string, unknown>), 'kg')
    expect(back).toEqual(r)
  })
  it('normalizeRates: lenient reading of junk', () => {
    expect(normalizeRates(null)).toEqual({})
    expect(normalizeRates({ AP: { amount: 'x' }, TG: { amount: 10, free_above: -1 }, KA: { amount: 1 } })).toEqual({ TG: { mode: 'per_order', amount: 10, free_above: null } })
  })
})

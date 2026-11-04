import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MAX_WHOLESALE_PRICE, MAX_WHOLESALE_QTY, SALE_MODES, TRANSPORT_STATES, WHOLESALE_COLUMNS } from '@/lib/wholesale'

// The wholesale migration, the schema snapshot and src/lib/wholesale.ts must
// agree. Each is easy to change alone; this catches the drift.
const read = (f: string) => readFileSync(join(process.cwd(), 'scripts', f), 'utf8')
// Strip SQL comments so a mention in a comment can't satisfy a check.
const sql = (f: string) => read(f).replace(/--.*$/gm, '')

const files = ['wholesale-migration.sql', 'staging-schema.sql'] as const

describe.each(files)('%s', (file) => {
  const s = sql(file)

  it('adds every column the code writes', () => {
    // The transport-rates column comes with the bulk-orders part (Phase 6).
    const all = file === 'staging-schema.sql' ? s : s + sql('bulk-orders-migration.sql')
    for (const c of WHOLESALE_COLUMNS) expect(all).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\b`))
    expect(s).toMatch(/ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'retail'/)
  })

  it('sale_mode defaults to retail and is NOT NULL', () => {
    expect(s).toMatch(/sale_mode text NOT NULL DEFAULT 'retail'/)
  })

  it('allows exactly the sale modes the code knows', () => {
    const m = s.match(/CHECK \(sale_mode IN \(([^)]*)\)\)/)
    expect(m).not.toBeNull()
    expect(m![1].split(',').map((x) => x.trim().replace(/'/g, ''))).toEqual([...SALE_MODES])
  })

  it('allows exactly the transport states the code knows', () => {
    const m = s.match(/wholesale_transport_states <@ ARRAY\[([^\]]*)\]/)
    expect(m).not.toBeNull()
    expect(m![1].split(',').map((x) => x.trim().replace(/'/g, ''))).toEqual([...TRANSPORT_STATES])
  })

  it('the price/minimum check cannot be passed by a NULL (COALESCE, not a bare > 0)', () => {
    const m = s.match(/produce_listings_wholesale_fields_check\s+CHECK \(([\s\S]*?)\);/)
    expect(m).not.toBeNull()
    expect(m![1]).toMatch(/COALESCE\(wholesale_price, 0\) > 0/)
    expect(m![1]).toMatch(/COALESCE\(wholesale_min_qty, 0\) > 0/)
    expect(m![1]).not.toMatch(/\(wholesale_price > 0/)
  })

  it('column sizes match the limits the code enforces', () => {
    expect(s).toMatch(/wholesale_price numeric\(8,2\)/)
    expect(s).toMatch(/wholesale_min_qty numeric\(10,3\)/)
    expect(s).toMatch(/wholesale_pack_size numeric\(10,3\)/)
    expect(MAX_WHOLESALE_PRICE).toBe(999999.99) // largest numeric(8,2)
    expect(MAX_WHOLESALE_QTY).toBe(9999999.999) // largest numeric(10,3)
  })

  it('order_type allows only retail and wholesale', () => {
    expect(s).toMatch(/CHECK \(order_type IN \('retail', 'wholesale'\)\)/)
  })
})

describe('CHECK-prod-migrations.sql', () => {
  it('can tell which database has the wholesale migration', () => {
    const s = sql('CHECK-prod-migrations.sql')
    expect(s).toMatch(/column_name='sale_mode'/)
    expect(s).toMatch(/column_name='order_type'/)
  })
})

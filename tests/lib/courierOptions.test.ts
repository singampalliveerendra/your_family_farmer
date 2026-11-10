import { describe, it, expect } from 'vitest'
import {
  applyCourierColumns,
  courierFormFromRow,
  courierRequestBody,
  isCourierColumnMissing,
  normalizeCargoServices,
  resolveCourier,
  withoutCourier,
  EMPTY_COURIER_FORM,
} from '@/lib/courierOptions'
import { parseRetailReachSave } from '@/lib/retailReach'

// Client card 2026-11-10: Delivery step — Pickup only / I will courier / Both;
// courier = Local (radius, who pays) or Cargo (ToPay services, who pays).

const errOf = (r: ReturnType<typeof resolveCourier>) => (r.ok ? '' : r.error.en)

describe('pickup only', () => {
  it('clears every courier field and keeps the produce local', () => {
    expect(resolveCourier({ deliveryMode: 'pickup', courierType: 'cargo', cargoServices: ['VRL Logistics'], paidBy: 'buyer', charge: '50' })).toEqual({
      ok: true,
      columns: { courier_type: null, cargo_services: [], delivery_paid_by: null, delivery_charge: null, delivery_radius_km: null, retail_reach: 'local', retail_transport_rates: {} },
    })
  })
  it('no delivery method → asked to choose', () => {
    expect(errOf(resolveCourier({ deliveryMode: '', courierType: '', paidBy: '' }))).toMatch(/Choose a delivery method/)
  })
})

describe('local delivery', () => {
  const local = (x: object = {}) => resolveCourier({ deliveryMode: 'courier', courierType: 'local', paidBy: 'buyer', charge: '40', radius: '10', ...x })
  it('buyer pays: the charge is kept, radius rounded', () => {
    expect(local({ radius: '10.4' })).toEqual({ ok: true, columns: {
      courier_type: 'local', cargo_services: [], delivery_paid_by: 'buyer', delivery_charge: 40, delivery_radius_km: 10, retail_reach: 'local', retail_transport_rates: {},
    } })
  })
  it('farmer pays: free for the buyer, any typed charge ignored', () => {
    expect(local({ paidBy: 'farmer', charge: '99' })).toMatchObject({ ok: true, columns: { delivery_paid_by: 'farmer', delivery_charge: 0 } })
  })
  it('radius is optional', () => {
    expect(local({ radius: '' })).toMatchObject({ ok: true, columns: { delivery_radius_km: null } })
  })
  it.each([
    [{ courierType: '' }, /Local delivery or Cargo/],
    [{ paidBy: '' }, /Who pays for delivery/],
    [{ charge: '' }, /Enter the delivery charge/],
    [{ charge: '0' }, /above 0.*Farmer pays/],
    [{ charge: 'abc' }, /above 0/],
    [{ radius: '0' }, /radius/],
    [{ radius: '9999' }, /radius/],
  ])('refuses %o', (x, msg) => {
    const r = local(x)
    expect(errOf(r)).toMatch(msg)
    if (!r.ok) expect(r.error.te).toMatch(/[ఀ-౿]/)
  })
})

describe('cargo', () => {
  const cargo = (x: object = {}) => resolveCourier({ deliveryMode: 'both', courierType: 'cargo', cargoServices: ['VRL Logistics'], otherCargo: '', paidBy: 'buyer', ...x })
  it('ToPay: services saved, nothing charged online, offered across AP and TG', () => {
    expect(cargo({ otherCargo: 'Sri Durga Parcels, vrl logistics' })).toEqual({ ok: true, columns: {
      courier_type: 'cargo', cargo_services: ['VRL Logistics', 'Sri Durga Parcels'], delivery_paid_by: 'buyer',
      delivery_charge: 0, delivery_radius_km: null, retail_reach: 'transport', retail_transport_rates: { AP: 0, TG: 0 },
    } })
  })
  it('farmer pays the cargo: still nothing online', () => {
    expect(cargo({ paidBy: 'farmer' })).toMatchObject({ ok: true, columns: { delivery_paid_by: 'farmer', delivery_charge: 0 } })
  })
  it('at least one service', () => {
    expect(errOf(cargo({ cargoServices: [], otherCargo: ' , ' }))).toMatch(/at least one cargo service/)
  })
  it('the reach it writes passes the shop’s reach rules', () => {
    const r = cargo()
    expect(r.ok && parseRetailReachSave(r.columns, 'both')).toMatchObject({ ok: true, reach: 'transport', rates: { AP: 0, TG: 0 } })
  })
})

describe('normalizeCargoServices', () => {
  it('trims, collapses spaces, drops repeats (any case) and blanks, caps length and count', () => {
    expect(normalizeCargoServices(['  VRL   Logistics ', 'vrl logistics', '', 'x'.repeat(60)])).toEqual(['VRL Logistics', 'x'.repeat(40)])
    expect(normalizeCargoServices('A, B\nC')).toEqual(['A', 'B', 'C'])
    expect(normalizeCargoServices(Array.from({ length: 20 }, (_, i) => `S${i}`))).toHaveLength(12)
    expect(normalizeCargoServices(null)).toEqual([])
  })
})

describe('the form ↔ the row', () => {
  it('a cargo row: known names ticked, others in the Other box', () => {
    expect(courierFormFromRow({ delivery_mode: 'courier', courier_type: 'cargo', cargo_services: ['VRL Logistics', 'Sri Durga Parcels'], delivery_paid_by: 'buyer' }))
      .toEqual({ courierType: 'cargo', cargoServices: ['VRL Logistics'], otherCargo: 'Sri Durga Parcels', paidBy: 'buyer', charge: '', radius: '' })
  })
  it('a row from before this step: a charge meant the buyer paid, none meant free', () => {
    expect(courierFormFromRow({ delivery_mode: 'courier', delivery_charge: 30, delivery_radius_km: 8 })).toMatchObject({ courierType: 'local', paidBy: 'buyer', charge: '30', radius: '8' })
    expect(courierFormFromRow({ delivery_mode: 'both', delivery_charge: null })).toMatchObject({ courierType: 'local', paidBy: 'farmer' })
  })
  it('an old "Transportable across AP & TG" listing opens on Cargo, to be finished', () => {
    expect(courierFormFromRow({ delivery_mode: 'courier', retail_reach: 'transport' })).toMatchObject({ courierType: 'cargo', cargoServices: [], paidBy: '' })
  })
  it('pickup-only and empty rows', () => {
    expect(courierFormFromRow({ delivery_mode: 'pickup' })).toMatchObject({ courierType: '' })
    expect(courierFormFromRow(null)).toEqual(EMPTY_COURIER_FORM)
  })
  it('round trip through the request body', () => {
    const f = courierFormFromRow({ delivery_mode: 'courier', courier_type: 'cargo', cargo_services: ['VRL Logistics', 'Sri Durga Parcels'], delivery_paid_by: 'farmer' })
    const body = { delivery_mode: 'courier', ...courierRequestBody(f) }
    expect(applyCourierColumns(body)).toBeNull()
    expect(body).toMatchObject({ courier_type: 'cargo', cargo_services: ['VRL Logistics', 'Sri Durga Parcels'], delivery_paid_by: 'farmer', delivery_charge: 0 })
  })
})

describe('server helpers', () => {
  it('a payload without courier columns is left alone', () => {
    const p = { delivery_mode: 'courier', delivery_charge: 30 }
    expect(applyCourierColumns(p)).toBeNull()
    expect(p).toEqual({ delivery_mode: 'courier', delivery_charge: 30 })
  })
  it('a crafted cargo payload with an online charge is normalised to ₹0', () => {
    const p: Record<string, unknown> = { delivery_mode: 'courier', courier_type: 'cargo', cargo_services: ['VRL Logistics'], delivery_paid_by: 'buyer', delivery_charge: 500, retail_transport_rates: { AP: 500 } }
    expect(applyCourierColumns(p)).toBeNull()
    expect(p).toMatchObject({ delivery_charge: 0, retail_transport_rates: { AP: 0, TG: 0 } })
  })
  it('a broken payload returns the message', () => {
    expect(applyCourierColumns({ delivery_mode: 'courier', courier_type: 'local' })?.en).toMatch(/Who pays/)
  })
  it('missing-column detection and stripping', () => {
    expect(isCourierColumnMissing("Could not find the 'courier_type' column of 'produce_listings' in the schema cache")).toBe(true)
    expect(isCourierColumnMissing('permission denied')).toBe(false)
    expect(withoutCourier({ a: 1, courier_type: 'local', cargo_services: [], delivery_paid_by: 'buyer' })).toEqual({ a: 1 })
  })
})

describe('courier-options migration', () => {
  it('is mirrored in the schema, with every CHECK', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of ['scripts/courier-options-migration.sql', 'scripts/staging-schema.sql']) {
      const s = readFileSync(f, 'utf8')
      for (const c of ['courier_type text', "cargo_services jsonb NOT NULL DEFAULT '[]'::jsonb", 'delivery_paid_by text']) expect(s).toContain(`ADD COLUMN IF NOT EXISTS ${c}`)
      expect(s).toContain("CHECK (courier_type IS NULL OR courier_type IN ('local', 'cargo'))")
      expect(s).toContain("CHECK (delivery_paid_by IS NULL OR delivery_paid_by IN ('farmer', 'buyer'))")
      expect(s).toContain('CHECK (courier_type IS NULL OR delivery_paid_by IS NOT NULL)')
      expect(s).toMatch(/courier_type IS NOT NULL AND courier_type = 'cargo' AND jsonb_array_length\(cargo_services\) >= 1/)
    }
  })
})

describe('checkout: cargo choice (part 2)', () => {
  it('cart fields only for cargo produce', async () => {
    const { cartCargoFields } = await import('@/lib/courierOptions')
    expect(cartCargoFields({ courier_type: 'cargo', cargo_services: ['VRL Logistics'], delivery_paid_by: 'buyer' })).toEqual({ courierType: 'cargo', cargoServices: ['VRL Logistics'], deliveryPaidBy: 'buyer' })
    expect(cartCargoFields({ courier_type: 'local', delivery_paid_by: 'buyer' })).toEqual({})
    expect(cartCargoFields({ courier_type: 'cargo', cargo_services: [] })).toEqual({})
  })
  it('one parcel per farmer: only services every line lists; ToPay if any line is', async () => {
    const { commonCargoServices, parcelPaidBy } = await import('@/lib/courierOptions')
    expect(commonCargoServices([{ cargoServices: ['VRL Logistics', 'Navata Road Transport'] }, { cargoServices: ['navata road transport', 'SRMT'] }])).toEqual(['Navata Road Transport'])
    expect(commonCargoServices([])).toEqual([])
    expect(parcelPaidBy([{ deliveryPaidBy: 'farmer' }, { deliveryPaidBy: 'buyer' }])).toBe('buyer')
    expect(parcelPaidBy([{ deliveryPaidBy: 'farmer' }])).toBe('farmer')
  })
  it('server check of the buyer’s pick', async () => {
    const { checkCargoChoice } = await import('@/lib/courierOptions')
    const rows = [
      { name: 'Mirchi', courier_type: 'cargo', cargo_services: ['VRL Logistics', 'SRMT'], delivery_paid_by: 'buyer' },
      { name: 'Tomato', courier_type: 'cargo', cargo_services: ['SRMT'], delivery_paid_by: 'farmer' },
    ]
    expect(checkCargoChoice([{ name: 'X', courier_type: 'local' }], 'SRMT')).toBeNull()
    expect(checkCargoChoice(rows, ' srmt ')).toEqual({ ok: true, service: 'SRMT', paidBy: 'buyer' })
    expect(checkCargoChoice(rows, 'VRL Logistics')).toMatchObject({ ok: false, error: expect.stringMatching(/Choose the cargo service.*SRMT/) })
    expect(checkCargoChoice(rows, undefined)).toMatchObject({ ok: false })
    expect(checkCargoChoice([rows[0], { ...rows[1], cargo_services: ['APSRTC Cargo'] }], 'SRMT')).toMatchObject({ ok: false, error: expect.stringMatching(/order them separately/) })
  })
})

describe('orders cargo columns', () => {
  it('are in the migration and the schema, with the both-or-neither CHECK', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of ['scripts/courier-options-migration.sql', 'scripts/staging-schema.sql']) {
      const s = readFileSync(f, 'utf8')
      expect(s).toContain('ADD COLUMN IF NOT EXISTS cargo_service text')
      expect(s).toContain('ADD COLUMN IF NOT EXISTS cargo_paid_by text')
      expect(s).toMatch(/\(cargo_service IS NULL AND cargo_paid_by IS NULL\)\s+OR \(cargo_service IS NOT NULL AND cargo_paid_by IS NOT NULL/)
    }
  })
})

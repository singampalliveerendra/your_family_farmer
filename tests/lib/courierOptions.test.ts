import { describe, it, expect } from 'vitest'
import {
  applyCourierColumns,
  courierFormFromRow,
  courierRequestBody,
  isCourierColumnMissing,
  normalizeCargoServices,
  resolveCourier,
  withoutCourier,
  cartCargoFields,
  checkCargoChoice,
  sendsByCargo,
  EMPTY_COURIER_FORM,
  type ProfileDelivery,
} from '@/lib/courierOptions'
import { parseRetailReachSave, reachFor } from '@/lib/retailReach'
import { CARGO_LOCAL_KM, cargoNeeded } from '@/lib/courierOptions'

// Client card 2026-11-10: Delivery step — Pickup only / I will courier / Both.
// 2026-11-27: each produce only picks Local / Cargo / Both; the services, who
// pays, the local charge and radius come from the farmer's profile.

const errOf = (r: ReturnType<typeof resolveCourier>) => (r.ok ? '' : r.error.en)
const PROFILE: ProfileDelivery = { cargoServices: ['VRL Logistics', 'SRMT'], cargoPaidBy: 'buyer', localPaidBy: 'buyer', localCharge: 40, localRadiusKm: 10 }
const resolve = (type: string, settings: ProfileDelivery | null | undefined = PROFILE, mode = 'courier') =>
  resolveCourier({ deliveryMode: mode, courierType: type, settings })

describe('pickup only', () => {
  it('clears every courier field and keeps the produce local', () => {
    expect(resolve('cargo', PROFILE, 'pickup')).toEqual({
      ok: true,
      columns: { courier_type: null, cargo_services: [], delivery_paid_by: null, delivery_charge: null, delivery_radius_km: null, retail_reach: 'local', retail_transport_rates: {} },
    })
  })
  it('no delivery method → asked to choose', () => {
    expect(errOf(resolve('', PROFILE, ''))).toMatch(/Choose a delivery method/)
  })
})

describe('Local / Cargo / Both from the profile', () => {
  it('local: the profile’s payer, charge and radius', () => {
    expect(resolve('local')).toEqual({ ok: true, columns: {
      courier_type: 'local', cargo_services: [], delivery_paid_by: 'buyer', delivery_charge: 40, delivery_radius_km: 10, retail_reach: 'local', retail_transport_rates: {},
    } })
  })
  it('local, farmer pays: free for the buyer', () => {
    expect(resolve('local', { ...PROFILE, localPaidBy: 'farmer', localCharge: null })).toMatchObject({ ok: true, columns: { delivery_paid_by: 'farmer', delivery_charge: 0 } })
  })
  it('cargo: the profile’s services and payer, nothing charged online', () => {
    expect(resolve('cargo')).toEqual({ ok: true, columns: {
      courier_type: 'cargo', cargo_services: ['VRL Logistics', 'SRMT'], delivery_paid_by: 'buyer',
      delivery_charge: 0, delivery_radius_km: null, retail_reach: 'transport', retail_transport_rates: { AP: 0, TG: 0 },
    } })
  })
  it('both: cargo services + payer, and the local charge and radius', () => {
    expect(resolve('both')).toEqual({ ok: true, columns: {
      courier_type: 'both', cargo_services: ['VRL Logistics', 'SRMT'], delivery_paid_by: 'buyer',
      delivery_charge: 40, delivery_radius_km: 10, retail_reach: 'transport', retail_transport_rates: { AP: 0, TG: 0 },
    } })
  })
  it('what the type needs must be set on the profile', () => {
    const noCargo = { ...PROFILE, cargoServices: [], cargoPaidBy: null }
    const noLocal = { ...PROFILE, localPaidBy: null }
    expect(errOf(resolve('cargo', noCargo))).toMatch(/cargo services in your profile/)
    expect(errOf(resolve('both', noCargo))).toMatch(/cargo services in your profile/)
    expect(errOf(resolve('local', noLocal))).toMatch(/local delivery in your profile/)
    expect(errOf(resolve('both', noLocal))).toMatch(/local delivery in your profile/)
    expect(resolve('local', noCargo).ok).toBe(true)
    expect(resolve('cargo', noLocal).ok).toBe(true)
    const r = resolve('cargo', noCargo)
    if (!r.ok) expect(r.error.te).toMatch(/[ఀ-౿]/)
  })
  it('an unknown type is refused', () => {
    expect(errOf(resolve(''))).toMatch(/Local, Cargo or Both/)
  })
  it('in the browser before the profile loads: only the type is checked', () => {
    expect(resolve('cargo', undefined)).toMatchObject({ ok: true, columns: { courier_type: 'cargo' } })
  })
  it('no profile columns yet (migration not run): Local saves free, Cargo / Both refused', () => {
    expect(resolve('local', null)).toMatchObject({ ok: true, columns: { courier_type: 'local', delivery_paid_by: 'farmer', delivery_charge: 0 } })
    expect(errOf(resolve('cargo', null))).toMatch(/not switched on/)
    expect(errOf(resolve('both', null))).toMatch(/not switched on/)
  })
  it('the reach it writes passes the shop’s reach rules', () => {
    const r = resolve('cargo')
    expect(r.ok && parseRetailReachSave(r.columns, 'both')).toMatchObject({ ok: true, reach: 'transport', rates: { AP: 0, TG: 0 } })
  })
})

describe('both behaves as cargo for far buyers', () => {
  it('sendsByCargo', () => {
    expect(sendsByCargo('cargo')).toBe(true)
    expect(sendsByCargo('both')).toBe(true)
    expect(sendsByCargo('local')).toBe(false)
    expect(sendsByCargo(null)).toBe(false)
  })
  it('the cart line and the checkout choice', () => {
    const row = { name: 'Tomato', courier_type: 'both', cargo_services: ['VRL Logistics'], delivery_paid_by: 'buyer' }
    expect(cartCargoFields(row)).toEqual({ courierType: 'cargo', cargoServices: ['VRL Logistics'], deliveryPaidBy: 'buyer' })
    expect(checkCargoChoice([row], 'vrl logistics')).toEqual({ ok: true, service: 'VRL Logistics', paidBy: 'buyer' })
  })
  it('the feed: local inside the radius, cargo beyond', () => {
    const l = { courier_type: 'both', delivery_radius_km: 10, retail_reach: 'transport' }
    const farm = { lat: 16.81, lng: 81.53 }
    expect(reachFor(l, farm, { lat: 16.85, lng: 81.56, state: 'AP' }).kind).toBe('local')
    expect(reachFor(l, farm, { lat: 17.69, lng: 83.22, state: 'AP' }).kind).toBe('transport')
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
  it('reads the type', () => {
    expect(courierFormFromRow({ delivery_mode: 'courier', courier_type: 'cargo' })).toEqual({ courierType: 'cargo' })
    expect(courierFormFromRow({ delivery_mode: 'both', courier_type: 'both' })).toEqual({ courierType: 'both' })
  })
  it('older rows: a courier row with no type is Local; an old "Transportable" one opens on Cargo', () => {
    expect(courierFormFromRow({ delivery_mode: 'courier', delivery_charge: 30 })).toEqual({ courierType: 'local' })
    expect(courierFormFromRow({ delivery_mode: 'courier', retail_reach: 'transport' })).toEqual({ courierType: 'cargo' })
  })
  it('pickup-only and empty rows', () => {
    expect(courierFormFromRow({ delivery_mode: 'pickup' })).toEqual({ courierType: '' })
    expect(courierFormFromRow(null)).toEqual(EMPTY_COURIER_FORM)
  })
  it('round trip through the request body', () => {
    const body = { delivery_mode: 'courier', ...courierRequestBody({ courierType: 'both' }) }
    expect(applyCourierColumns(body, PROFILE)).toBeNull()
    expect(body).toMatchObject({ courier_type: 'both', cargo_services: ['VRL Logistics', 'SRMT'], delivery_charge: 40 })
  })
})

describe('server helpers', () => {
  it('a payload without courier columns is left alone', () => {
    const p = { delivery_mode: 'courier', delivery_charge: 30 }
    expect(applyCourierColumns(p, PROFILE)).toBeNull()
    expect(p).toEqual({ delivery_mode: 'courier', delivery_charge: 30 })
  })
  it('whatever a crafted request sends, the profile decides', () => {
    const p: Record<string, unknown> = { delivery_mode: 'courier', courier_type: 'cargo', cargo_services: ['Fake Co'], delivery_paid_by: 'farmer', delivery_charge: 500, retail_transport_rates: { AP: 500 } }
    expect(applyCourierColumns(p, PROFILE)).toBeNull()
    expect(p).toMatchObject({ cargo_services: ['VRL Logistics', 'SRMT'], delivery_paid_by: 'buyer', delivery_charge: 0, retail_transport_rates: { AP: 0, TG: 0 } })
  })
  it('a broken payload returns the message', () => {
    expect(applyCourierColumns({ delivery_mode: 'courier', courier_type: 'local' }, { ...PROFILE, localPaidBy: null })?.en).toMatch(/local delivery in your profile/)
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

describe('cargo reach anywhere in India (2026-11-11)', () => {
  it('beyond the radius, cargo shows for any buyer, even with no AP/TG state', async () => {
    const { reachFor } = await import('@/lib/retailReach')
    const farm = { lat: 16.8142, lng: 81.5288 } // Tadepalligudem
    const bengaluru = { lat: 12.9716, lng: 77.5946, state: null }
    const cargo = { courier_type: 'cargo', retail_reach: 'transport', retail_transport_rates: { AP: 0, TG: 0 } }
    expect(reachFor(cargo, farm, bengaluru as never)).toMatchObject({ show: true, kind: 'transport', charge: 0 })
    expect(reachFor({ retail_reach: 'transport', retail_transport_rates: { AP: 80 } }, farm, bengaluru as never)).toMatchObject({ show: false, kind: 'out_of_range' })
  })
})

describe('all-india-transport migration', () => {
  it('lets wholesale transport and bulk orders use IN, in the migration and the schema', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of ['scripts/all-india-transport-migration.sql', 'scripts/staging-schema.sql']) {
      const s = readFileSync(f, 'utf8')
      expect(s).toContain("CHECK (wholesale_transport_states <@ ARRAY['AP', 'TG', 'IN']::text[])")
      expect(s).toContain("CHECK (transport_state IS NULL OR transport_state IN ('AP', 'TG', 'IN'))")
    }
  })
})

describe('cargoNeeded — cargo only for buyers more than 20 km away (2026-11-27)', () => {
  const farm = { lat: 16.81, lng: 81.53 }
  it('20 km is the line', () => expect(CARGO_LOCAL_KM).toBe(20))
  it('a buyer within 20 km gets normal delivery', () => {
    expect(cargoNeeded(farm, { lat: 16.85, lng: 81.56 })).toBe(false) // ~5 km
    expect(cargoNeeded(farm, { lat: 16.95, lng: 81.53 })).toBe(false) // ~15.6 km
  })
  it('a buyer further than 20 km needs cargo', () => {
    expect(cargoNeeded(farm, { lat: 17.0, lng: 81.53 })).toBe(true) // ~21 km
    expect(cargoNeeded(farm, { lat: 17.69, lng: 83.22 })).toBe(true) // Vizag
  })
  it('unknown buyer or farm → cargo, to be safe', () => {
    expect(cargoNeeded(farm, null)).toBe(true)
    expect(cargoNeeded(null, { lat: 16.85, lng: 81.56 })).toBe(true)
    expect(cargoNeeded(farm, { lat: 0, lng: 0 })).toBe(true)
    expect(cargoNeeded(farm, { lat: Number.NaN, lng: 81.5 })).toBe(true)
  })
})

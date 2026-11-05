import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyRetailReach, coarsePoint, normalizeRetailRates, orderTransportCharge, parseRetailReachSave, reachFor } from '@/lib/retailReach'
import { nearestPlace, nearestTown, PLACES, stateOfPincode, townByName } from '@/lib/location'

// Client decision 2026-11-05: retail produce is Local only (within the
// farmer's radius, 25 km by default) or Transportable across AP / TG for a
// fixed charge per order per state. A buyer in Gajuwaka must see a Tadipatri
// farmer's transportable produce.

const TADIPATRI = { lat: 14.9091, lng: 78.0092 }
const GAJUWAKA_BUYER = { lat: 17.69, lng: 83.21, state: 'AP' as const }
const local = { retail_reach: 'local', delivery_radius_km: null }
const transport = { retail_reach: 'transport', retail_transport_rates: { AP: 80, TG: 120 } }

describe('places', () => {
  it('names the buyer area and state', () => {
    expect(nearestPlace(17.691, 83.211)).toMatchObject({ name: 'Gajuwaka', state: 'AP' })
    expect(nearestPlace(17.495, 78.40)).toMatchObject({ name: 'Kukatpally', state: 'TG' })
    expect(nearestTown(16.8142, 81.5288)).toBe('Tadepalligudem')
  })
  it('covers both states, no duplicate names, the original towns kept', () => {
    expect(PLACES.length).toBeGreaterThan(150)
    expect(new Set(PLACES.map((p) => p.name)).size).toBe(PLACES.length)
    expect(PLACES.filter((p) => p.state === 'TG').length).toBeGreaterThan(40)
    expect(townByName('Tadepalligudem')).toMatchObject({ lat: 16.8142, lng: 81.5288 })
  })
  it('state from pincode', () => {
    expect(stateOfPincode('530026')).toBe('AP')
    expect(stateOfPincode('515411')).toBe('AP')
    expect(stateOfPincode('500072')).toBe('TG')
    expect(stateOfPincode('560001')).toBeNull()
    expect(stateOfPincode('12')).toBeNull()
  })
})

describe('who sees what', () => {
  it('Gajuwaka buyer sees a Tadipatri farmer’s transportable produce, with the AP charge', () => {
    expect(reachFor(transport, TADIPATRI, GAJUWAKA_BUYER)).toMatchObject({ show: true, kind: 'transport', charge: 80 })
  })
  it('… but not their local-only produce', () => {
    expect(reachFor(local, TADIPATRI, GAJUWAKA_BUYER)).toMatchObject({ show: false, kind: 'out_of_range' })
  })
  it('a buyer inside the radius gets it locally (25 km by default, or the farmer’s own radius)', () => {
    const near = { lat: 14.95, lng: 78.05, state: 'AP' as const }
    expect(reachFor(local, TADIPATRI, near)).toMatchObject({ show: true, kind: 'local' })
    expect(reachFor({ ...local, delivery_radius_km: 3 }, TADIPATRI, near)).toMatchObject({ show: false })
    expect(reachFor(transport, TADIPATRI, near)).toMatchObject({ kind: 'local' }) // near wins over transport
  })
  it('a state the farmer does not send to is out of range', () => {
    expect(reachFor({ retail_reach: 'transport', retail_transport_rates: { TG: 120 } }, TADIPATRI, GAJUWAKA_BUYER).show).toBe(false)
  })
  it('no buyer location: shown, delivery unknown', () => {
    expect(reachFor(local, TADIPATRI, null)).toMatchObject({ show: true, kind: 'unknown' })
  })
})

describe('saving the choice', () => {
  it('transportable needs delivery and at least one state charge (0 = free)', () => {
    expect(parseRetailReachSave({ retail_reach: 'transport', retail_transport_rates: { AP: '80' } }, 'pickup').ok).toBe(false)
    expect(parseRetailReachSave({ retail_reach: 'transport', retail_transport_rates: {} }, 'courier').ok).toBe(false)
    expect(parseRetailReachSave({ retail_reach: 'transport', retail_transport_rates: { AP: '-5' } }, 'courier').ok).toBe(false)
    expect(parseRetailReachSave({ retail_reach: 'transport', retail_transport_rates: { AP: '0', TG: '' } }, 'both')).toEqual({ ok: true, reach: 'transport', rates: { AP: 0 } })
    expect(parseRetailReachSave({ retail_reach: 'local', retail_transport_rates: { AP: 9 } }, 'pickup')).toEqual({ ok: true, reach: 'local', rates: {} })
  })
  it('a payload without the reach leaves the columns alone', () => {
    const t: Record<string, unknown> = { name: 'x', retail_transport_rates: { AP: 1 } }
    expect(applyRetailReach(t, t, 'courier')).toBeNull()
    expect(t).toEqual({ name: 'x' })
  })
  it('junk rates are dropped', () => {
    expect(normalizeRetailRates({ AP: 'x', TG: 50.4, KA: 10 })).toEqual({ TG: 50 })
  })
})

describe('the charge on one farmer’s order', () => {
  it('one parcel: the highest charge among its lines', () => {
    expect(orderTransportCharge([transport, { retail_reach: 'transport', retail_transport_rates: { AP: 60 } }], 'AP')).toBe(80)
  })
  it('null when a line does not go to that state, or no state', () => {
    expect(orderTransportCharge([{ retail_reach: 'transport', retail_transport_rates: { AP: 60 } }], 'TG')).toBeNull()
    expect(orderTransportCharge([transport], null)).toBeNull()
  })
})

describe('privacy and wiring', () => {
  it('the public farm point is a ~5 km grid, never the exact farm', () => {
    expect(coarsePoint(14.90913, 78.00921)).toEqual({ lat: 14.9, lng: 78 })
  })
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it('the feed sends the rough point, not lat / lng', () => {
    for (const p of ['src/app/api/produce/route.ts', 'src/app/api/produce/search/route.ts']) {
      expect(src(p)).toMatch(/farmAreas\(/)
      expect(src(p)).not.toMatch(/\.select\('[^']*\blat\b/)
    }
  })
  it('the migration and the schema snapshot agree', () => {
    for (const f of ['retail-reach-migration.sql', 'staging-schema.sql']) {
      const s = src(`scripts/${f}`).replace(/--.*$/gm, '')
      expect(s).toMatch(/ADD COLUMN IF NOT EXISTS retail_reach text NOT NULL DEFAULT 'local'/)
      expect(s).toMatch(/ADD COLUMN IF NOT EXISTS retail_transport_rates jsonb NOT NULL DEFAULT '\{\}'::jsonb/)
      expect(s).toMatch(/retail_reach IN \('local', 'transport'\)/)
    }
  })
  it('forms, home grid, detail pages and cart are wired', () => {
    expect(src('src/app/farmer/dashboard/page.tsx')).toMatch(/<RetailReachFields\b/)
    expect(src('src/app/moderator/listings/ListingForm.tsx')).toMatch(/<RetailReachFields\b/)
    expect(src('src/app/consumer/page.tsx')).toMatch(/useState<number \| null \| 'reach'>\('reach'\)/)
    for (const p of ['src/app/consumer/produce/[id]/page.tsx', 'src/app/consumer/harvest/[harvestId]/page.tsx']) expect(src(p)).toMatch(/transportCharge: transport\.charge/)
    expect(src('src/components/consumer/Cart.tsx')).toMatch(/deliveryType: isTransported\(it\) \? 'courier'/)
  })
})
